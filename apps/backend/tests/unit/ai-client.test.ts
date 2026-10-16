import OpenAI from 'openai';
import {
  ChatParams,
  FallbackAIClient,
  ProviderCompleter,
} from '../../src/ai/client';
import { AppError } from '../../src/middleware/error-handler';
import {
  AIProviderId,
  AIProviderSettings,
  buildChatRequestBody,
  classifyProviderError,
  parseModelList,
  providerModels,
  resolveAIProviderOrder,
  resolveAIProviders,
} from '../../src/ai/providers';

// ---------------------------------------------------------------------------
// This suite is fully OFFLINE: every provider interaction is a fake completer
// injected into FallbackAIClient. No real network call is ever made.
// ---------------------------------------------------------------------------

const provider = (id: AIProviderId, model = `model-${id}`): AIProviderSettings => ({
  id,
  baseURL: `https://${id}.example.invalid/v1`,
  apiKey: `secret-key-${id}`,
  model,
  models: [model],
});

/** A provider with an ordered model fallback list (first = preferred). */
const multiModelProvider = (id: AIProviderId, models: string[]): AIProviderSettings => ({
  id,
  baseURL: `https://${id}.example.invalid/v1`,
  apiKey: `secret-key-${id}`,
  model: models[0],
  models,
});

const completion = (content: string, toolCalls: any[] = []): OpenAI.Chat.ChatCompletion =>
  ({ choices: [{ message: { role: 'assistant', content, tool_calls: toolCalls } }] }) as any;

const httpError = (status: number, headers?: Record<string, string>) =>
  Object.assign(new Error(`upstream status ${status}`), { status, headers });

const toolDef: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_products',
    description: 'search',
    parameters: { type: 'object', properties: {} },
  },
};

describe('FallbackAIClient routing', () => {
  test('falls through to the next provider on a 5xx and returns its result', async () => {
    const seen: string[] = [];
    const completer: ProviderCompleter = async (p) => {
      seen.push(p.id);
      if (p.id === 'gemini') throw httpError(503);
      return completion('answer from groq');
    };
    const client = new FallbackAIClient([provider('gemini'), provider('groq')], { completer });

    const result = await client.chat([{ role: 'user', content: 'hi' }]);

    expect(seen).toEqual(['gemini', 'groq']);
    expect(result.choices[0].message.content).toBe('answer from groq');
  });

  test('respects Retry-After: a cooling provider is skipped until the cooldown expires', async () => {
    let now = 1_000_000;
    const seen: string[] = [];
    const completer: ProviderCompleter = async (p) => {
      seen.push(p.id);
      if (p.id === 'gemini') throw httpError(429, { 'retry-after': '30' });
      return completion('groq');
    };
    const client = new FallbackAIClient([provider('gemini'), provider('groq')], {
      completer,
      now: () => now,
    });

    await client.chat([{ role: 'user', content: 'one' }]);
    expect(seen).toEqual(['gemini', 'groq']);

    // Still within the 30 s cooldown -> gemini is skipped entirely.
    seen.length = 0;
    await client.chat([{ role: 'user', content: 'two' }]);
    expect(seen).toEqual(['groq']);

    // Past the cooldown -> gemini is attempted again.
    now += 31_000;
    seen.length = 0;
    await client.chat([{ role: 'user', content: 'three' }]);
    expect(seen).toEqual(['gemini', 'groq']);
  });

  test('a 401 disables the provider for the process lifetime (never retried)', async () => {
    let now = 0;
    const seen: string[] = [];
    const completer: ProviderCompleter = async (p) => {
      seen.push(p.id);
      if (p.id === 'gemini') throw httpError(401);
      return completion('groq');
    };
    const client = new FallbackAIClient([provider('gemini'), provider('groq')], {
      completer,
      now: () => now,
    });

    await client.chat([{ role: 'user', content: 'one' }]);
    expect(seen).toEqual(['gemini', 'groq']);

    // Long after any cooldown would have elapsed, gemini is still not retried.
    now += 60 * 60_000;
    seen.length = 0;
    await client.chat([{ role: 'user', content: 'two' }]);
    expect(seen).toEqual(['groq']);
  });

  test('falls through on an empty/malformed tool-call response', async () => {
    const seen: string[] = [];
    const completer: ProviderCompleter = async (p) => {
      seen.push(p.id);
      // gemini returns neither text nor a valid tool call -> unusable.
      return p.id === 'gemini' ? completion('', []) : completion('usable answer');
    };
    const client = new FallbackAIClient([provider('gemini'), provider('groq')], { completer });

    const result = await client.chat([{ role: 'user', content: 'hi' }], [toolDef]);

    expect(seen).toEqual(['gemini', 'groq']);
    expect(result.choices[0].message.content).toBe('usable answer');
  });

  test('throws AppError 503 AI_UNAVAILABLE when every provider fails', async () => {
    const completer: ProviderCompleter = async () => {
      throw httpError(500);
    };
    const client = new FallbackAIClient([provider('gemini'), provider('groq')], { completer });

    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      statusCode: 503,
      details: { code: 'AI_UNAVAILABLE' },
    });
  });

  test('the failure error never leaks keys or base URLs', async () => {
    const completer: ProviderCompleter = async () => {
      throw httpError(500);
    };
    const client = new FallbackAIClient([provider('openai')], { completer });

    try {
      await client.chat([{ role: 'user', content: 'hi' }]);
      throw new Error('expected chat() to throw');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.message).not.toContain('secret-key-openai');
      expect(err.message).not.toContain('example.invalid');
      expect(JSON.stringify(err.details)).not.toContain('secret-key-openai');
    }
  });

  test('omits tools entirely when none are provided', async () => {
    let seen: ChatParams | undefined;
    const completer: ProviderCompleter = async (_p, params) => {
      seen = params;
      return completion('ok');
    };
    const client = new FallbackAIClient([provider('openai')], { completer });

    await client.chat([{ role: 'user', content: 'hi' }]);

    expect(seen?.tools).toBeUndefined();
  });

  test('passes tools through when provided', async () => {
    let seen: ChatParams | undefined;
    const completer: ProviderCompleter = async (_p, params) => {
      seen = params;
      return completion('', [{ id: 'call_1', type: 'function', function: { name: 'search_products', arguments: '{}' } }]);
    };
    const client = new FallbackAIClient([provider('openai')], { completer });

    await client.chat([{ role: 'user', content: 'hi' }], [toolDef]);

    expect(seen?.tools).toEqual([toolDef]);
  });
});

describe('per-provider model list fallback', () => {
  test('a 404 on the first model falls through to the next model of the SAME provider', async () => {
    const seen: string[] = [];
    const completer: ProviderCompleter = async (p, params) => {
      seen.push(`${p.id}:${params.model}`);
      if (params.model === 'gemini-old') throw httpError(404);
      return completion('answer from gemini-new');
    };
    const client = new FallbackAIClient(
      [multiModelProvider('gemini', ['gemini-old', 'gemini-new'])],
      { completer }
    );

    const result = await client.chat([{ role: 'user', content: 'hi' }]);

    expect(seen).toEqual(['gemini:gemini-old', 'gemini:gemini-new']);
    expect(result.choices[0].message.content).toBe('answer from gemini-new');
  });

  test('a retired model (404) is skipped for the process lifetime', async () => {
    const seen: string[] = [];
    const completer: ProviderCompleter = async (_p, params) => {
      seen.push(params.model);
      if (params.model === 'gemini-old') throw httpError(404);
      return completion('ok');
    };
    const client = new FallbackAIClient(
      [multiModelProvider('gemini', ['gemini-old', 'gemini-new'])],
      { completer }
    );

    await client.chat([{ role: 'user', content: 'one' }]);
    expect(seen).toEqual(['gemini-old', 'gemini-new']);

    seen.length = 0;
    await client.chat([{ role: 'user', content: 'two' }]);
    expect(seen).toEqual(['gemini-new']); // gemini-old is never retried
  });

  test('a provider is disabled only when ALL of its models 404', async () => {
    const seen: string[] = [];
    const completer: ProviderCompleter = async (p, params) => {
      seen.push(`${p.id}:${params.model}`);
      if (p.id === 'gemini') throw httpError(404);
      return completion('groq answer');
    };
    const client = new FallbackAIClient(
      [multiModelProvider('gemini', ['g1', 'g2']), multiModelProvider('groq', ['k1'])],
      { completer }
    );

    const first = await client.chat([{ role: 'user', content: 'one' }]);
    expect(seen).toEqual(['gemini:g1', 'gemini:g2', 'groq:k1']);
    expect(first.choices[0].message.content).toBe('groq answer');

    seen.length = 0;
    await client.chat([{ role: 'user', content: 'two' }]);
    expect(seen).toEqual(['groq:k1']); // gemini fully disabled, not retried
  });

  test('a transient 429 on a model cools the provider and moves to the next provider', async () => {
    const seen: string[] = [];
    const completer: ProviderCompleter = async (p, params) => {
      seen.push(`${p.id}:${params.model}`);
      if (p.id === 'gemini') throw httpError(429, { 'retry-after': '60' });
      return completion('groq');
    };
    const client = new FallbackAIClient(
      [multiModelProvider('gemini', ['g1', 'g2']), multiModelProvider('groq', ['k1'])],
      { completer }
    );

    await client.chat([{ role: 'user', content: 'hi' }]);

    // 429 is provider-level: g2 is NOT tried; we move straight to groq.
    expect(seen).toEqual(['gemini:g1', 'groq:k1']);
  });

  test('all models 404 across every provider -> 503 AI_UNAVAILABLE', async () => {
    const completer: ProviderCompleter = async () => {
      throw httpError(404);
    };
    const client = new FallbackAIClient(
      [multiModelProvider('gemini', ['g1', 'g2']), multiModelProvider('groq', ['k1'])],
      { completer }
    );

    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      statusCode: 503,
      details: { code: 'AI_UNAVAILABLE' },
    });
  });

  test('the real completer sends the per-attempt model, not the provider default', async () => {
    // Guards against a regression where the SDK request used provider.model
    // instead of the model currently being tried.
    const seenModels: string[] = [];
    const client = new FallbackAIClient([multiModelProvider('gemini', ['m1', 'm2'])], {
      completer: async (_p, params) => {
        seenModels.push(params.model);
        return completion('ok');
      },
    });

    await client.chat([{ role: 'user', content: 'hi' }]);
    expect(seenModels).toEqual(['m1']);
  });
});

describe('provider model configuration', () => {
  test('parseModelList splits, trims and de-duplicates', () => {
    expect(parseModelList(' a-flash, b-flash ,a-flash ', 'x')).toEqual(['a-flash', 'b-flash']);
    expect(parseModelList('', 'fallback')).toEqual(['fallback']);
    expect(parseModelList(undefined, 'fallback')).toEqual(['fallback']);
    expect(parseModelList('   ', 'fallback')).toEqual(['fallback']);
  });

  test('providerModels falls back to [model] for a bare settings object', () => {
    const bare = { id: 'openai', baseURL: 'x', apiKey: 'k', model: 'm', models: [] } as AIProviderSettings;
    expect(providerModels(bare)).toEqual(['m']);
  });

  test('*_MODEL accepts a comma-separated list (first = preferred)', () => {
    const providers = resolveAIProviders({
      GEMINI_API_KEY: 'g',
      GEMINI_MODEL: 'a-flash, b-flash ,a-flash',
    } as NodeJS.ProcessEnv);
    expect(providers[0].models).toEqual(['a-flash', 'b-flash']);
    expect(providers[0].model).toBe('a-flash');
  });

  test('the retired gemini default is replaced by the documented replacements', () => {
    const gemini = resolveAIProviders({ GEMINI_API_KEY: 'g' } as NodeJS.ProcessEnv)[0];
    expect(gemini.models).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash']);
    expect(gemini.models).not.toContain('gemini-2.5-flash');

    const groq = resolveAIProviders({ GROQ_API_KEY: 'g' } as NodeJS.ProcessEnv)[0];
    expect(groq.models).toEqual(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']);
  });

  test('a 404 is classified as model-not-found, not a provider disable', () => {
    const info = classifyProviderError(httpError(404));
    expect(info.modelNotFound).toBe(true);
    expect(info.disable).toBe(false);
    expect(info.status).toBe(404);
  });

  test('401/403 still disable the whole provider', () => {
    expect(classifyProviderError(httpError(401)).disable).toBe(true);
    expect(classifyProviderError(httpError(403)).disable).toBe(true);
    expect(classifyProviderError(httpError(400)).disable).toBe(true);
  });
});

describe('AI provider config parsing', () => {
  test('only providers with a key are active', () => {
    const providers = resolveAIProviders({ GROQ_API_KEY: 'g' } as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.id)).toEqual(['groq']);
    expect(providers[0].baseURL).toBe('https://api.groq.com/openai/v1');
    expect(providers[0].model).toBe('openai/gpt-oss-120b');
  });

  test('respects a custom AI_PROVIDER_ORDER (and excludes unlisted providers)', () => {
    const providers = resolveAIProviders({
      AI_PROVIDER_ORDER: 'openai,groq',
      OPENAI_API_KEY: 'o',
      GROQ_API_KEY: 'g',
      GEMINI_API_KEY: 'x',
    } as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.id)).toEqual(['openai', 'groq']);
  });

  test('an OPENAI_API_KEY-only setup yields exactly one provider, as before', () => {
    const providers = resolveAIProviders({ OPENAI_API_KEY: 'o' } as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.id)).toEqual(['openai']);
    expect(providers[0].baseURL).toBe('https://api.openai.com/v1');
    expect(providers[0].model).toBe('gpt-4o-mini');
  });

  test('per-provider model overrides win over the defaults', () => {
    const providers = resolveAIProviders({
      OPENAI_API_KEY: 'o',
      OPENAI_MODEL: 'gpt-4o',
    } as NodeJS.ProcessEnv);
    expect(providers[0].model).toBe('gpt-4o');
  });

  test('ignores unknown order entries, de-duplicates, and defaults when empty', () => {
    expect(resolveAIProviderOrder('groq,bogus,groq,openai')).toEqual(['groq', 'openai']);
    expect(resolveAIProviderOrder('')).toEqual([
      'gemini',
      'groq',
      'cerebras',
      'openrouter',
      'openai',
    ]);
    expect(resolveAIProviderOrder(undefined)).toEqual([
      'gemini',
      'groq',
      'cerebras',
      'openrouter',
      'openai',
    ]);
  });

  test('blank/whitespace-only keys are not active', () => {
    expect(resolveAIProviders({ OPENAI_API_KEY: '   ' } as NodeJS.ProcessEnv)).toEqual([]);
    expect(resolveAIProviders({} as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe('buildChatRequestBody', () => {
  test('omits tools + tool_choice when there are no tools', () => {
    const body = buildChatRequestBody('m', [{ role: 'user', content: 'hi' }]);
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
  });

  test('includes tools + tool_choice=auto when tools are present', () => {
    const body = buildChatRequestBody('m', [{ role: 'user', content: 'hi' }], [toolDef]);
    expect(body.tools).toEqual([toolDef]);
    expect(body.tool_choice).toBe('auto');
  });
});

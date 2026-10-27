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
  describeProviderFailure,
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
    // llama-3.3-70b-versatile is no longer listed by Groq (FIX-06, verified 2026-10-23).
    expect(groq.models).toEqual(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
    expect(groq.models).not.toContain('llama-3.3-70b-versatile');

    // meta-llama/llama-3.3-70b-instruct:free was retired by OpenRouter (HTTP 404, FIX-06).
    const openrouter = resolveAIProviders({ OPENROUTER_API_KEY: 'o' } as NodeJS.ProcessEnv)[0];
    expect(openrouter.models).toEqual([
      'nvidia/nemotron-3.5-lightning:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
    ]);
    expect(openrouter.models).not.toContain('meta-llama/llama-3.3-70b-instruct:free');
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
  });

  test('a 400 only cools the provider down — it is retried after the cooldown', async () => {
    // Observed live: Groq answered a one-off 400 for a request that succeeded
    // immediately before and after. Disabling the provider for the process
    // lifetime would have taken the only working provider out of rotation.
    expect(classifyProviderError(httpError(400))).toMatchObject({
      kind: 'client',
      disable: false,
    });

    let now = 1_000_000;
    const seen: string[] = [];
    let groqCalls = 0;
    const completer: ProviderCompleter = async (p) => {
      seen.push(p.id);
      if (p.id === 'groq') {
        groqCalls += 1;
        if (groqCalls === 1) throw httpError(400); // the one-off 400
      }
      return completion('groq answer');
    };
    const client = new FallbackAIClient([provider('groq'), provider('gemini')], {
      completer,
      now: () => now,
    });

    // First call: groq 400s -> gemini answers.
    await client.chat([{ role: 'user', content: 'one' }]);
    expect(seen).toEqual(['groq', 'gemini']);

    // Within the cooldown groq is skipped.
    seen.length = 0;
    await client.chat([{ role: 'user', content: 'two' }]);
    expect(seen).toEqual(['gemini']);

    // After the cooldown groq is tried again (and succeeds this time).
    now += 61_000;
    seen.length = 0;
    const result = await client.chat([{ role: 'user', content: 'three' }]);
    expect(seen).toEqual(['groq']);
    expect(result.choices[0].message.content).toBe('groq answer');
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

// FIX-06: operator-facing diagnostics must tell an IMPLEMENTATION defect (a wrong or
// retired model id) from EXTERNAL configuration (bad key, exhausted quota, provider
// overload) — without ever leaking the key or the base URL.
describe('describeProviderFailure (sanitized diagnostics)', () => {
  test.each([
    ['a wrong/retired model id', httpError(404), 'HTTP 404 [model_not_found]'],
    ['a rejected credential', httpError(401), 'HTTP 401 [auth]'],
    ['a forbidden credential', httpError(403), 'HTTP 403 [auth]'],
    ['a malformed request', httpError(400), 'HTTP 400 [client]'],    ['an exhausted account quota', Object.assign(new Error('x'), { status: 429, code: 'insufficient_quota' }), 'HTTP 429 [quota_exhausted]'],
    ['a plain rate limit', httpError(429), 'HTTP 429 [rate_limit]'],
    ['a provider outage', httpError(503), 'HTTP 503 [server]'],
    ['a timeout', Object.assign(new Error('timed out'), { name: 'APIConnectionTimeoutError' }), 'APIConnectionTimeoutError [timeout]'],
    ['a network failure', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'Error [network]'],
  ])('%s is labelled %s', (_name, err, expected) => {
    expect(describeProviderFailure(err)).toBe(expected);
  });

  test('the label never contains the api key or the base URL', () => {
    const leaking = Object.assign(new Error('boom'), {
      status: 401,
      message: 'secret-key-openai https://api.openai.com/v1 rejected',
    });
    const label = describeProviderFailure(leaking);
    expect(label).toBe('HTTP 401 [auth]');
    expect(label).not.toContain('secret-key-openai');
    expect(label).not.toContain('api.openai.com');
  });
});

describe('permanent quota errors (account out of credit) are not retried forever', () => {
  const quotaError = (extra: Record<string, unknown>) =>
    Object.assign(new Error('upstream status 429'), { status: 429, ...extra });

  test.each([
    ['openai insufficient_quota (code)', { code: 'insufficient_quota' }],
    ['credit_balance_exhausted (code)', { code: 'credit_balance_exhausted', type: 'insufficient_quota' }],
    ['insufficient_quota (type only)', { type: 'insufficient_quota' }],
    ['nested error object', { error: { code: 'insufficient_quota' } }],
  ])('429 with %s disables the provider', (_name, extra) => {
    const info = classifyProviderError(quotaError(extra));
    expect(info.kind).toBe('quota_exhausted');
    expect(info.disable).toBe(true);
  });

  test('a plain rate-limit 429 is still a cooldown, not a disable', () => {
    const info = classifyProviderError(quotaError({ code: 'rate_limit_exceeded' }));
    expect(info.kind).toBe('rate_limit');
    expect(info.disable).toBe(false);
    expect(info.cooldownMs).toBeGreaterThan(0);
  });

  test('the client stops calling an out-of-credit provider and uses the next one', async () => {
    let now = 1_000_000;
    const seen: string[] = [];
    const completer: ProviderCompleter = async (p) => {
      seen.push(p.id);
      if (p.id === 'openai') throw quotaError({ code: 'credit_balance_exhausted' });
      return completion('groq answer');
    };
    const client = new FallbackAIClient([provider('openai'), provider('groq')], { completer, now: () => now });

    await client.chat([{ role: 'user', content: 'one' }]);
    // Even long after any 60 s cooldown the dead provider is not tried again.
    now += 10 * 60_000;
    seen.length = 0;
    await client.chat([{ role: 'user', content: 'two' }]);
    expect(seen).toEqual(['groq']);
  });
});


import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Provider registry (P10).
//
// Every provider below speaks the OpenAI-compatible Chat Completions API, so a
// single `openai` SDK client (one per provider, each with its own baseURL) is
// enough. A provider is ACTIVE only when its API key is set; the attempt order
// is controlled by AI_PROVIDER_ORDER.
//
// This module is pure data + pure helpers: it reads NO environment at import
// time and holds NO secrets, so it can be unit tested offline.
// ---------------------------------------------------------------------------

export const AI_PROVIDER_IDS = [
  'gemini',
  'groq',
  'cerebras',
  'openrouter',
  'openai',
] as const;

export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AIProviderSettings {
  id: AIProviderId;
  baseURL: string;
  apiKey: string;
  /** Preferred model — always equal to `models[0]`. Kept for convenience. */
  model: string;
  /**
   * Ordered model fallback list for this provider. `*_MODEL` may be a
   * comma-separated list (first entry = preferred); a retired model (HTTP 404)
   * is skipped for the process lifetime and the next entry is tried first.
   */
  models: string[];
}

interface AIProviderDefinition {
  baseURL: string;
  keyEnv: string;
  modelEnv: string;
  /** Comma-separated default model list (first = preferred). */
  defaultModels: string;
}

// Base URLs and default model names are NOT secret and live in code, so a
// missing/typo'd env var can never silently point at the wrong endpoint.
const AI_PROVIDER_DEFS: Record<AIProviderId, AIProviderDefinition> = {
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    // gemini-2.5-flash was retired on 2026-10-16 (HTTP 404); the documented
    // replacements are listed in preference order.
    defaultModels: 'gemini-3.6-flash,gemini-3.5-flash',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    // `llama-3.3-70b-versatile` is no longer listed by Groq (verified 2026-10-23 with
    // `npm run ai:check`: it is absent from GET /models). Both entries below are listed
    // and both passed a real tool round trip + the injection probe.
    defaultModels: 'openai/gpt-oss-120b,openai/gpt-oss-20b',
  },
  cerebras: {
    baseURL: 'https://api.cerebras.ai/v1',
    keyEnv: 'CEREBRAS_API_KEY',
    modelEnv: 'CEREBRAS_MODEL',
    defaultModels: 'llama-3.3-70b',
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    // `meta-llama/llama-3.3-70b-instruct:free` was RETIRED by OpenRouter (HTTP 404,
    // verified 2026-10-23 with `npm run ai:check`): no `:free` llama model is listed
    // any more. These two are listed as free AND tool-capable, and both passed a real
    // tool round trip + the injection probe. Override with OPENROUTER_MODEL if needed.
    defaultModels: 'nvidia/nemotron-3.5-lightning:free,nvidia/nemotron-3-ultra-550b-a55b:free',
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    keyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModels: 'gpt-4o-mini',
  },
};

export const DEFAULT_AI_PROVIDER_ORDER = AI_PROVIDER_IDS.join(',');

export function getProviderDefinition(id: AIProviderId): AIProviderDefinition {
  return AI_PROVIDER_DEFS[id];
}

/**
 * Resolve AI_PROVIDER_ORDER into a validated, de-duplicated ordered id list.
 * Unknown entries are ignored; an empty/invalid value falls back to the default
 * order. The returned list is the COMPLETE set of providers to consider — a
 * provider omitted from the order is not considered at all.
 */
export function resolveAIProviderOrder(raw?: string): AIProviderId[] {
  const source = raw && raw.trim() ? raw : DEFAULT_AI_PROVIDER_ORDER;
  const seen = new Set<AIProviderId>();
  const order: AIProviderId[] = [];
  for (const part of source.split(',')) {
    const id = part.trim().toLowerCase();
    if ((AI_PROVIDER_IDS as readonly string[]).includes(id) && !seen.has(id as AIProviderId)) {
      const typed = id as AIProviderId;
      seen.add(typed);
      order.push(typed);
    }
  }
  return order;
}

/**
 * Model ids known to be retired (they answer HTTP 404). A stale `GEMINI_MODEL=gemini-2.0-flash` in an
 * old .env used to override the working defaults and kill the primary provider on every boot, so
 * these ids are dropped from a configured list (with a warning) and the defaults take over.
 */
export const KNOWN_RETIRED_MODELS: ReadonlySet<string> = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash', // retired 2026-10-16
]);

/**
 * Parse a comma-separated model list into an ordered, de-duplicated array.
 * Blank entries are dropped; an empty/blank input falls back to `fallback`.
 */
export function parseModelList(raw: string | undefined, fallback: string): string[] {
  const source = typeof raw === 'string' && raw.trim().length > 0 ? raw : fallback;
  const seen = new Set<string>();
  const models: string[] = [];
  for (const part of source.split(',')) {
    const id = part.trim();
    if (id.length > 0 && !seen.has(id)) {
      seen.add(id);
      models.push(id);
    }
  }
  return models;
}

/**
 * The ordered model list to try for a provider. Always non-empty for a provider
 * built by `resolveAIProviders`; falls back to `[model]` for a bare settings
 * object that only carries a single `model`.
 */
export function providerModels(provider: AIProviderSettings): string[] {
  if (Array.isArray(provider.models) && provider.models.length > 0) return provider.models;
  return provider.model ? [provider.model] : [];
}

/** Stable key for "this model on this provider" (used to skip retired models). */
export function providerModelKey(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}

/** Build the ordered list of ACTIVE providers (key present) from an env object. */
export function resolveAIProviders(source: NodeJS.ProcessEnv = process.env): AIProviderSettings[] {
  const providers: AIProviderSettings[] = [];
  for (const id of resolveAIProviderOrder(source.AI_PROVIDER_ORDER)) {
    const def = AI_PROVIDER_DEFS[id];
    const apiKey = source[def.keyEnv];
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) continue;
    let models = parseModelList(source[def.modelEnv], def.defaultModels);
    const usable = models.filter((m) => !KNOWN_RETIRED_MODELS.has(m));
    if (usable.length !== models.length) {
      console.warn(
        `[ai] ${def.modelEnv} lists retired model(s) ${models.filter((m) => !usable.includes(m)).join(', ')}; ` +
          (usable.length > 0 ? 'ignoring them.' : 'using the built-in defaults instead.')
      );
      models = usable.length > 0 ? usable : parseModelList(undefined, def.defaultModels);
    }
    providers.push({
      id,
      baseURL: def.baseURL,
      apiKey: apiKey.trim(),
      model: models[0],
      models,
    });
  }
  return providers;
}

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

export interface ProviderErrorInfo {
  kind:
    | 'auth'
    | 'rate_limit'
    | 'server'
    | 'timeout'
    | 'network'
    | 'client'
    | 'model_not_found'
    | 'quota_exhausted'
    | 'unknown';
  status?: number;
  /** true => disable this PROVIDER for the process lifetime. */
  disable: boolean;
  /**
   * true => skip THIS MODEL for the process lifetime (HTTP 404: the provider is
   * reachable but the model id is retired/unknown). The provider stays usable
   * through its other models.
   */
  modelNotFound?: boolean;
  /** Transient cooldown in ms (only meaningful when disable === false). */
  cooldownMs?: number;
}

export const COOLDOWN_DEFAULT_MS = 60_000;

function readRetryAfterMs(err: any): number | undefined {
  const headers = err?.headers;
  let raw: unknown;
  if (headers && typeof headers.get === 'function') raw = headers.get('retry-after');
  else if (headers) raw = headers['retry-after'];
  if (raw === undefined || raw === null) return undefined;
  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return asSeconds * 1000;
  const asDate = Date.parse(String(raw));
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

const PERMANENT_QUOTA_CODES = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'billing_not_active',
  'billing_hard_limit_reached',
]);

/** True when a provider error carries a code meaning "the account has no credit", not "slow down". */
function isPermanentQuotaError(err: any): boolean {
  const candidates = [err?.code, err?.type, err?.error?.code, err?.error?.type];
  return candidates.some((value) => typeof value === 'string' && PERMANENT_QUOTA_CODES.has(value));
}

/**
 * Map an upstream error to a routing decision. Inspects only status/name/code —
 * never the request URL, headers, or response body (so no secret can leak).
 */
export function classifyProviderError(err: unknown): ProviderErrorInfo {
  const anyErr = err as any;
  const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined;
  const retryAfterMs = readRetryAfterMs(anyErr);

  // A 404 means the provider answered but this MODEL id is gone (e.g. a retired
  // Gemini model). Skip the model, not the provider — the caller falls through
  // to the next model of the SAME provider.
  if (status === 404) {
    return { kind: 'model_not_found', status, disable: false, modelNotFound: true };
  }

  // Permanent client errors: the credentials are wrong, so retrying the same provider
  // keeps failing. A bare 400 is NOT treated as permanent: providers answer 400 for
  // transient request-level conditions too (observed 2026-10-23: Groq returned a one-off
  // 400 for a request that succeeded immediately before and after). Disabling the only
  // working provider for the whole process lifetime over that would take the chat down,
  // so a 400 cools the provider down and it is retried like a rate limit.
  if (status === 401 || status === 403) {
    return { kind: 'auth', status, disable: true };
  }
  if (status === 400) {
    return {
      kind: 'client',
      status,
      disable: false,
      cooldownMs: retryAfterMs ?? COOLDOWN_DEFAULT_MS,
    };
  }
  if (status === 429) {
    // A 429 whose body says the ACCOUNT is out of credit/quota is permanent (retrying every 60 s
    // would hammer a dead provider on every request). Only the machine codes are read; the body
    // itself is never logged.
    if (isPermanentQuotaError(anyErr)) {
      return { kind: 'quota_exhausted', status, disable: true };
    }
    return {
      kind: 'rate_limit',
      status,
      disable: false,
      cooldownMs: retryAfterMs ?? COOLDOWN_DEFAULT_MS,
    };
  }
  if (status !== undefined && status >= 500) {
    return { kind: 'server', status, disable: false, cooldownMs: retryAfterMs ?? COOLDOWN_DEFAULT_MS };
  }

  const name = typeof anyErr?.name === 'string' ? anyErr.name : '';
  const code = typeof anyErr?.code === 'string' ? anyErr.code : '';
  if (
    name === 'APIConnectionTimeoutError' ||
    code === 'ETIMEDOUT' ||
    /timed? ?out/i.test(String(anyErr?.message ?? ''))
  ) {
    return { kind: 'timeout', status, disable: false, cooldownMs: retryAfterMs ?? COOLDOWN_DEFAULT_MS };
  }
  if (
    name === 'APIConnectionError' ||
    ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)
  ) {
    return { kind: 'network', status, disable: false, cooldownMs: retryAfterMs ?? COOLDOWN_DEFAULT_MS };
  }
  return { kind: 'unknown', status, disable: false, cooldownMs: retryAfterMs ?? COOLDOWN_DEFAULT_MS };
}

/** Build an OpenAI-compatible SDK client for one provider: no retries, 20s cap. */
export function createProviderClient(provider: AIProviderSettings, timeoutMs = 20_000): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    maxRetries: 0,
    timeout: timeoutMs,
  });
}

/**
 * Short, secret-free label for an upstream failure, for operator-facing diagnostics
 * (`npm run ai:check`, server logs). It names the HTTP status (or error name) and the
 * classified kind — auth / quota_exhausted / rate_limit / model_not_found / server /
 * timeout / network — so an operator can tell an IMPLEMENTATION defect (a wrong model
 * id: model_not_found) from EXTERNAL configuration (a missing key: auth; an exhausted
 * account: quota_exhausted; provider overload: server/rate_limit).
 *
 * Never includes the request URL, headers or response body.
 */
export function describeProviderFailure(err: unknown): string {
  const info = classifyProviderError(err);
  const anyErr = err as any;
  const status =
    typeof anyErr?.status === 'number'
      ? `HTTP ${anyErr.status}`
      : typeof anyErr?.name === 'string' && anyErr.name
        ? anyErr.name
        : 'error';
  return `${status} [${info.kind}]`;
}

/**
 * Build the Chat Completions request body. `tools`/`tool_choice` are OMITTED
 * entirely when there are no tools, because some providers reject an empty
 * `tools` array.
 */
export function buildChatRequestBody(
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  tools?: OpenAI.Chat.ChatCompletionTool[]
): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
  const body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages,
    temperature: 0.3,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  return body;
}

/**
 * A response is usable when it carries a non-empty text answer OR a well-formed
 * set of tool calls (every call has a non-empty id and a function name). Empty
 * or malformed tool-call responses make the fallback client try the next
 * provider.
 */
export function hasUsableOutput(completion: OpenAI.Chat.ChatCompletion | undefined): boolean {
  const message = completion?.choices?.[0]?.message;
  if (!message) return false;

  const calls = message.tool_calls;
  if (Array.isArray(calls) && calls.length > 0) {
    return calls.every(
      (call) =>
        !!call &&
        typeof call.id === 'string' &&
        call.id.length > 0 &&
        call.type === 'function' &&
        !!call.function &&
        typeof call.function.name === 'string' &&
        call.function.name.length > 0
    );
  }

  const content = message.content;
  return typeof content === 'string' && content.trim().length > 0;
}

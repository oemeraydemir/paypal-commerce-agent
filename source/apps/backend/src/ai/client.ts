import OpenAI from 'openai';
import { env } from '../config/environment';
import { AppError } from '../middleware/error-handler';
import {
  AIProviderSettings,
  COOLDOWN_DEFAULT_MS,
  buildChatRequestBody,
  classifyProviderError,
  createProviderClient,
  hasUsableOutput,
  providerModelKey,
  providerModels,
} from './providers';

// The AI client surface used across the app (service + Ops Copilot). Kept
// deliberately small and provider-agnostic: callers only see a ChatCompletion.
export interface AIClient {
  chat(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools?: OpenAI.Chat.ChatCompletionTool[]
  ): Promise<OpenAI.Chat.ChatCompletion>;
}

export interface ChatParams {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
}

// Injectable so tests stay fully offline (no real network calls).
export type ProviderCompleter = (
  provider: AIProviderSettings,
  params: ChatParams
) => Promise<OpenAI.Chat.ChatCompletion>;

export interface FallbackAIClientOptions {
  completer?: ProviderCompleter;
  /** Clock injection for deterministic cooldown tests. */
  now?: () => number;
  timeoutMs?: number;
}

const AI_UNAVAILABLE_MESSAGE =
  'AI is temporarily at capacity. Please try again or use the scenario buttons.';

/**
 * Tries each active provider in order until one returns a usable completion.
 *
 * Routing rules:
 *  - 404 (model retired/unknown)           -> skip THAT MODEL for the process
 *    lifetime and try the next model of the SAME provider first. A provider is
 *    disabled only once every one of its models has 404'd.
 *  - 429 / 5xx / timeout / network error   -> cooldown that provider
 *    (Retry-After seconds when present, otherwise 60 s) and try the next.
 *  - 400 / 401 / 403                       -> disable that provider for the
 *    process lifetime (the request or credentials are wrong) and try the next.
 *  - empty / malformed tool-call response  -> cooldown and try the next.
 *  - all providers exhausted               -> AppError 503 AI_UNAVAILABLE.
 *
 * Logs only the provider NAME, model id, and HTTP status/kind — never keys, base
 * URLs, or upstream bodies.
 */
export class FallbackAIClient implements AIClient {
  private readonly providers: AIProviderSettings[];
  private readonly completer: ProviderCompleter;
  private readonly now: () => number;
  private readonly disabled = new Set<string>();
  private readonly disabledModels = new Set<string>();
  private readonly cooldownUntil = new Map<string, number>();

  constructor(providers: AIProviderSettings[], options: FallbackAIClientOptions = {}) {
    this.providers = providers;
    this.now = options.now ?? (() => Date.now());

    const timeoutMs = options.timeoutMs ?? 20_000;
    const clientCache = new Map<string, OpenAI>();
    this.completer =
      options.completer ??
      ((provider, params) => {
        let client = clientCache.get(provider.id);
        if (!client) {
          client = createProviderClient(provider, timeoutMs);
          clientCache.set(provider.id, client);
        }
        return client.chat.completions.create(
          buildChatRequestBody(params.model, params.messages, params.tools)
        );
      });
  }

  /** Provider ids this client can route to, in attempt order (names only). */
  providerIds(): string[] {
    return this.providers.map((provider) => provider.id);
  }

  private isProviderSkipped(id: string): boolean {
    if (this.disabled.has(id)) return true;
    const until = this.cooldownUntil.get(id);
    return until !== undefined && this.now() < until;
  }

  async chat(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools?: OpenAI.Chat.ChatCompletionTool[]
  ): Promise<OpenAI.Chat.ChatCompletion> {
    const toolsProvided = Array.isArray(tools) && tools.length > 0;

    for (const provider of this.providers) {
      if (this.isProviderSkipped(provider.id)) continue;

      const models = providerModels(provider);

      for (const model of models) {
        if (this.disabledModels.has(providerModelKey(provider.id, model))) continue;

        try {
          const completion = await this.completer(provider, {
            model,
            messages,
            tools: toolsProvided ? tools : undefined,
          });

          if (!hasUsableOutput(completion)) {
            console.warn(`[ai] provider ${provider.id} returned an unusable response; trying next`);
            this.cooldownUntil.set(provider.id, this.now() + COOLDOWN_DEFAULT_MS);
            break; // next provider
          }

          return completion;
        } catch (err) {
          const info = classifyProviderError(err);
          if (info.modelNotFound) {
            this.disabledModels.add(providerModelKey(provider.id, model));
            console.warn(`[ai] model '${model}' on provider ${provider.id} skipped (status 404)`);
            continue; // next model of the SAME provider
          }
          if (info.disable) {
            this.disabled.add(provider.id);
            console.warn(`[ai] provider ${provider.id} disabled (status ${info.status ?? 'n/a'})`);
            break; // next provider
          }
          this.cooldownUntil.set(
            provider.id,
            this.now() + (info.cooldownMs ?? COOLDOWN_DEFAULT_MS)
          );
          console.warn(
            `[ai] provider ${provider.id} cooling down (status ${info.status ?? info.kind})`
          );
          break; // next provider
        }
      }

      // Every model of this provider has 404'd -> the provider is done for good.
      if (
        models.length > 0 &&
        models.every((model) => this.disabledModels.has(providerModelKey(provider.id, model)))
      ) {
        this.disabled.add(provider.id);
        console.warn(`[ai] provider ${provider.id} disabled (all models unavailable)`);
      }
    }

    throw new AppError(503, AI_UNAVAILABLE_MESSAGE, { code: 'AI_UNAVAILABLE' });
  }
}

/** Build the process-wide client from the active providers in the environment. */
export function buildAIClient(): FallbackAIClient {
  return new FallbackAIClient(env.ai?.providers ?? []);
}

export const aiClient: AIClient = buildAIClient();

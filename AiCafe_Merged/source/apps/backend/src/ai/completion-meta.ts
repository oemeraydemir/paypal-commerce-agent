/** Which provider/model produced a completion (names only — never keys or bodies). */
export interface AICompletionMeta {
  provider: string;
  model: string;
  /** true when an earlier provider/model was tried (and failed) before this one answered. */
  fallback: boolean;
}

const META_KEY = '__aiMeta';

export function attachCompletionMeta<T extends object>(completion: T, meta: AICompletionMeta): T {
  Object.defineProperty(completion, META_KEY, { value: meta, enumerable: false, configurable: true });
  return completion;
}

export function getCompletionMeta(completion: unknown): AICompletionMeta | undefined {
  return (completion as any)?.[META_KEY];
}


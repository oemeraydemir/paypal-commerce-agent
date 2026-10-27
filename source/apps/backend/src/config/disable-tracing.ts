/**
 * LangSmith tracing guard.
 *
 * `npm audit` reports advisories in `langsmith` (a transitive dependency of @paypal/agent-toolkit:
 * GHSA-v34v-rq6j-cj6p SSRF via tracing header injection, GHSA-fw9q-39r9-c252 prototype pollution).
 * Fixing them needs a @langchain/core major upgrade that the toolkit does not support yet. These
 * code paths are only exercised when LangSmith tracing/endpoints are configured, and this app never
 * uses them. This guard removes the precondition: tracing/endpoint variables are deleted from the
 * process environment before any library can read them. Only variable NAMES are ever logged.
 */
export const TRACING_ENV_VARS = [
  'LANGCHAIN_TRACING',
  'LANGCHAIN_TRACING_V2',
  'LANGSMITH_TRACING',
  'LANGSMITH_TRACING_V2',
  'LANGCHAIN_ENDPOINT',
  'LANGSMITH_ENDPOINT',
  'LANGCHAIN_CALLBACKS_BACKGROUND',
] as const;

export function disableLangSmithTracing(env: NodeJS.ProcessEnv = process.env): string[] {
  const removed: string[] = [];
  for (const name of TRACING_ENV_VARS) {
    if (env[name] !== undefined) {
      delete env[name];
      removed.push(name);
    }
  }
  if (removed.length > 0) {
    console.warn(
      `[security] Ignoring LangSmith tracing variables (${removed.join(', ')}): tracing is disabled on this deployment.`
    );
  }
  return removed;
}

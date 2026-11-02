/**
 * Turns anything that can be thrown into a readable string for logs.
 *
 * `${err?.message ?? err}` prints "[object Object]" for a thrown plain object
 * (SDKs and HTTP clients do throw those), which hides the actual failure.
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
    try {
      return JSON.stringify(err);
    } catch {
      return Object.prototype.toString.call(err);
    }
  }
  return String(err);
}

/**
 * Reads PayPal's machine-readable issue code (e.g. ORDER_NOT_APPROVED) from a thrown error.
 *
 * The PayPal server SDK throws an ApiError/CustomError whose payload is NOT at `err.details`:
 *   { statusCode, headers, body: '<json string>', result: { name, details: [{ issue }] } }
 * Reading `err.details[0].issue` (as the route once did) is always undefined for a real SDK error,
 * which silently disabled every capture branch. Sources are tried in order of reliability; the
 * legacy `err.details` shape is kept because some test doubles and older wrappers use it.
 */
export function extractPayPalIssue(err: any): string | undefined {
  const fromList = (details: unknown): string | undefined => {
    if (!Array.isArray(details)) return undefined;
    for (const entry of details) {
      const issue = entry?.issue;
      if (typeof issue === 'string' && issue.length > 0) return issue;
    }
    return undefined;
  };

  const direct = fromList(err?.result?.details);
  if (direct) return direct;

  const body = err?.body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      const fromBody = fromList(parsed?.details);
      if (fromBody) return fromBody;
    } catch {
      // not JSON: ignore
    }
  } else if (body && typeof body === 'object') {
    const fromBody = fromList((body as any).details);
    if (fromBody) return fromBody;
  }

  return fromList(err?.details);
}

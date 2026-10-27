/**
 * Which kind of AI prepared the cart in this session.
 *
 * AI_ASSISTED — the storefront chat assistant helped a human shopper (the human still
 *               owns the session and approves the payment).
 * AI_AGENT    — an external agent acting over the MCP server prepared the cart.
 *
 * The value is set by the trusted server boundary that observed the preparation
 * (routes/ai.ts or routes/mcp.ts) and is NEVER taken from the client.
 */
export type AIPreparedOrigin = 'AI_ASSISTED' | 'AI_AGENT';

const aiPreparedSessions = new Map<string, AIPreparedOrigin>();

export function markSessionAIPrepared(sessionId: string, origin: AIPreparedOrigin): void {
  aiPreparedSessions.set(sessionId, origin);
}

/// Reads which AI prepared this session's cart WITHOUT consuming the marker.
/// Used by the order-creation policy evaluation so a BLOCKed request does not
/// consume the marker (B5).
export function peekAIPreparedSession(sessionId: string): AIPreparedOrigin | undefined {
  return aiPreparedSessions.get(sessionId);
}

export function consumeAIPreparedSession(sessionId: string): AIPreparedOrigin | undefined {
  const marked = aiPreparedSessions.get(sessionId);
  // S10 (R29): actually consume (clear) the marker on read. Without this, a
  // second /orders/create in the same session would re-inherit the stale
  // origin. The marker is a one-time attribution token.
  aiPreparedSessions.delete(sessionId);
  return marked;
}

export function clearAIPreparedSession(sessionId: string): void {
  aiPreparedSessions.delete(sessionId);
}

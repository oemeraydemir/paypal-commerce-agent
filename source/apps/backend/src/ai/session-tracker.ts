const aiPreparedSessions = new Map<string, boolean>();

export function markSessionAIPrepared(sessionId: string): void {
  aiPreparedSessions.set(sessionId, true);
}

/// Reads whether this session has a prepared AI cart WITHOUT consuming the
/// marker. Used by the order-creation policy evaluation so a BLOCKed request
/// does not consume the marker (B5).
export function peekAIPreparedSession(sessionId: string): boolean {
  return aiPreparedSessions.get(sessionId) ?? false;
}

export function consumeAIPreparedSession(sessionId: string): boolean {
  const marked = aiPreparedSessions.get(sessionId) ?? false;
  // S10 (R29): actually consume (clear) the marker on read. Without this, a
  // second /orders/create in the same session would re-inherit the stale
  // AI_AGENT origin. The marker is a one-time attribution token.
  aiPreparedSessions.delete(sessionId);
  return marked;
}

export function clearAIPreparedSession(sessionId: string): void {
  aiPreparedSessions.delete(sessionId);
}

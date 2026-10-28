/**
 * When the AI is unavailable mid-conversation, the shopper may answer an earlier AI "Options:"
 * list with a bare number ("1"). The rule-based planner cannot interpret a bare number, so this
 * resolves it to the option's title from the most recent assistant message. Only the title text
 * is used; prices, totals and policy are still decided by the server afterwards.
 */
export function resolveNumberedChoice(
  message: string,
  history: ReadonlyArray<{ role: string; content?: unknown }>
): string | null {
  const m = /^\s*([1-9])\s*[.)]?\s*$/.exec(message);
  if (!m) return null;
  const n = Number(m[1]);

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.role !== 'assistant' || typeof entry.content !== 'string') continue;
    // Only the latest assistant message counts: an older list is stale.
    const line = new RegExp(`^\\s*(?:\\*\\*)?${n}[.)]\\s*(.+)$`, 'm').exec(entry.content);
    if (!line) return null;
    const title = line[1]
      .replace(/\*\*/g, '')
      .split(/\s+[-–—:]\s+/)[0]
      .trim();
    return title.length >= 3 ? title : null;
  }
  return null;
}

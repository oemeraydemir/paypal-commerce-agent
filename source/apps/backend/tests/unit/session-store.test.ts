import {
  SessionStore,
  SessionLimitError,
  userIdForSessionId,
  publicSessionRef,
} from '../../src/session/session-store';

const HOUR = 60 * 60 * 1000;
const opts = () => ({
  idleTtlMs: 2 * HOUR,
  maxAgeMs: 24 * HOUR,
  maxActive: 3,
  createPerIpPerHour: 2,
});

describe('SessionStore', () => {
  test('issues a random server-side id + token; verify needs BOTH to match', () => {
    const store = new SessionStore(opts());
    const a = store.issue('1.1.1.1');
    const b = store.issue('2.2.2.2');
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.sessionToken).not.toBe(b.sessionToken);
    expect(a.sessionToken.length).toBeGreaterThanOrEqual(40);

    expect(store.verify(a.sessionId, a.sessionToken)?.sessionId).toBe(a.sessionId);
    expect(store.verify(a.sessionId, b.sessionToken)).toBeNull(); // someone else's token
    expect(store.verify(a.sessionId, '')).toBeNull();
    expect(store.verify('invented-by-client', a.sessionToken)).toBeNull();
  });

  test('the token is never stored in clear text', () => {
    const store = new SessionStore(opts());
    const a = store.issue('1.1.1.1');
    const record = (store as any).sessions.get(a.sessionId);
    expect(JSON.stringify(record)).not.toContain(a.sessionToken);
    expect(record.tokenHash).toBeInstanceOf(Buffer);
    expect(record.tokenHash.length).toBe(32);
  });

  test('idle TTL and absolute max age both expire a session', () => {
    const store = new SessionStore(opts());
    const t0 = 1_000_000;
    const idle = store.issue('ip-a', t0);
    expect(store.verify(idle.sessionId, idle.sessionToken, t0 + 2 * HOUR + 1)).toBeNull();
    expect(store.has(idle.sessionId)).toBe(false);

    const busy = store.issue('ip-b', t0);
    // Kept alive by activity every hour ...
    for (let h = 1; h <= 24; h++) {
      expect(store.verify(busy.sessionId, busy.sessionToken, t0 + h * HOUR)).not.toBeNull();
    }
    // ... but never beyond the absolute max age.
    expect(store.verify(busy.sessionId, busy.sessionToken, t0 + 24 * HOUR + 1)).toBeNull();
  });

  test('per-IP creation cap and total capacity are enforced', () => {
    const store = new SessionStore(opts());
    store.issue('ip-a');
    store.issue('ip-a');
    expect(() => store.issue('ip-a')).toThrow(SessionLimitError);
    try {
      store.issue('ip-a');
    } catch (e: any) {
      expect(e.kind).toBe('IP_LIMIT');
    }
    store.issue('ip-b'); // 3 active now = maxActive
    try {
      store.issue('ip-c');
      throw new Error('expected CAPACITY');
    } catch (e: any) {
      expect(e).toBeInstanceOf(SessionLimitError);
      expect(e.kind).toBe('CAPACITY');
    }
  });

  test('the per-IP window slides: creation is allowed again after an hour', () => {
    const store = new SessionStore({ ...opts(), maxActive: 100 });
    const t0 = 5_000_000;
    store.issue('ip-a', t0);
    store.issue('ip-a', t0);
    expect(() => store.issue('ip-a', t0 + 1000)).toThrow(SessionLimitError);
    expect(() => store.issue('ip-a', t0 + HOUR + 1)).not.toThrow();
  });

  test('expiry/removal notifies the owner so per-session state can be freed', () => {
    const store = new SessionStore(opts());
    const seen: string[] = [];
    store.setExpiryListener((r) => seen.push(r.userId));
    const a = store.issue('ip-a', 0);
    const b = store.issue('ip-b', 0);
    store.remove(a.sessionId);
    store.sweep(3 * HOUR); // b is idle-expired
    expect(seen).toEqual([userIdForSessionId(a.sessionId), userIdForSessionId(b.sessionId)]);
    expect(store.size()).toBe(0);
  });
});

describe('identity helpers', () => {
  test('userId is deterministic, distinct per session, and does not contain the session id', () => {
    const u1 = userIdForSessionId('session-1');
    expect(u1).toBe(userIdForSessionId('session-1'));
    expect(u1).not.toBe(userIdForSessionId('session-2'));
    expect(u1).not.toContain('session-1');
    expect(u1).toMatch(/^anon-[0-9a-f]{16}$/);
  });

  test('public session ref is short, stable and non-reversible; null stays null', () => {
    const ref = publicSessionRef('session-1');
    expect(ref).toMatch(/^sess_[0-9a-f]{8}$/);
    expect(ref).toBe(publicSessionRef('session-1'));
    expect(ref).not.toContain('session-1');
    expect(publicSessionRef(undefined)).toBeNull();
    expect(publicSessionRef('')).toBeNull();
  });
});

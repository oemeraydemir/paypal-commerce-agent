import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { getRepos, writeQueue } from '../persistence/registry';

// lastSeenAt is persisted at most this often per session (idle TTL is minutes+).
const LAST_SEEN_PERSIST_INTERVAL_MS = 5 * 60 * 1000;

// Server-issued anonymous sessions (P0 isolation).
//
// The CLIENT never chooses a session id. POST /api/sessions mints a random
// sessionId + secret bearer token; only the SHA-256 of the token is stored.
// Every state-changing route then proves ownership with that token, so knowing
// a sessionId (e.g. from a public list) is NOT enough to act as that session.
//
// Per-session identity: each session gets its own opaque userId, which keys the
// policy, the daily-spend tracker and the policy events. One visitor's spending
// can no longer consume another visitor's budget.

export interface SessionStoreOptions {
  idleTtlMs: number;
  maxAgeMs: number;
  maxActive: number;
  createPerIpPerHour: number;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  tokenHash: Buffer;
  createdAt: number;
  lastSeenAt: number;
  /** in-memory only: when lastSeenAt was last written to the database */
  persistedAt?: number;
}

export interface IssuedSession {
  sessionId: string;
  sessionToken: string;
  expiresAt: string;
}

export class SessionLimitError extends Error {
  constructor(
    public readonly kind: 'IP_LIMIT' | 'CAPACITY',
    message: string
  ) {
    super(message);
    this.name = 'SessionLimitError';
  }
}

const HOUR_MS = 60 * 60 * 1000;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Opaque per-session user id; not reversible to the session id. */
export function userIdForSessionId(sessionId: string): string {
  return `anon-${createHash('sha256').update(`user:${sessionId}`).digest('hex').slice(0, 16)}`;
}

/** Short, non-reversible label for public (dashboard) responses. */
export function publicSessionRef(sessionId: string | null | undefined): string | null {
  if (!sessionId) return null;
  return `sess_${createHash('sha256').update(`ref:${sessionId}`).digest('hex').slice(0, 8)}`;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly createLog = new Map<string, number[]>();
  private onExpire: (record: SessionRecord) => void = () => undefined;
  private readonly dirty = new Set<string>();

  // ---- durability: sessions survive a restart so clients keep their orders --------
  private async saveRow(sessionId: string): Promise<void> {
    const repos = getRepos();
    const record = this.sessions.get(sessionId);
    if (!repos || !record) return;
    await repos.sessions.save({
      sessionId: record.sessionId,
      userId: record.userId,
      tokenHash: record.tokenHash.toString('hex'),
      createdAt: new Date(record.createdAt),
      lastSeenAt: new Date(record.lastSeenAt),
    });
    record.persistedAt = record.lastSeenAt;
    this.dirty.delete(sessionId);
  }

  private persist(sessionId: string): void {
    if (!getRepos()) return;
    this.dirty.add(sessionId);
    writeQueue.enqueue(`session:${sessionId}`, () => this.saveRow(sessionId)).catch(() => undefined);
  }

  /** Awaitable durable save (used before a new session id is handed to a client). */
  async saveNow(sessionId: string): Promise<void> {
    if (!getRepos()) return;
    this.dirty.add(sessionId);
    await writeQueue.enqueue(`session:${sessionId}`, () => this.saveRow(sessionId), { retries: 0 });
  }

  async retryDirty(): Promise<number> {
    const ids = [...this.dirty];
    for (const id of ids) {
      await writeQueue.enqueue(`session-retry:${id}`, () => this.saveRow(id), { retries: 0 });
    }
    return ids.length;
  }

  /** Loads still-valid sessions at boot and drops expired rows. */
  async hydrate(now: number = Date.now()): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    let loaded = 0;
    for (const row of await repos.sessions.loadAll()) {
      const record: SessionRecord = {
        sessionId: row.sessionId,
        userId: row.userId,
        tokenHash: Buffer.from(row.tokenHash, 'hex'),
        createdAt: row.createdAt.getTime(),
        lastSeenAt: row.lastSeenAt.getTime(),
        persistedAt: row.lastSeenAt.getTime(),
      };
      if (this.isExpired(record, now)) {
        await repos.sessions.remove(row.sessionId);
        continue;
      }
      this.sessions.set(record.sessionId, record);
      loaded++;
    }
    return loaded;
  }

  constructor(public options: SessionStoreOptions) {}

  /** Called for every session removed (expiry/delete) so owners can free state. */
  setExpiryListener(listener: (record: SessionRecord) => void): void {
    this.onExpire = listener;
  }

  issue(clientKey: string, now: number = Date.now()): IssuedSession {
    this.sweep(now);

    const recent = (this.createLog.get(clientKey) ?? []).filter((t) => now - t < HOUR_MS);
    if (recent.length >= this.options.createPerIpPerHour) {
      this.createLog.set(clientKey, recent);
      throw new SessionLimitError('IP_LIMIT', 'Too many sessions created from this address');
    }
    if (this.sessions.size >= this.options.maxActive) {
      throw new SessionLimitError('CAPACITY', 'Session capacity reached; try again later');
    }
    recent.push(now);
    this.createLog.set(clientKey, recent);

    const sessionId = randomUUID();
    const sessionToken = randomBytes(32).toString('base64url');
    this.sessions.set(sessionId, {
      sessionId,
      userId: userIdForSessionId(sessionId),
      tokenHash: sha256(sessionToken),
      createdAt: now,
      lastSeenAt: now,
    });
    this.persist(sessionId);
    return {
      sessionId,
      sessionToken,
      expiresAt: new Date(now + this.options.maxAgeMs).toISOString(),
    };
  }

  /** Returns the session only if id exists, is live and the token matches. */
  verify(sessionId: string, token: string, now: number = Date.now()): SessionRecord | null {
    const record = this.sessions.get(sessionId);
    if (!record) return null;
    if (this.isExpired(record, now)) {
      this.remove(sessionId);
      return null;
    }
    const presented = sha256(token);
    if (presented.length !== record.tokenHash.length || !timingSafeEqual(presented, record.tokenHash)) {
      return null;
    }
    record.lastSeenAt = now;
    if (now - (record.persistedAt ?? 0) > LAST_SEEN_PERSIST_INTERVAL_MS) this.persist(sessionId);
    return record;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  remove(sessionId: string): boolean {
    const record = this.sessions.get(sessionId);
    if (!record) return false;
    this.sessions.delete(sessionId);
    this.dirty.delete(sessionId);
    const repos = getRepos();
    if (repos) {
      writeQueue
        .enqueue(`session-remove:${sessionId}`, () => repos.sessions.remove(sessionId))
        .catch(() => undefined);
    }
    this.onExpire(record);
    return true;
  }

  size(): number {
    return this.sessions.size;
  }

  sweep(now: number = Date.now()): void {
    for (const record of [...this.sessions.values()]) {
      if (this.isExpired(record, now)) this.remove(record.sessionId);
    }
    for (const [key, times] of this.createLog.entries()) {
      const recent = times.filter((t) => now - t < HOUR_MS);
      if (recent.length === 0) this.createLog.delete(key);
      else this.createLog.set(key, recent);
    }
  }

  private isExpired(record: SessionRecord, now: number): boolean {
    return (
      now - record.lastSeenAt > this.options.idleTtlMs ||
      now - record.createdAt > this.options.maxAgeMs
    );
  }

  // Test isolation only.
  reset(): void {
    this.sessions.clear();
    this.dirty.clear();
    this.createLog.clear();
  }
}

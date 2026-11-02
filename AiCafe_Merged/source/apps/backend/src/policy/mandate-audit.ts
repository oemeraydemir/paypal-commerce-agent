import { createHash } from 'crypto';
import { PurchasePolicy } from './domain';
import { getRepos, writeQueue } from '../persistence/registry';

// Append-only, hash-chained audit trail for changes to a shopper's spending mandate (the
// authorization an AI agent or a split bill is allowed to spend under). Each entry carries the hash
// of the previous one, so a removed or edited entry is detectable. Entries are frozen when written.
//
// Durability: with PostgreSQL configured every event is also appended to `mandate_events` (append-only,
// ON CONFLICT DO NOTHING) and the chains are reloaded at startup. Without it the chain lives in memory.

export type MandateEventType = 'AUTHORIZED' | 'AUTHORITY_INCREASED' | 'AUTHORITY_REDUCED' | 'UPDATED';

export interface MandateSnapshot {
  maxPerPurchaseMinor: number;
  dailySpendLimitMinor: number;
  confirmationThresholdMinor: number;
  validUntil: string | null;
  enabled: boolean;
}

export interface MandateEvent {
  seq: number;
  at: string;
  type: MandateEventType;
  /** True when spending authority grew and the caller explicitly confirmed it. */
  confirmed: boolean;
  before: MandateSnapshot;
  after: MandateSnapshot;
  prevHash: string;
  hash: string;
}

export const snapshotOf = (p: PurchasePolicy): MandateSnapshot => ({
  maxPerPurchaseMinor: p.maxPerPurchaseMinor,
  dailySpendLimitMinor: p.dailySpendLimitMinor,
  confirmationThresholdMinor: p.confirmationThresholdMinor,
  validUntil: p.validUntil ? p.validUntil.toISOString() : null,
  enabled: p.enabled,
});

/**
 * Did the change give the mandate MORE spending authority? A higher limit, a looser confirmation
 * threshold, re-enabling, removing the expiry, extending it, or re-authorizing an already expired
 * mandate all count. Tightening never needs confirmation.
 */
export function increasesAuthority(before: MandateSnapshot, after: MandateSnapshot, now = Date.now()): boolean {
  if (after.maxPerPurchaseMinor > before.maxPerPurchaseMinor) return true;
  if (after.dailySpendLimitMinor > before.dailySpendLimitMinor) return true;
  if (after.confirmationThresholdMinor > before.confirmationThresholdMinor) return true;
  if (after.enabled && !before.enabled) return true;
  if (before.validUntil && !after.validUntil) return true; // expiry removed
  if (before.validUntil && after.validUntil && Date.parse(after.validUntil) > Date.parse(before.validUntil)) return true;
  if (before.validUntil && Date.parse(before.validUntil) <= now && after.validUntil && Date.parse(after.validUntil) > now) return true;
  return false;
}

const same = (a: MandateSnapshot, b: MandateSnapshot) => JSON.stringify(a) === JSON.stringify(b);

class MandateAudit {
  private readonly chains = new Map<string, MandateEvent[]>();

  /** Records a change. Returns undefined (and writes nothing) when nothing actually changed. */
  record(userId: string, before: MandateSnapshot, after: MandateSnapshot, confirmed: boolean): MandateEvent | undefined {
    if (same(before, after)) return undefined; // a duplicate request must not create a duplicate event
    const chain = this.chains.get(userId) ?? [];
    const prev = chain[chain.length - 1];
    const type: MandateEventType = !prev && !before.validUntil && after.validUntil
      ? 'AUTHORIZED'
      : increasesAuthority(before, after)
        ? 'AUTHORITY_INCREASED'
        : (after.maxPerPurchaseMinor < before.maxPerPurchaseMinor || after.dailySpendLimitMinor < before.dailySpendLimitMinor)
          ? 'AUTHORITY_REDUCED'
          : 'UPDATED';
    const body = { seq: chain.length + 1, at: new Date().toISOString(), type, confirmed, before, after, prevHash: prev?.hash ?? 'GENESIS' };
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const event: MandateEvent = Object.freeze({ ...body, hash }) as MandateEvent;
    chain.push(event);
    this.chains.set(userId, chain);
    this.persist(userId, event);
    return event;
  }

  private readonly pending = new Map<string, MandateEvent>();

  private persist(userId: string, event: MandateEvent): void {
    if (!getRepos()) return;
    const key = `${userId}#${event.seq}`;
    this.pending.set(key, event);
    writeQueue.enqueue(`mandate:${key}`, () => this.write(userId, event)).catch(() => undefined);
  }

  private async write(userId: string, event: MandateEvent): Promise<void> {
    const repos = getRepos();
    if (!repos || !repos.mandateEvents) return;
    await repos.mandateEvents.append({ userId, seq: event.seq, event, at: event.at });
    this.pending.delete(`${userId}#${event.seq}`);
  }

  async saveNow(): Promise<void> {
    await writeQueue.idle();
  }

  async retryDirty(): Promise<number> {
    const items = [...this.pending.entries()];
    for (const [key, ev] of items) {
      const userId = key.slice(0, key.lastIndexOf('#'));
      await writeQueue.enqueue(`mandate-retry:${key}`, () => this.write(userId, ev), { retries: 0 });
    }
    return items.length;
  }

  async hydrate(): Promise<number> {
    const repos = getRepos();
    if (!repos || !repos.mandateEvents) return 0;
    const rows = await repos.mandateEvents.loadAll();
    this.chains.clear();
    for (const r of rows) {
      const chain = this.chains.get(r.userId) ?? [];
      chain.push(Object.freeze(r.event as MandateEvent) as MandateEvent);
      this.chains.set(r.userId, chain);
    }
    return rows.length;
  }

  list(userId: string): MandateEvent[] {
    return [...(this.chains.get(userId) ?? [])];
  }

  last(userId: string): MandateEvent | undefined {
    const chain = this.chains.get(userId);
    return chain?.[chain.length - 1];
  }

  /** Re-computes the chain; false means an entry was removed or altered. */
  verify(userId: string): boolean {
    let prev = 'GENESIS';
    for (const e of this.chains.get(userId) ?? []) {
      const { hash, ...body } = e;
      if (e.prevHash !== prev) return false;
      if (createHash('sha256').update(JSON.stringify(body)).digest('hex') !== hash) return false;
      prev = hash;
    }
    return true;
  }

  reset(): void {
    this.chains.clear();
  }
}

export const mandateAudit = new MandateAudit();

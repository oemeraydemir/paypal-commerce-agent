/**
 * Regression guard: the pg-mem SQL emulator cannot parse PostgreSQL's
 * table-qualified row-lock clause (`FOR UPDATE OF h` / `OF h, b`) nor
 * `SKIP LOCKED`, and cannot execute correlated subqueries that reference an
 * OUTER alias. `createPgRepositories` therefore switches to emulator-safe
 * equivalents ONLY when it detects a pg-mem pool; a real `pg.Pool` keeps the
 * fully-locked production SQL byte-for-byte.
 *
 * These tests pin BOTH sides so the production lock / row-lock / SKIP-LOCKED
 * behaviour can never be silently weakened:
 *   1. The production clauses (`FOR UPDATE OF h SKIP LOCKED`,
 *      `FOR UPDATE OF h, b`) are emitted verbatim for a non-pg-mem pool.
 *   2. Only a pg-mem pool (class `MemPg` + own `connection` member) enters the
 *      compatibility path and gets the portable bare `FOR UPDATE`.
 */
import { newDb } from 'pg-mem';
import { createPgRepositories } from '../../src/persistence/pg-repositories';
import { Queryable } from '../../src/persistence/types';

type RowHandler = (sql: string, params?: unknown[]) => any[];

/**
 * A pool whose `query` records the exact SQL it is given and returns rows from
 * the handler. It implements `connect()` (with `release`) because the
 * repositories wrap writes in transactions. `pgmem: true` shapes the instance
 * exactly like a real pg-mem adapter pool so the production detection logic
 * classifies it as the emulator.
 */
function spyPool(handler: RowHandler, opts: { pgmem?: boolean } = {}): {
  db: Queryable;
  calls: string[];
} {
  const calls: string[] = [];
  const run = async (sql: string, params?: unknown[]) => {
    calls.push(sql);
    const rows = handler(sql, params) ?? [];
    return { rows, rowCount: rows.length };
  };
  const pool: any = {
    query: run,
    connect: async () => ({ query: run, release: () => undefined }),
    end: async () => undefined,
  };
  if (opts.pgmem) {
    Object.defineProperty(pool, 'constructor', { value: { name: 'MemPg' } });
    Object.defineProperty(pool, 'connection', { value: {}, enumerable: true, writable: true });
  }
  return { db: pool as unknown as Queryable, calls };
}

const policyJson = JSON.stringify({
  userId: 'u1',
  enabled: true,
  currency: 'EUR',
  maxPerPurchaseMinor: 100000,
  dailySpendLimitMinor: 100000,
  confirmationThresholdMinor: 0,
  allowedMerchantIds: [],
  blockedCategoryIds: [],
  validUntil: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

/** Rows a bill reservation needs in order to reach the bill row-lock query. */
const reservationRows: RowHandler = (sql) => {
  if (sql.includes('SELECT owner_user_id FROM bill_mandate_reservations')) {
    return [{ owner_user_id: 'u1' }];
  }
  if (sql.includes('FROM spending_mandates')) {
    return [{ user_id: 'u1', revision: 1, policy: policyJson }];
  }
  if (sql.includes('AS pending_minor')) return [{ pending_minor: 0, spent_minor: 0 }];
  if (sql.includes('AS held_minor')) return [{ held_minor: 0 }];
  return [];
};

const BILL_JOIN = 'JOIN bill_groups b ON b.id = h.bill_id';

describe('pg-mem compatibility path', () => {
  test('non-pg-mem pool: reconcileMandateReservations keeps FOR UPDATE OF h SKIP LOCKED', async () => {
    const { db, calls } = spyPool(() => []);
    const repos = createPgRepositories(db, async () => undefined);
    await repos.bills.reconcileMandateReservations();

    const sql = calls.find((s) => s.includes('FROM bill_mandate_reservations'));
    expect(sql).toBeDefined();
    expect(sql!.trim().endsWith('FOR UPDATE OF h SKIP LOCKED')).toBe(true);
  });

  test('non-pg-mem pool: reserveWithinMandate (bill) keeps FOR UPDATE OF h, b', async () => {
    const { db, calls } = spyPool(reservationRows);
    const repos = createPgRepositories(db, async () => undefined);
    await repos.reservations.reserveWithinMandate({
      id: 'r1',
      userId: 'u1',
      amountMinor: 100,
      currency: 'EUR',
      merchantId: 'm1',
      mandateRevision: 1,
      billMandateReservationId: 'b1',
      createdAt: new Date(),
    });

    const lockSql = calls.find((s) => s.includes(BILL_JOIN));
    expect(lockSql).toBeDefined();
    expect(lockSql).toContain('FOR UPDATE OF h, b');
  });

  test('pg-mem pool: reconcile emits the portable bare FOR UPDATE (no OF / SKIP LOCKED)', async () => {
    const { db, calls } = spyPool(() => [], { pgmem: true });
    const repos = createPgRepositories(db, async () => undefined);
    await repos.bills.reconcileMandateReservations();

    const sql = calls.find((s) => s.includes('FROM bill_mandate_reservations'));
    expect(sql).toBeDefined();
    expect(sql!).toMatch(/FOR UPDATE\s*$/);
    expect(sql!).not.toContain('OF h');
    expect(sql!).not.toContain('SKIP LOCKED');
  });

  test('pg-mem pool: reserveWithinMandate (bill) emits the portable bare FOR UPDATE', async () => {
    const { db, calls } = spyPool(reservationRows, { pgmem: true });
    const repos = createPgRepositories(db, async () => undefined);
    await repos.reservations.reserveWithinMandate({
      id: 'r1',
      userId: 'u1',
      amountMinor: 100,
      currency: 'EUR',
      merchantId: 'm1',
      mandateRevision: 1,
      billMandateReservationId: 'b1',
      createdAt: new Date(),
    });

    const lockSql = calls.find((s) => s.includes(BILL_JOIN));
    expect(lockSql).toBeDefined();
    expect(lockSql!).toMatch(/FOR UPDATE\s*$/);
    expect(lockSql!).not.toContain('OF h');
  });

  test('detection: a MemPg pool is recognised; a real pg.Pool is not', () => {
    const { Pool: RealPool } = require('pg');
    const memPool = new (newDb().adapters.createPg().Pool)() as any;
    const realPool = new RealPool({ connectionString: 'postgres://unused' }) as any;
    const isPgMem = (p: any) =>
      p.constructor?.name === 'MemPg' &&
      Object.prototype.hasOwnProperty.call(p, 'connection');
    expect(isPgMem(memPool)).toBe(true);
    expect(isPgMem(realPool)).toBe(false);
    void realPool.end().catch(() => undefined);
  });
});

/**
 * Real PostgreSQL verification for durable mandates and multi-instance spend
 * reservation. It only accepts an explicitly dedicated loopback test database.
 * No DATABASE_URL fallback is permitted.
 */
import { Client, Pool } from 'pg';
import { migrate } from '../../src/persistence/migrations';
import { createPgRepositories } from '../../src/persistence/pg-repositories';
import { BillStatus, ShareStatus, SplitStrategy } from '../../src/bills/domain';
import type { BillGroup } from '../../src/bills/domain';
import type { PurchasePolicy } from '../../src/policy/domain';

const rawUrl = process.env.AICAFE_DISPOSABLE_PG_URL;
let parsedUrl: URL | undefined;
if (rawUrl) {
  try { parsedUrl = new URL(rawUrl); } catch { throw new Error('AICAFE_DISPOSABLE_PG_URL must be a valid URL.'); }
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase());
  const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  if (!loopback || !/^aicafe_disposable_test(?:_[a-z0-9]+)?$/i.test(databaseName)) {
    throw new Error('PostgreSQL mandate smoke test refused: the target must be a loopback database named aicafe_disposable_test (optionally suffixed).');
  }
}

const suite = rawUrl ? describe : describe.skip;
if (!rawUrl) console.warn('[smoke] BLOCKED: AICAFE_DISPOSABLE_PG_URL is unset; no database was contacted.');

const basePolicy = (userId: string): PurchasePolicy => {
  const now = new Date();
  return {
    id: `policy-${userId}`, userId, currency: 'EUR', maxPerPurchaseMinor: 1000,
    dailySpendLimitMinor: 1500, allowedMerchantIds: ['merchant-test'], blockedCategoryIds: [],
    requiredDietaryAttributes: [], blockedDietaryAttributes: [], confirmationThresholdMinor: 1000,
    enabled: true, createdAt: now, updatedAt: now,
  };
};

function group(id: string, owner: string, totalMinor: number): BillGroup {
  const now = new Date();
  return {
    id, merchantId: 'merchant-test', currency: 'EUR', totalMinor,
    strategy: SplitStrategy.EQUAL, createdByUserId: owner, status: BillStatus.OPEN,
    items: [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: totalMinor, lineTotalMinor: totalMinor }],
    shares: [
      { id: `${id}-owner`, participantUserId: owner, amountMinor: Math.floor(totalMinor / 2), status: ShareStatus.PENDING },
      { id: `${id}-guest`, amountMinor: totalMinor - Math.floor(totalMinor / 2), status: ShareStatus.PENDING },
    ],
    createdAt: now, updatedAt: now,
  };
}

suite('persistent spending mandates on isolated PostgreSQL', () => {
  jest.setTimeout(120_000);
  let schema: string;
  let pool: Pool;
  let admin: Client;

  beforeAll(async () => {
    schema = `aicafe_mandate_${Date.now()}`;
    admin = new Client({ connectionString: rawUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: rawUrl, options: `-c search_path=${schema}` });
    await migrate(pool as any, { advisoryLock: false });
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });

  test('migration is repeatable and mandates survive repository re-instantiation', async () => {
    expect(await migrate(pool as any, { advisoryLock: false })).toEqual([]);
    const repoA = createPgRepositories(pool as any, async () => undefined).mandates;
    const saved = await repoA.getOrCreate(basePolicy('mandate-owner'));
    const updated = await repoA.update({
      policy: { ...saved.policy, maxPerPurchaseMinor: 950, updatedAt: new Date() },
      expectedRevision: saved.revision, sessionId: 'session-a', eventId: 'event-update-a', eventType: 'UPDATED',
    });
    expect(updated?.revision).toBe(2);
    const repoAfterRestart = createPgRepositories(pool as any, async () => undefined).mandates;
    expect(await repoAfterRestart.getOrCreate(basePolicy('mandate-owner'))).toMatchObject({ revision: 2, policy: { maxPerPurchaseMinor: 950 } });
    expect((await repoAfterRestart.getLastEvent('mandate-owner'))?.eventType).toBe('UPDATED');
  });

  test('concurrent reservations serialize on the mandate row and do not exceed the daily cap', async () => {
    const userId = 'race-owner';
    const mandates = createPgRepositories(pool as any, async () => undefined).mandates;
    const stored = await mandates.getOrCreate(basePolicy(userId));
    const a = createPgRepositories(pool as any, async () => undefined).reservations;
    const b = createPgRepositories(pool as any, async () => undefined).reservations;
    const reservation = (id: string) => ({
      id, userId, amountMinor: 900, currency: 'EUR', merchantId: 'merchant-test',
      mandateRevision: stored.revision, createdAt: new Date(),
    });
    const results = await Promise.all([a.reserveWithinMandate(reservation('race-a')), b.reserveWithinMandate(reservation('race-b'))]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });

  test('bill reserves the complete cart once, binds the mandate revision, and closes idempotently', async () => {
    const userId = 'bill-owner';
    const repos = createPgRepositories(pool as any, async () => undefined);
    const stored = await repos.mandates.getOrCreate(basePolicy(userId));
    const bill = group('mandate-bill', userId, 900);
    const created = await repos.bills.createGroupWithMandateReservation({
      group: bill, mandateRevision: stored.revision, sessionId: 'bill-owner-session', reservationId: 'bill-hold-v1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.reservation).toMatchObject({ amountMinor: 900, mandateRevision: stored.revision, status: 'ACTIVE' });

    const ownerShare = await repos.reservations.reserveWithinMandate({
      id: 'bill-owner-share-reservation', userId, amountMinor: 450, currency: 'EUR',
      merchantId: 'merchant-test', mandateRevision: stored.revision,
      billMandateReservationId: created.reservation.id, createdAt: new Date(),
    });
    expect(ownerShare.ok).toBe(true);
    const usage = await repos.reservations.getDailyUsage(userId, new Date(new Date().toISOString().slice(0, 10)));
    expect(usage).toEqual({ spentMinor: 0, pendingMinor: 0, billReservedMinor: 900 });

    expect(await repos.bills.cancelGroupAndCloseMandate(bill.id, userId)).toBe(true);
    expect(await repos.bills.cancelGroupAndCloseMandate(bill.id, userId)).toBe(true);
    const { rows } = await pool.query('SELECT status FROM bill_mandate_reservations WHERE id=$1', [created.reservation.id]);
    expect(rows[0].status).toBe('CANCELLED');
  });
});

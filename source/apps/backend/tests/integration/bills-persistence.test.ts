/**
 * Split Bill P3: durable repository layer tests on the pg-mem emulator.
 *
 * pg-mem models the real migrations, DDL (unique indexes), and plain CRUD, so
 * this suite asserts the *structural* guarantees:
 *   - saveGroup / loadAllGroups / loadAllShares round-trip
 *   - insertInviteNonce persists a pending nonce
 *   - the unique `bill_shares_order_uq` index is a DB-level backstop
 *   - nonce expiry / unknown-nonce / missing-bill guards (no rollback needed)
 *
 * The DB-atomic DECISION guarantees are NOT verifiable on pg-mem (its `IS NULL`
 * predicate does not match stored NULLs, and it does not honor transaction
 * ROLLBACK). Those are covered by the real-PostgreSQL smoke suite
 * `tests/smoke/pg-bills-atomicity.test.ts`, which runs only when DATABASE_URL
 * is set (otherwise BLOCKED).
 */
import { newDb } from 'pg-mem';
import { createPgRepositories } from '../../src/persistence/pg-repositories';
import { migrate } from '../../src/persistence/migrations';
import { BillStatus, ShareStatus, SplitStrategy } from '../../src/bills/domain';
import type { BillGroup } from '../../src/bills/domain';

function newPool() {
  const { Pool } = newDb().adapters.createPg();
  return new Pool() as any;
}

let pool: any;
let repos: ReturnType<typeof createPgRepositories>;

beforeEach(async () => {
  pool = newPool();
  await migrate(pool, { advisoryLock: false });
  repos = createPgRepositories(pool, async () => undefined);
});

afterEach(async () => {
  await pool.end();
});

function makeGroup(id: string, shareIds: string[]): BillGroup {
  const now = new Date();
  return {
    id,
    merchantId: 'm1',
    currency: 'EUR',
    totalMinor: 100 * shareIds.length,
    strategy: SplitStrategy.EQUAL,
    createdByUserId: 'u-owner',
    status: BillStatus.OPEN,
    items: [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300 }],
    shares: shareIds.map((sid) => ({ id: sid, amountMinor: 100, status: ShareStatus.PENDING })),
    createdAt: now,
    updatedAt: now,
  };
}

describe('bill repository: persistence round-trip', () => {
  test('loadAllGroups / loadAllShares read back saved state', async () => {
    await repos.bills.saveGroup(makeGroup('g12', ['s12a', 's12b']));
    const groups = await repos.bills.loadAllGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('g12');
    expect(groups[0].merchantId).toBe('m1');
    expect(groups[0].strategy).toBe(SplitStrategy.EQUAL);

    const shares = await repos.bills.loadAllShares();
    expect(shares.map((s) => s.id).sort()).toEqual(['s12a', 's12b']);
    expect(shares.every((s) => s.billId === 'g12')).toBe(true);
  });

  test('insertInviteNonce persists a pending nonce', async () => {
    await repos.bills.saveGroup(makeGroup('g13', ['s13a']));
    await repos.bills.insertInviteNonce({
      nonce: 'nc1',
      billId: 'g13',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    const [row] = (await pool.query('SELECT * FROM bill_invite_nonces WHERE nonce=$1', ['nc1'])).rows;
    expect(row.status).toBe('PENDING');
    expect(row.bill_id).toBe('g13');
  });
});

describe('bill repository: DB-level backstop (unique index)', () => {
  test('two shares cannot be bound to the same order id', async () => {
    await repos.bills.saveGroup(makeGroup('g3', ['s3a', 's3b']));
    await pool.query(`UPDATE bill_shares SET order_id='shared-order', updated_at=now() WHERE id='s3a'`);
    await expect(
      pool.query(`UPDATE bill_shares SET order_id='shared-order', updated_at=now() WHERE id='s3b'`)
    ).rejects.toThrow();
  });
});

describe('bill repository: nonce guards (no rollback path)', () => {
  test('an expired nonce is refused as invalid', async () => {
    await repos.bills.saveGroup(makeGroup('g6', ['s6a']));
    await repos.bills.insertInviteNonce({
      nonce: 'nc-exp',
      billId: 'g6',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    });
    const res = await repos.bills.joinBill({ billId: 'g6', nonce: 'nc-exp', userId: 'u1' });
    expect(res).toEqual({ ok: false, reason: 'INVALID_OR_EXPIRED' });
  });

  test('an unknown nonce is refused as invalid', async () => {
    await repos.bills.saveGroup(makeGroup('g7', ['s7a']));
    const res = await repos.bills.joinBill({ billId: 'g7', nonce: 'does-not-exist', userId: 'u1' });
    expect(res).toEqual({ ok: false, reason: 'INVALID_OR_EXPIRED' });
  });

  test('joining a missing bill returns BILL_NOT_FOUND', async () => {
    const res = await repos.bills.joinBill({ billId: 'missing', nonce: 'nc-x', userId: 'u1' });
    expect(res).toEqual({ ok: false, reason: 'BILL_NOT_FOUND' });
  });
});

describe('bill repository: atomic claim mutex (structural, pg-mem)', () => {
  test('only one winner binds an order to a share; losers get false', async () => {
    await repos.bills.saveGroup(makeGroup('g-claim', ['sc1']));
    expect(await repos.bills.claimShareForPayment('sc1', 'ord-A')).toBe(true);
    expect(await repos.bills.claimShareForPayment('sc1', 'ord-B')).toBe(false);
    const { rows } = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['sc1']);
    expect(rows[0].order_id).toBe('ord-A');
  });

  test('releaseClaim frees the share so it can be claimed again', async () => {
    await repos.bills.saveGroup(makeGroup('g-rel', ['sr1']));
    expect(await repos.bills.claimShareForPayment('sr1', 'ord-1')).toBe(true);
    expect(await repos.bills.releaseClaim('sr1', 'ord-1')).toBe(true);
    const { rows } = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['sr1']);
    expect(rows[0].order_id).toBeNull();
    expect(await repos.bills.claimShareForPayment('sr1', 'ord-2')).toBe(true);
  });

  test('releaseClaim only releases its own order id', async () => {
    await repos.bills.saveGroup(makeGroup('g-rel2', ['sr2']));
    await repos.bills.claimShareForPayment('sr2', 'ord-x');
    expect(await repos.bills.releaseClaim('sr2', 'ord-other')).toBe(false);
    const { rows } = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['sr2']);
    expect(rows[0].order_id).toBe('ord-x');
  });
});

describe('bill repository: orphan reconciliation TTL (structural, pg-mem)', () => {
  test('a stale claim with no order is cleared; an in-flight one is kept', async () => {
    await repos.bills.saveGroup(makeGroup('g-rec', ['rc1', 'rc2']));
    // rc1: bound its order, but the order row never arrived AND the claim is stale → orphan.
    await pool.query('UPDATE bill_shares SET order_id=$1, updated_at=now() WHERE id=$2', ['ord-stale', 'rc1']);
    await pool.query(
      'INSERT INTO bill_share_claims (share_id, order_id, claimed_at) VALUES ($1,$2,$3)',
      ['rc1', 'ord-stale', new Date(Date.now() - 10 * 60 * 1000)]
    );
    // rc2: in-flight (just now), no order row yet → must NOT be cleared.
    await pool.query('UPDATE bill_shares SET order_id=$1, updated_at=now() WHERE id=$2', ['ord-inflight', 'rc2']);
    await pool.query(
      'INSERT INTO bill_share_claims (share_id, order_id, claimed_at) VALUES ($1,$2,$3)',
      ['rc2', 'ord-inflight', new Date()]
    );
    const cleared = await repos.bills.reconcileOrphanClaims();
    expect(cleared).toBe(1);
    const r1 = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['rc1']);
    expect(r1.rows[0].order_id).toBeNull(); // orphan share cleared
    const c1 = await pool.query('SELECT 1 FROM bill_share_claims WHERE share_id=$1', ['rc1']);
    expect(c1.rows).toHaveLength(0); // orphan claim deleted
    const r2 = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['rc2']);
    expect(r2.rows[0].order_id).toBe('ord-inflight'); // in-flight kept
    const c2 = await pool.query('SELECT 1 FROM bill_share_claims WHERE share_id=$1', ['rc2']);
    expect(c2.rows).toHaveLength(1); // in-flight claim kept
  });
});

describe('bill repository: CART_READY crash recovery (structural, pg-mem)', () => {
  const seedOrder = (orderId: string, status: string, paypal?: string) =>
    pool.query(
      `INSERT INTO orders (id, session_id, status, origin, items, total_minor, currency, paypal_order_id, created_at, updated_at)
       VALUES ($1,'sess',$2,'HUMAN','[]',100,'EUR',$3,now(),now())`,
      [orderId, status, paypal ?? null]
    );
  const backdateClaim = (shareId: string) =>
    pool.query('UPDATE bill_share_claims SET claimed_at = $1 WHERE share_id = $2', [
      new Date(Date.now() - 10 * 60 * 1000),
      shareId,
    ]);

  test('a stale claim on an abandoned CART_READY order (checkout never started) is released and the order cancelled', async () => {
    await repos.bills.saveGroup(makeGroup('g-recov', ['rva']));
    await repos.bills.claimShareForPayment('rva', 'ord-recover'); // binds share + claim
    await seedOrder('ord-recover', 'CART_READY'); // no paypal_order_id → checkout never started
    await backdateClaim('rva');
    expect(await repos.bills.reconcileOrphanClaims()).toBe(1);
    const share = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['rva']);
    expect(share.rows[0].order_id).toBeNull(); // share retryable again
    const ord = await pool.query('SELECT status FROM orders WHERE id=$1', ['ord-recover']);
    expect(ord.rows[0].status).toBe('ORDER_CANCELLED'); // orphaned order cancelled
  });

  test('a stale claim on a CART_READY order that already has a PayPal order is KEPT (active checkout)', async () => {
    await repos.bills.saveGroup(makeGroup('g-recov2', ['rvb']));
    await repos.bills.claimShareForPayment('rvb', 'ord-active');
    await seedOrder('ord-active', 'CART_READY', 'PP-ACTIVE'); // PayPal checkout started
    await backdateClaim('rvb');
    expect(await repos.bills.reconcileOrphanClaims()).toBe(0); // active → protected
    const ord = await pool.query('SELECT status FROM orders WHERE id=$1', ['ord-active']);
    expect(ord.rows[0].status).toBe('CART_READY'); // untouched
    const claim = await pool.query('SELECT 1 FROM bill_share_claims WHERE share_id=$1', ['rvb']);
    expect(claim.rows).toHaveLength(1);
  });

  test('a recent (in-flight) CART_READY claim without a PayPal order is KEPT by the TTL guard', async () => {
    await repos.bills.saveGroup(makeGroup('g-recov3', ['rvc']));
    await repos.bills.claimShareForPayment('rvc', 'ord-inflight');
    await seedOrder('ord-inflight', 'CART_READY'); // recent, no paypal — but in-flight
    expect(await repos.bills.reconcileOrphanClaims()).toBe(0); // TTL not elapsed → kept
    const claim = await pool.query('SELECT 1 FROM bill_share_claims WHERE share_id=$1', ['rvc']);
    expect(claim.rows).toHaveLength(1);
    const share = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['rvc']);
    expect(share.rows[0].order_id).toBe('ord-inflight'); // still bound
  });
});

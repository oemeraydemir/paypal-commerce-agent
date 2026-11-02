/**
 * Real-PostgreSQL atomicity smoke test for Split Bill P3 (no emulator).
 *
 * This is where the DB-atomic DECISION guarantees are verified, because pg-mem
 * cannot model them (its `IS NULL` predicate does not match stored NULLs and it
 * does not honor transaction ROLLBACK). The guarantees covered here:
 *
 *   - claimShareForPayment: exactly one winner among concurrent payers for the
 *     same share; orderId is bound at most once (claim-before-order guard).
 *   - joinBill: the invite nonce is consumed and an open slot is bound in ONE
 *     transaction; a replayed nonce is refused; a duplicate participant and a
 *     full bill both roll back so the nonce stays usable.
 *   - two tokens racing for the last open slot serialize: exactly one binds.
 *   - reconcileOrphanClaims clears only claims with no backing order row.
 *
 * Skipped, and reported BLOCKED, when DATABASE_URL is not set.
 *   DATABASE_URL=postgres://user:pass@host:5432/db npx jest -c jest.smoke.config.js tests/smoke/pg-bills-atomicity.test.ts
 */
import { Client, Pool } from 'pg';
import { migrate } from '../../src/persistence/migrations';
import { createPgRepositories } from '../../src/persistence/pg-repositories';
import { BillStatus, ShareStatus, SplitStrategy } from '../../src/bills/domain';
import type { BillGroup } from '../../src/bills/domain';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn('[smoke] BLOCKED: DATABASE_URL is not set. pg-bills-atomicity was NOT executed.');
}

async function admin(sql: string) {
  const c = new Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

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

suite('bill atomicity on a real PostgreSQL server', () => {
  jest.setTimeout(120_000);
  let schema: string;
  let pool: Pool;

  beforeAll(async () => {
    schema = `aicafe_bills_${Date.now()}`;
    await admin(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await migrate(pool as any, { advisoryLock: false });
  });

  afterAll(async () => {
    await pool.end();
    await admin(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  });

  const seed = (group: BillGroup) => createPgRepositories(pool as any, async () => undefined).bills.saveGroup(group);
  const nonce = (n: string, billId: string) =>
    createPgRepositories(pool as any, async () => undefined).bills.insertInviteNonce({
      nonce: n,
      billId,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 120_000),
      createdAt: new Date(),
    });

  test('claimShareForPayment: concurrent claims for one share yield exactly one winner', async () => {
    const gid = 'c-single';
    await seed(makeGroup(gid, ['cs1']));
    const a = createPgRepositories(pool as any, async () => undefined).bills;
    const b = createPgRepositories(pool as any, async () => undefined).bills;
    const results = await Promise.all([
      a.claimShareForPayment('cs1', 'order-A'),
      b.claimShareForPayment('cs1', 'order-B'),
      a.claimShareForPayment('cs1', 'order-C'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const { rows } = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['cs1']);
    expect(rows[0].order_id).not.toBeNull();
  });

  test('claimShareForPayment: binds orderId at most once', async () => {
    const gid = 'c-bind';
    await seed(makeGroup(gid, ['cb1']));
    const bills = createPgRepositories(pool as any, async () => undefined).bills;
    expect(await bills.claimShareForPayment('cb1', 'order-1')).toBe(true);
    expect(await bills.claimShareForPayment('cb1', 'order-2')).toBe(false);
    const { rows } = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['cb1']);
    expect(rows[0].order_id).toBe('order-1');
  });

  test('joinBill: consumes the nonce and binds a slot; a replayed nonce is refused', async () => {
    const gid = 'j-happy';
    await seed(makeGroup(gid, ['jh1', 'jh2']));
    await nonce('nc-happy', gid);
    const bills = createPgRepositories(pool as any, async () => undefined).bills;

    const res = await bills.joinBill({ billId: gid, nonce: 'nc-happy', userId: 'u1' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const { rows } = await pool.query('SELECT participant_user_id FROM bill_shares WHERE id=$1', [res.shareId]);
      expect(rows[0].participant_user_id).toBe('u1');
    }
    const again = await bills.joinBill({ billId: gid, nonce: 'nc-happy', userId: 'u2' });
    expect(again).toEqual({ ok: false, reason: 'ALREADY_USED' });
  });

  test('joinBill: a duplicate participant rolls back so its nonce stays usable', async () => {
    const gid = 'j-dup';
    await seed(makeGroup(gid, ['jd1', 'jd2']));
    await nonce('nc-dup1', gid);
    await nonce('nc-dup2', gid);
    const bills = createPgRepositories(pool as any, async () => undefined).bills;

    await bills.joinBill({ billId: gid, nonce: 'nc-dup1', userId: 'u1' }); // binds slot 0
    const dup = await bills.joinBill({ billId: gid, nonce: 'nc-dup2', userId: 'u1' });
    expect(dup).toEqual({ ok: false, reason: 'ALREADY_PARTICIPANT' });
    const { rows } = await pool.query('SELECT status FROM bill_invite_nonces WHERE nonce=$1', ['nc-dup2']);
    expect(rows[0].status).toBe('PENDING'); // rolled back, not consumed
  });

  test('joinBill: joining a full bill rolls back so its nonce stays usable', async () => {
    const gid = 'j-full';
    await seed(makeGroup(gid, ['jf1'])); // one open slot
    await nonce('nc-full1', gid);
    await nonce('nc-full2', gid);
    const bills = createPgRepositories(pool as any, async () => undefined).bills;

    await bills.joinBill({ billId: gid, nonce: 'nc-full1', userId: 'u1' }); // fills the bill
    const full = await bills.joinBill({ billId: gid, nonce: 'nc-full2', userId: 'u2' });
    expect(full).toEqual({ ok: false, reason: 'FULL' });
    const { rows } = await pool.query('SELECT status FROM bill_invite_nonces WHERE nonce=$1', ['nc-full2']);
    expect(rows[0].status).toBe('PENDING'); // rolled back
  });

  test('joinBill: two different tokens racing for the last slot serialize to exactly one bind', async () => {
    const gid = 'j-race';
    await seed(makeGroup(gid, ['jr1'])); // one open slot
    await nonce('nc-race1', gid);
    await nonce('nc-race2', gid);
    const bills = createPgRepositories(pool as any, async () => undefined).bills;

    const attempts = [
      { nonce: 'nc-race1', userId: 'u1' },
      { nonce: 'nc-race2', userId: 'u2' },
    ];
    const results = await Promise.all(
      attempts.map((a) => bills.joinBill({ billId: gid, nonce: a.nonce, userId: a.userId }))
    );
    const wins = results.filter((r) => r.ok);
    expect(wins).toHaveLength(1);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM bill_shares WHERE bill_id=$1 AND participant_user_id IS NOT NULL', [gid]);
    expect(rows[0].n).toBe(1);
    // the loser's nonce was rolled back and is still usable
    for (let i = 0; i < results.length; i++) {
      if (!results[i].ok) {
        const chk = await pool.query('SELECT status FROM bill_invite_nonces WHERE nonce=$1', [attempts[i].nonce]);
        expect(chk.rows[0].status).toBe('PENDING');
      }
    }
  });

  test('reconcileOrphanClaims: clears only claims older than the TTL with no order row', async () => {
    const gid = 'r-orph';
    await seed(makeGroup(gid, ['ro1', 'ro2', 'ro3']));
    const bills = createPgRepositories(pool as any, async () => undefined).bills;
    // ro1: orphan claim older than the TTL, no orders row → must be cleared.
    await pool.query(
      `INSERT INTO bill_share_claims (share_id, order_id, claimed_at) VALUES ($1,$2, now() - interval '10 minutes')`,
      ['ro1', 'EM-OLD-ORPHAN']
    );
    // ro2: a real order exists → must be kept.
    await pool.query(
      `INSERT INTO orders (id, session_id, status, origin, items, total_minor, currency, created_at, updated_at)
       VALUES ($1,$2,'CART_READY','HUMAN','[]',100,'EUR',now(),now())`,
      ['EM-REAL', 'sess']
    );
    await bills.claimShareForPayment('ro2', 'EM-REAL');
    // ro3: in-flight claim (just now), no order row YET → must NOT be cleared (TTL guard).
    await bills.claimShareForPayment('ro3', 'EM-INFLIGHT');

    const cleared = await bills.reconcileOrphanClaims();
    expect(cleared).toBe(1); // only the old orphan
    const rows = await pool.query(
      'SELECT id, order_id FROM bill_shares WHERE id IN ($1,$2,$3) ORDER BY id',
      ['ro1', 'ro2', 'ro3']
    );
    const byId: Record<string, string | null> = Object.fromEntries(rows.rows.map((r: any) => [r.id, r.order_id]));
    expect(byId.ro1).toBeNull(); // old orphan cleared
    expect(byId.ro2).toBe('EM-REAL'); // kept (real order)
    expect(byId.ro3).toBe('EM-INFLIGHT'); // kept (in-flight, TTL not elapsed)
    // the in-flight claim row must still exist so its payment can complete
    const claim = await pool.query('SELECT 1 FROM bill_share_claims WHERE share_id=$1', ['ro3']);
    expect(claim.rows).toHaveLength(1);
  });

  test('reconcileOrphanClaims: an in-flight claim (no order yet) is NEVER cleared', async () => {
    const gid = 'r-inflight';
    await seed(makeGroup(gid, ['ri1']));
    const bills = createPgRepositories(pool as any, async () => undefined).bills;
    // Claim-before-order has won and bound the order id, but the orders row is
    // not written yet. A restart/reconcile must NOT free this active claim.
    await bills.claimShareForPayment('ri1', 'EM-INFLIGHT-NOORDER');
    const before = await pool.query(
      'SELECT count(*)::int AS n FROM bill_shares WHERE id=$1 AND order_id IS NOT NULL',
      ['ri1']
    );
    expect(before.rows[0].n).toBe(1); // bound
    const cleared = await bills.reconcileOrphanClaims();
    expect(cleared).toBe(0); // in-flight: TTL not elapsed
    const after = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['ri1']);
    expect(after.rows[0].order_id).toBe('EM-INFLIGHT-NOORDER'); // still bound
  });

  // Helper: stage a CART_READY order + a binding claim for a share, so the
  // reconcile decision (LEFT JOIN orders) can be exercised on real PostgreSQL.
  const seedCartReadyClaim = async (
    shareId: string,
    orderId: string,
    opts: { paypalOrderId?: string; claimedAtOld?: boolean }
  ) => {
    await pool.query(
      `INSERT INTO orders (id, session_id, status, origin, items, total_minor, currency, paypal_order_id, created_at, updated_at)
       VALUES ($1,$2,'CART_READY','HUMAN','[]',100,'EUR',$3,now(),now())`,
      [orderId, 'sess', opts.paypalOrderId ?? null]
    );
    await pool.query(
      `INSERT INTO bill_share_claims (share_id, order_id, claimed_at)
       VALUES ($1,$2, ${opts.claimedAtOld ? "now() - interval '10 minutes'" : 'now()'})`,
      [shareId, orderId]
    );
    await pool.query('UPDATE bill_shares SET order_id = $2 WHERE id = $1', [shareId, orderId]);
  };

  test('reconcileOrphanClaims: a stale abandoned CART_READY (no PayPal) is released and the order cancelled', async () => {
    const gid = 'r-cart-orph';
    await seed(makeGroup(gid, ['rc1']));
    const bills = createPgRepositories(pool as any, async () => undefined).bills;
    // Process crashed AFTER the CART_READY order was saved but BEFORE PayPal
    // checkout started: the claim is stale and the order has no paypal_order_id.
    await seedCartReadyClaim('rc1', 'RC-ORPHAN', { claimedAtOld: true });
    const cleared = await bills.reconcileOrphanClaims();
    expect(cleared).toBe(1);
    // On real PostgreSQL these three effects are produced by ONE transaction
    // (claim DELETE + share unbind + order CANCEL commit together), so the
    // post-state is never torn: the share is free AND the orphan order is dead.
    // share is unbound → retryable
    const share = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['rc1']);
    expect(share.rows[0].order_id).toBeNull();
    // the orphaned order is cancelled so it can never be captured
    const ord = await pool.query('SELECT status FROM orders WHERE id=$1', ['RC-ORPHAN']);
    expect(ord.rows[0].status).toBe('ORDER_CANCELLED');
    // claim row is gone
    const claim = await pool.query('SELECT 1 FROM bill_share_claims WHERE share_id=$1', ['rc1']);
    expect(claim.rows).toHaveLength(0);
  });

  test('reconcileOrphanClaims: a stale CART_READY that already has a PayPal order is KEPT (active)', async () => {
    const gid = 'r-cart-active';
    await seed(makeGroup(gid, ['rc2']));
    const bills = createPgRepositories(pool as any, async () => undefined).bills;
    // PayPal checkout already started: paypal_order_id is present → ACTIVE.
    await seedCartReadyClaim('rc2', 'RC-ACTIVE', { paypalOrderId: 'PAYPAL-X', claimedAtOld: true });
    const cleared = await bills.reconcileOrphanClaims();
    expect(cleared).toBe(0); // active: must NOT be released (would allow double charge)
    const ord = await pool.query('SELECT status, paypal_order_id FROM orders WHERE id=$1', ['RC-ACTIVE']);
    expect(ord.rows[0].status).toBe('CART_READY'); // untouched
    expect(ord.rows[0].paypal_order_id).toBe('PAYPAL-X');
    const claim = await pool.query('SELECT 1 FROM bill_share_claims WHERE share_id=$1', ['rc2']);
    expect(claim.rows).toHaveLength(1); // claim preserved
    const share = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['rc2']);
    expect(share.rows[0].order_id).toBe('RC-ACTIVE'); // still bound
  });

  test('reconcileOrphanClaims: a recent in-flight CART_READY is KEPT by the TTL guard', async () => {
    const gid = 'r-cart-inflight';
    await seed(makeGroup(gid, ['rc3']));
    const bills = createPgRepositories(pool as any, async () => undefined).bills;
    // Checkout is in flight right now (no paypal_order_id yet) but the claim is
    // recent: the TTL guard must keep it so the active payment is not freed.
    await seedCartReadyClaim('rc3', 'RC-INFLIGHT', { claimedAtOld: false });
    const cleared = await bills.reconcileOrphanClaims();
    expect(cleared).toBe(0); // TTL not elapsed → kept
    const claim = await pool.query('SELECT 1 FROM bill_share_claims WHERE share_id=$1', ['rc3']);
    expect(claim.rows).toHaveLength(1);
    const share = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['rc3']);
    expect(share.rows[0].order_id).toBe('RC-INFLIGHT'); // still bound
  });

  test('reconcileOrphanClaims: after recovery the share can be claimed again with a new order (no second active order)', async () => {
    const gid = 'r-cart-retry';
    await seed(makeGroup(gid, ['rc4']));
    const bills = createPgRepositories(pool as any, async () => undefined).bills;
    await seedCartReadyClaim('rc4', 'RC-OLD', { claimedAtOld: true });
    const cleared = await bills.reconcileOrphanClaims();
    expect(cleared).toBe(1);
    // A fresh payment for the same share wins with a NEW order id.
    const won = await bills.claimShareForPayment('rc4', 'RC-NEW');
    expect(won).toBe(true);
    const share = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['rc4']);
    expect(share.rows[0].order_id).toBe('RC-NEW');
    // Exactly ONE binding ever exists on the share; the abandoned order stays
    // cancelled (never captured) and is NOT resurrected.
    const ord = await pool.query('SELECT status FROM orders WHERE id=$1', ['RC-OLD']);
    expect(ord.rows[0].status).toBe('ORDER_CANCELLED');
    // The per-share mutex rejects a simultaneous second claim for the same share.
    const second = await bills.claimShareForPayment('rc4', 'RC-OTHER');
    expect(second).toBe(false);
    const final = await pool.query('SELECT order_id FROM bill_shares WHERE id=$1', ['rc4']);
    expect(final.rows[0].order_id).toBe('RC-NEW'); // never RC-OTHER
  });
});

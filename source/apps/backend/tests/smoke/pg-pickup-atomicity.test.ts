/**
 * Real-PostgreSQL atomicity smoke test for the Order & Pickup Planner.
 *
 * This is where the DB-atomic DECISION is proven, because pg-mem cannot model
 * it (its transaction/ROLLBACK semantics and `IS NULL` handling are unreliable).
 * The guarantees covered here, using the SAME production repository that the
 * server uses (PgPickupRepository via createPgRepositories):
 *
 *   1. Capacity is contention-proof: a slot of capacity N with N+k CONCURRENT
 *      reserve() calls (distinct sessions, as a real storefront would issue)
 *      yields exactly N successes and k FULL rejections, and reserved_count == N.
 *      SELECT … FOR UPDATE serializes the capacity check + booking write.
 *
 *   2. Reconciliation maps the EXISTING orders.status → booking status WITHOUT
 *      touching the capture flow:
 *        - linked + PAID/ORDER_CONFIRMED → CONFIRMED (capacity kept)
 *        - linked + PAYMENT_FAILED/ORDER_CANCELLED → RELEASED (capacity freed once)
 *        - linked + CART_READY (ambiguous) → kept HELD (never fabricate)
 *        - UNLINKED past expires_at → RELEASED (definitive non-payment)
 *        - UNLINKED within expiry → kept HELD (TTL guard)
 *      The capacity counter is decremented ONLY on HELD → RELEASED, never on
 *      CONFIRMED, so re-running reconcile never double-decrements.
 *
 *   3. Release is idempotent on real PostgreSQL: a second release is a no-op.
 *
 *   4. Migration 008 created pickup_slots + pickup_bookings (with the partial
 *      unique index) — verified against the live catalog.
 *
 * Setup/cleanup are fault-tolerant:
 *   - If the real-PostgreSQL connection fails, a single `setup` test reports
 *     the failure; the business tests no-op and afterAll never touches an
 *     un-initialized pool or schema (no `Cannot read properties of undefined`).
 *   - Skipped, and reported BLOCKED, when DATABASE_URL is not set. A skip is NOT
 *     a pass; the proof must run on real PostgreSQL.
 *   DATABASE_URL=postgres://user:pass@host:5432/db npx jest -c jest.smoke.config.js tests/smoke/pg-pickup-atomicity.test.ts
 */
import { Client, Pool } from 'pg';
import { migrate } from '../../src/persistence/migrations';
import { createPgRepositories } from '../../src/persistence/pg-repositories';
import type { PickupSlotRow } from '../../src/persistence/types';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn('[smoke] BLOCKED: DATABASE_URL is not set. pg-pickup-atomicity was NOT executed.');
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

const pickup = (pool: Pool) => createPgRepositories(pool as any, async () => undefined).pickup;

function slotRow(id: string, capacity: number): PickupSlotRow {
  const day = '2030-08-01';
  return {
    id,
    day,
    startTs: new Date(`${day}T09:00:00Z`),
    endTs: new Date(`${day}T10:00:00Z`),
    capacity,
    reservedCount: 0,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

suite('pickup capacity + reconciliation on a real PostgreSQL server', () => {
  jest.setTimeout(120_000);
  let schema: string | undefined;
  let pool: Pool | null = null;
  let schemaCreated = false;
  let setupError: Error | null = null;

  // Provision an isolated schema, pool and migrations. If the real-PostgreSQL
  // connection fails we record it and let the single `setup` test report the
  // failure, instead of emitting ten misleading per-business-test failures.
  beforeAll(async () => {
    try {
      schema = `aicafe_pickup_${Date.now()}`;
      await admin(`CREATE SCHEMA "${schema}"`);
      schemaCreated = true;
      pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
      await migrate(pool as any, { advisoryLock: false });
    } catch (err) {
      setupError = err instanceof Error ? err : new Error(String(err));
    }
  });

  afterAll(async () => {
    // Close the pool only if it was successfully initialized.
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* best-effort */
      }
    }
    // Drop the schema only if the admin connection and schema creation succeeded.
    if (schemaCreated && schema) {
      try {
        await admin(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch {
        /* best-effort */
      }
    }
  });

  test('setup: connect to real PostgreSQL and provision isolated schema/migrations', () => {
    if (setupError) {
      throw new Error(`PostgreSQL setup failed (${setupError.name}): ${setupError.message}`);
    }
    expect(schemaCreated).toBe(true);
    expect(pool).not.toBeNull();
  });

  // Returns the live pool once setup succeeded; null when setup failed so the
  // business tests no-op (the `setup` test already fails the suite then).
  function requireSetup(): Pool | null {
    return setupError ? null : pool;
  }

  test('migrations 008+009 created pickup tables and both partial unique indexes', async () => {
    const p = requireSetup();
    if (!p) return;
    const { rows } = await p.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name IN ('pickup_slots','pickup_bookings')`
    );
    expect(rows.map((r: any) => r.table_name).sort()).toEqual(['pickup_bookings', 'pickup_slots']);
    const idx = await p.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'pickup_bookings'
       AND indexname IN ('pickup_bookings_order_uq','pickup_bookings_one_held_per_session_uq')`
    );
    expect(idx.rows.map((r: any) => r.indexname).sort()).toEqual([
      'pickup_bookings_one_held_per_session_uq',
      'pickup_bookings_order_uq',
    ]);
  });

  test('capacity N: N+k concurrent reserves yield exactly N OK and k FULL; reserved_count == N', async () => {
    const p = requireSetup();
    if (!p) return;
    const slotId = 'conc-N3';
    const N = 3;
    const k = 4;
    const total = N + k;
    await pickup(p).createSlot(slotRow(slotId, N));

    const results = await Promise.all(
      Array.from({ length: total }, (_, i) =>
        pickup(p).reserve({
          slotId,
          sessionId: `sess-${i}`, // distinct sessions: the realistic concurrent storefront case
          bookingId: `bk-${i}`,
          expiresAt: new Date(Date.now() + 600_000),
        })
      )
    );

    const oks = results.filter((r) => r === 'OK').length;
    const fulls = results.filter((r) => r === 'FULL').length;
    expect(oks).toBe(N);
    expect(fulls).toBe(k);

    const { rows } = await p.query('SELECT reserved_count FROM pickup_slots WHERE id = $1', [slotId]);
    expect(Number(rows[0].reserved_count)).toBe(N);

    // Exactly N booking rows were written (the k FULL calls wrote none).
    const bk = await p.query('SELECT count(*)::int AS n FROM pickup_bookings WHERE slot_id = $1', [slotId]);
    expect(bk.rows[0].n).toBe(N);
  });

  test('release is idempotent: a second release is a no-op and never decrements twice', async () => {
    const p = requireSetup();
    if (!p) return;
    const slotId = 'rel-idem';
    await pickup(p).createSlot(slotRow(slotId, 2));
    const r = await pickup(p).reserve({ slotId, sessionId: 'r-sess', bookingId: 'r-bk', expiresAt: new Date(Date.now() + 600_000) });
    expect(r).toBe('OK');

    const first = await pickup(p).release({ bookingId: 'r-bk', sessionId: 'r-sess' });
    expect(first).toBe('RELEASED');
    const after1 = await p.query('SELECT reserved_count FROM pickup_slots WHERE id = $1', [slotId]);
    expect(Number(after1.rows[0].reserved_count)).toBe(0);

    const second = await pickup(p).release({ bookingId: 'r-bk', sessionId: 'r-sess' });
    expect(second).toBe('ALREADY_RELEASED');
    const after2 = await p.query('SELECT reserved_count FROM pickup_slots WHERE id = $1', [slotId]);
    expect(Number(after2.rows[0].reserved_count)).toBe(0); // not -1, not re-decremented
  });

  test('same session: concurrent reserves yield exactly one HELD booking (unique index enforcement)', async () => {
    const p = requireSetup();
    if (!p) return;
    // Two reservations from the SAME session racing concurrently. They target
    // different slots so the per-slot capacity lock cannot serialize them; only
    // the partial unique index `pickup_bookings_one_held_per_session_uq` can
    // guarantee exactly one HELD row per session.
    const slotA = 'sess-race-a';
    const slotB = 'sess-race-b';
    await pickup(p).createSlot(slotRow(slotA, 5));
    await pickup(p).createSlot(slotRow(slotB, 5));
    const sessionId = 'same-session-race';

    // Two reserves on different slots, same session, fired at the same time.
    const results = await Promise.all([
      pickup(p).reserve({ slotId: slotA, sessionId, bookingId: 'sess-race-1', expiresAt: new Date(Date.now() + 600_000) }),
      pickup(p).reserve({ slotId: slotB, sessionId, bookingId: 'sess-race-2', expiresAt: new Date(Date.now() + 600_000) }),
    ]);

    const oks = results.filter((r) => r === 'OK').length;
    const already = results.filter((r) => r === 'ALREADY_HELD').length;
    expect(oks).toBe(1);
    expect(already).toBe(1);

    // Exactly ONE HELD booking exists for the session.
    const { rows } = await p.query(
      `SELECT count(*)::int AS n FROM pickup_bookings WHERE session_id = $1 AND status = 'HELD'`,
      [sessionId]
    );
    expect(rows[0].n).toBe(1);
    // The winning slot consumed capacity; the loser rolled back (capacity 0).
    const countA = await slotCount(p, slotA);
    const countB = await slotCount(p, slotB);
    expect(countA + countB).toBe(1);
  });

  // Helper: reserve a HELD booking, create an order in `orderStatus`, link them
  // (link returns OK while the order is not yet paid, leaving the booking HELD).
  async function seedLinked(p: Pool, slotId: string, bookingId: string, orderId: string, sessionId: string, orderStatus: string) {
    await pickup(p).createSlot(slotRow(slotId, 5));
    await pickup(p).reserve({ slotId, sessionId, bookingId, expiresAt: new Date(Date.now() + 600_000) });
    await p.query(
      `INSERT INTO orders (id, session_id, status, origin, items, total_minor, currency, created_at, updated_at)
       VALUES ($1,$2,$3,'HUMAN','[]',100,'EUR',now(),now())`,
      [orderId, sessionId, orderStatus]
    );
    return pickup(p).link({ bookingId, orderId, sessionId });
  }

  async function setOrderStatus(p: Pool, orderId: string, status: string) {
    await p.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, status]);
  }

  async function slotCount(p: Pool, slotId: string): Promise<number> {
    const { rows } = await p.query('SELECT reserved_count FROM pickup_slots WHERE id = $1', [slotId]);
    return Number(rows[0].reserved_count);
  }

  test('reconcile: linked booking + PAID → CONFIRMED, capacity kept', async () => {
    const p = requireSetup();
    if (!p) return;
    const slotId = 'rec-paid';
    const linkRes = await seedLinked(p, slotId, 'bp-paid', 'op-paid', 'sp-paid', 'CART_READY');
    expect(linkRes).toBe('OK'); // not paid yet → stays HELD
    await setOrderStatus(p, 'op-paid', 'PAID');
    const summary = await pickup(p).reconcile();
    expect(summary.confirmed).toBe(1);
    const { rows } = await p.query('SELECT status FROM pickup_bookings WHERE id = $1', ['bp-paid']);
    expect(rows[0].status).toBe('CONFIRMED');
    expect(await slotCount(p, slotId)).toBe(1); // capacity NOT freed for a paid booking
  });

  test('reconcile: linked booking + PAYMENT_FAILED → RELEASED, capacity freed once', async () => {
    const p = requireSetup();
    if (!p) return;
    const slotId = 'rec-fail';
    await seedLinked(p, slotId, 'bf-fail', 'of-fail', 'sf-fail', 'CART_READY');
    await setOrderStatus(p, 'of-fail', 'PAYMENT_FAILED');
    const summary = await pickup(p).reconcile();
    expect(summary.released).toBe(1);
    const { rows } = await p.query('SELECT status FROM pickup_bookings WHERE id = $1', ['bf-fail']);
    expect(rows[0].status).toBe('RELEASED');
    expect(await slotCount(p, slotId)).toBe(0); // capacity freed
  });

  test('reconcile: linked booking + CART_READY (ambiguous) → kept HELD, capacity kept', async () => {
    const p = requireSetup();
    if (!p) return;
    const slotId = 'rec-ambig';
    await seedLinked(p, slotId, 'ba-ambig', 'oa-ambig', 'sa-ambig', 'CART_READY');
    await pickup(p).reconcile();
    // Assert on THIS booking + its slot. The global reconcile summary counts every
    // HELD booking in the shared schema (other tests leave intentional HELD rows),
    // so we verify the decision on the specific row instead of the aggregate.
    const { rows } = await p.query('SELECT status FROM pickup_bookings WHERE id = $1', ['ba-ambig']);
    expect(rows[0].status).toBe('HELD'); // ambiguous → never fabricate a decision
    expect(await slotCount(p, slotId)).toBe(1); // capacity not freed
  });

  test('reconcile: UNLINKED booking past expires_at → RELEASED (definitive non-payment)', async () => {
    const p = requireSetup();
    if (!p) return;
    const slotId = 'rec-unlinked-expired';
    await pickup(p).createSlot(slotRow(slotId, 5));
    // Booking with NO order and an already-elapsed expiry.
    await pickup(p).reserve({ slotId, sessionId: 'su-exp', bookingId: 'bu-exp', expiresAt: new Date(Date.now() - 1000) });
    const summary = await pickup(p).reconcile();
    expect(summary.released).toBe(1);
    const { rows } = await p.query('SELECT status FROM pickup_bookings WHERE id = $1', ['bu-exp']);
    expect(rows[0].status).toBe('RELEASED');
    expect(await slotCount(p, slotId)).toBe(0);
  });

  test('reconcile: UNLINKED booking within expiry → kept HELD (TTL guard)', async () => {
    const p = requireSetup();
    if (!p) return;
    const slotId = 'rec-unlinked-kept';
    await pickup(p).createSlot(slotRow(slotId, 5));
    await pickup(p).reserve({ slotId, sessionId: 'su-keep', bookingId: 'bu-keep', expiresAt: new Date(Date.now() + 600_000) });
    await pickup(p).reconcile();
    // Same rationale as the ambiguous case: assert on the specific row + slot.
    const { rows } = await p.query('SELECT status FROM pickup_bookings WHERE id = $1', ['bu-keep']);
    expect(rows[0].status).toBe('HELD');
    expect(await slotCount(p, slotId)).toBe(1);
  });

  test('reconcile is idempotent: re-running after RELEASED does not double-decrement capacity', async () => {
    const p = requireSetup();
    if (!p) return;
    const slotId = 'rec-idem';
    await seedLinked(p, slotId, 'bi-idem', 'oi-idem', 'si-idem', 'CART_READY');
    await setOrderStatus(p, 'oi-idem', 'ORDER_CANCELLED');
    const first = await pickup(p).reconcile();
    expect(first.released).toBe(1);
    expect(await slotCount(p, slotId)).toBe(0);
    // Re-run: the booking is already RELEASED → transition is a no-op.
    const second = await pickup(p).reconcile();
    expect(second.released).toBe(0);
    expect(second.errors).toBe(0);
    expect(await slotCount(p, slotId)).toBe(0); // not -1, never re-decremented
  });
});

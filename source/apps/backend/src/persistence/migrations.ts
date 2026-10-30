import { Queryable } from './types';

// Forward-only, ordered migrations. They are embedded in code (not read from
// .sql files) so they always ship inside `dist/` with no build-copy step.
// NEVER edit a released migration: add a new one with the next id.
export interface Migration {
  id: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_init',
    statements: [
      `CREATE TABLE IF NOT EXISTS orders (
         id                  text PRIMARY KEY,
         session_id          text NOT NULL,
         status              text NOT NULL,
         origin              text NOT NULL,
         items               jsonb NOT NULL,
         total_minor         integer NOT NULL,
         currency            text NOT NULL,
         paypal_order_id     text,
         paypal_capture_id   text,
         paypal_status       text,
         idempotency_key     text,
         request_fingerprint text,
         reservation_id      text,
         capture_started_at  timestamptz,
         agent_context       jsonb,
         created_at          timestamptz NOT NULL,
         updated_at          timestamptz NOT NULL
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS orders_paypal_order_id_uq ON orders (paypal_order_id)`,
      `CREATE INDEX IF NOT EXISTS orders_idempotency_key_idx ON orders (idempotency_key)`,
      `CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status)`,
      `CREATE TABLE IF NOT EXISTS spend_reservations (
         id           text PRIMARY KEY,
         user_id      text NOT NULL,
         amount_minor integer NOT NULL,
         state        text NOT NULL,
         created_at   timestamptz NOT NULL,
         settled_at   timestamptz
       )`,
      `CREATE INDEX IF NOT EXISTS spend_reservations_state_idx ON spend_reservations (state)`,
      `CREATE TABLE IF NOT EXISTS sessions (
         session_id   text PRIMARY KEY,
         user_id      text NOT NULL,
         token_hash   text NOT NULL,
         created_at   timestamptz NOT NULL,
         last_seen_at timestamptz NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS idempotency_records (
         key         text PRIMARY KEY,
         status      integer NOT NULL,
         body        jsonb,
         fingerprint text NOT NULL,
         created_at  timestamptz NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idempotency_records_created_idx ON idempotency_records (created_at)`,
    ],
  },
  {
    id: '002_refunds_and_policy_events',
    statements: [
      `CREATE TABLE IF NOT EXISTS refund_requests (
         id                   text PRIMARY KEY,
         order_id             text NOT NULL,
         amount_minor         integer NOT NULL,
         currency             text NOT NULL,
         reason               text NOT NULL,
         proposed_by          text NOT NULL,
         status               text NOT NULL,
         paypal_refund_id     text,
         paypal_refund_status text,
         last_error           text,
         created_at           timestamptz NOT NULL,
         updated_at           timestamptz NOT NULL,
         decided_at           timestamptz
       )`,
      `CREATE INDEX IF NOT EXISTS refund_requests_order_idx ON refund_requests (order_id)`,
      `CREATE INDEX IF NOT EXISTS refund_requests_status_idx ON refund_requests (status)`,
      `CREATE TABLE IF NOT EXISTS policy_events (
         id          text PRIMARY KEY,
         user_id     text NOT NULL,
         occurred_at timestamptz NOT NULL,
         event       jsonb NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS policy_events_occurred_idx ON policy_events (occurred_at)`,
    ],
  },
  {
    id: '003_open_refund_uniqueness',
    statements: [
      // At most ONE open (PROPOSED or PROCESSING) refund per order, enforced by
      // the database so two instances cannot both create an open refund for the
      // same order. Closed rows (REFUNDED/REJECTED) are excluded, so a later
      // refund for the remaining amount is still allowed.
      `CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_open_uq
         ON refund_requests (order_id)
         WHERE status IN ('PROPOSED', 'PROCESSING')`,
    ],
  },
  {
    id: '004_webhook_events',
    statements: [
      // Durable webhook idempotency: an event id recorded here is never processed again, even after
      // a restart or redeploy (PayPal redelivers for days after a non-2xx or a timeout).
      `CREATE TABLE IF NOT EXISTS webhook_events (
         event_id     text PRIMARY KEY,
         processed_at timestamptz NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS webhook_events_processed_idx ON webhook_events (processed_at)`,
    ],
  },
  {
    id: '005_capture_claims',
    statements: [
      // Cross-instance capture mutex: at most one live claim per order. A claim older than its TTL
      // (crashed instance) can be taken over; PayPal still refuses a second real capture.
      `CREATE TABLE IF NOT EXISTS capture_claims (
         order_id   text PRIMARY KEY,
         claimed_at timestamptz NOT NULL
       )`,
    ],
  },
  {
    // A signed webhook that could not be applied (amount/currency mismatch or incomplete capture evidence)
    // is recorded here BEFORE the 2xx answer, so the hold is durable and visible to the merchant.
    id: '006_webhook_reviews',
    statements: [
      `CREATE TABLE IF NOT EXISTS webhook_reviews (
         event_id TEXT PRIMARY KEY,
         order_id TEXT NOT NULL,
         reason TEXT NOT NULL,
         expected_minor INTEGER NOT NULL,
         expected_currency TEXT NOT NULL,
         reported_value TEXT,
         reported_currency TEXT,
         capture_status TEXT,
         capture_id TEXT,
         recorded_at TIMESTAMPTZ NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS webhook_reviews_order_idx ON webhook_reviews (order_id)`,
    ],
  },
  {
    // Split Bill P3: durable groups/shares/invite nonces. The DB is the source of
    // truth for atomic decisions: the per-share payment claim (one order per share)
    // and the single-use nonce consumption + open-slot binding are enforced here
    // with atomic statements / row locks, not with the fire-and-forget write queue.
    id: '007_bill_persistence',
    statements: [
      `CREATE TABLE IF NOT EXISTS bill_groups (
         id text PRIMARY KEY,
         merchant_id text NOT NULL,
         currency text NOT NULL,
         total_minor integer NOT NULL,
         strategy text NOT NULL,
         created_by_user_id text NOT NULL,
         status text NOT NULL,
         items jsonb NOT NULL,
         created_at timestamptz NOT NULL,
         updated_at timestamptz NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS bill_shares (
         id text PRIMARY KEY,
         bill_id text NOT NULL REFERENCES bill_groups (id),
         participant_user_id text,
         amount_minor integer NOT NULL,
         status text NOT NULL,
         order_id text,
         paid_at timestamptz,
         created_at timestamptz NOT NULL,
         updated_at timestamptz NOT NULL
       )`,
      // At most ONE order ever bound to a share (duplicate-payment guard).
      // The binding is enforced by the unique index below AND by the atomic
      // `bill_share_claims` mutex table used by `claimShareForPayment`.
      `CREATE UNIQUE INDEX IF NOT EXISTS bill_shares_order_uq
         ON bill_shares (order_id) WHERE order_id IS NOT NULL`,
      // A participant may bind at most ONE share per bill.
      `CREATE UNIQUE INDEX IF NOT EXISTS bill_shares_one_per_user_uq
         ON bill_shares (bill_id, participant_user_id) WHERE participant_user_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS bill_shares_bill_idx ON bill_shares (bill_id)`,
      // Atomic per-share payment claim mutex (one live claim per share).
      // `INSERT … ON CONFLICT (share_id) DO NOTHING` makes exactly one of N
      // concurrent callers the winner; the losers get no row. This is the same
      // proven primitive as `captureClaims`, verified on both pg-mem and real
      // PostgreSQL. `claimed_at` drives the stale-claim (orphan) recovery TTL.
      `CREATE TABLE IF NOT EXISTS bill_share_claims (
         share_id text PRIMARY KEY,
         order_id text NOT NULL,
         claimed_at timestamptz NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS bill_share_claims_order_idx ON bill_share_claims (order_id)`,
      `CREATE TABLE IF NOT EXISTS bill_invite_nonces (
         nonce text PRIMARY KEY,
         bill_id text NOT NULL REFERENCES bill_groups (id),
         status text NOT NULL,
         expires_at timestamptz NOT NULL,
         created_at timestamptz NOT NULL,
         consumed_at timestamptz
       )`,
      `CREATE INDEX IF NOT EXISTS bill_invite_nonces_bill_idx ON bill_invite_nonces (bill_id)`,
    ],
  },
  {
    // Order & Pickup Planner (no capture / Split Bill changes). Two additive
    // tables only — the existing order lifecycle and PayPal capture flow are
    // untouched. The booking→order link is created by a SEPARATE, non-capture
    // endpoint, and reconciliation reads the EXISTING orders.status as the
    // authoritative payment result.
    id: '008_pickup_slots',
    statements: [
      // Pickup slots: one deliverable time window for the (single-tenant)
      // merchant. `reserved_count` is the authoritative, server-owned occupancy.
      // It is mutated ONLY inside a PostgreSQL transaction that also writes the
      // booking (SELECT … FOR UPDATE + server-side capacity check). The CHECK is
      // a backstop, NOT the concurrency guarantee.
      `CREATE TABLE IF NOT EXISTS pickup_slots (
         id            text PRIMARY KEY,
         day           date NOT NULL,
         start_ts      timestamptz NOT NULL,
         end_ts        timestamptz NOT NULL,
         capacity      integer NOT NULL CHECK (capacity >= 0),
         reserved_count integer NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
         version       integer NOT NULL DEFAULT 0,
         created_at    timestamptz NOT NULL,
         updated_at    timestamptz NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS pickup_slots_day_idx ON pickup_slots (day)`,

      // Pickup bookings: one per customer reservation. `order_id` is NULL until
      // the booking is linked to the order the customer actually pays (linked by
      // a separate, non-capture endpoint that verifies same-session ownership).
      // The booking is the durable, reliable relationship between a pickup slot
      // and an order; reconciliation maps orders.status → booking status and
      // NEVER trusts the client.
      `CREATE TABLE IF NOT EXISTS pickup_bookings (
         id           text PRIMARY KEY,
         slot_id      text NOT NULL REFERENCES pickup_slots (id),
         order_id     text REFERENCES orders (id),
         session_id   text NOT NULL,
         status       text NOT NULL,
         created_at   timestamptz NOT NULL,
         updated_at   timestamptz NOT NULL,
         expires_at   timestamptz NOT NULL
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS pickup_bookings_order_uq
         ON pickup_bookings (order_id) WHERE order_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS pickup_bookings_slot_idx ON pickup_bookings (slot_id)`,
      `CREATE INDEX IF NOT EXISTS pickup_bookings_status_idx ON pickup_bookings (status)`,
    ],
  },
  {
    id: '009_pickup_one_held_per_session',
    statements: [
      // Enforces EXACTLY ONE active HELD booking per session at the database
      // level. This is what makes concurrent same-session reservations atomic:
      // two simultaneous `reserve()` calls cannot both insert a HELD row for the
      // same session — the second one is rejected with a unique_violation
      // (23505) inside its own transaction and maps to ALREADY_HELD. When a
      // booking transitions to CONFIRMED or RELEASED it stops matching the
      // predicate, so the session may reserve again. This is a backstop for the
      // per-session invariant; the slot's capacity guarantee remains the
      // SELECT … FOR UPDATE + atomic counter increment.
      `CREATE UNIQUE INDEX IF NOT EXISTS pickup_bookings_one_held_per_session_uq
         ON pickup_bookings (session_id) WHERE status = 'HELD'`,
    ],
  },
];

export interface MigrateOptions {
  /** Serialize concurrent deploys with a transaction-scoped advisory lock (real PostgreSQL only). */
  advisoryLock?: boolean;
}

interface TxClient extends Queryable {
  release(): void;
}
interface Connectable extends Queryable {
  connect(): Promise<TxClient>;
}

/** Applies pending migrations in one transaction. Safe to run on every boot. */
export async function migrate(pool: Connectable, options: MigrateOptions = {}): Promise<string[]> {
  // Probe first, create only when missing (also keeps in-memory PostgreSQL emulators
  // used by the tests happy). `IF NOT EXISTS` still protects two instances booting at once.
  try {
    await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
  } catch {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id         text PRIMARY KEY,
         applied_at timestamptz NOT NULL
       )`
    );
  }
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('BEGIN');
    if (options.advisoryLock !== false) {
      await client.query('SELECT pg_advisory_xact_lock($1)', [727001]);
    }
    const done = new Set<string>(
      (await client.query('SELECT id FROM schema_migrations')).rows.map((r: any) => r.id)
    );
    for (const migration of MIGRATIONS) {
      if (done.has(migration.id)) continue;
      for (const statement of migration.statements) {
        await client.query(statement);
      }
      await client.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)', [
        migration.id,
        new Date(),
      ]);
      applied.push(migration.id);
    }
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
  return applied;
}

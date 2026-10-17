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

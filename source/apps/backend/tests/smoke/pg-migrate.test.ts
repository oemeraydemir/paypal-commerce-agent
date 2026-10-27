/**
 * Real-PostgreSQL migration smoke test.
 *
 * This suite ONLY runs against an actual PostgreSQL server supplied via
 * DATABASE_URL. It never substitutes an in-memory emulator: if DATABASE_URL is
 * not set the suite is skipped and reports BLOCKED (a skip is not a pass).
 *
 * Run:
 *   DATABASE_URL=postgres://user:pass@host:5432/db npx jest -c jest.smoke.config.js
 */
import { Client, Pool } from 'pg';
import { MIGRATIONS, migrate } from '../../src/persistence/migrations';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn(
    '[smoke] BLOCKED: DATABASE_URL is not set. The real-PostgreSQL migration smoke test was NOT executed.'
  );
}

async function createSchema(connectionString: string, schema: string): Promise<void> {
  const admin = new Client({ connectionString });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.end();
  }
}

async function dropSchema(connectionString: string, schema: string): Promise<void> {
  const admin = new Client({ connectionString });
  await admin.connect();
  try {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.end();
  }
}

function poolFor(connectionString: string, schema: string): Pool {
  // `options` is applied to every connection the pool opens, so the unqualified
  // table names in the migrations resolve inside the throw-away schema.
  return new Pool({ connectionString, options: `-c search_path=${schema}` });
}

suite('PostgreSQL migrations against a real server', () => {
  jest.setTimeout(120_000);

  let schema: string;
  let pool: Pool;

  beforeAll(async () => {
    schema = `aicafe_smoke_${Date.now()}`;
    await createSchema(databaseUrl!, schema);
    pool = poolFor(databaseUrl!, schema);
    // Fail fast and loudly if the configured server is unreachable.
    const version = await pool.query('SHOW server_version');
    // eslint-disable-next-line no-console
    console.log(`[smoke] PostgreSQL server_version = ${version.rows[0].server_version}`);
  });

  afterAll(async () => {
    if (pool) await pool.end().catch(() => undefined);
    if (schema) await dropSchema(databaseUrl!, schema).catch(() => undefined);
  });

  test('applies every migration once, is idempotent, and creates the required tables/indexes', async () => {
    const expected = MIGRATIONS.map((m) => m.id);

    const first = await migrate(pool as any, { advisoryLock: false });
    expect(first).toEqual(expected);

    const second = await migrate(pool as any, { advisoryLock: false });
    expect(second).toEqual([]);

    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [schema]
    );
    const tableNames = tables.rows.map((r: any) => r.table_name);
    for (const table of [
      'schema_migrations',
      'orders',
      'spend_reservations',
      'sessions',
      'idempotency_records',
      'refund_requests',
      'policy_events',
    ]) {
      expect(tableNames).toContain(table);
    }

    const indexes = await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = $1`, [
      schema,
    ]);
    const indexNames = indexes.rows.map((r: any) => r.indexname);
    for (const index of [
      'orders_paypal_order_id_uq',
      'orders_idempotency_key_idx',
      'refund_requests_order_idx',
      'refund_requests_status_idx',
      'refund_requests_open_uq',
      'policy_events_occurred_idx',
    ]) {
      expect(indexNames).toContain(index);
    }

    const recorded = await pool.query('SELECT id FROM schema_migrations ORDER BY id');
    expect(recorded.rows.map((r: any) => r.id)).toEqual(expected);
  });

  test('a second instance booting at the same time cannot double-apply a migration', async () => {
    const concurrentSchema = `${schema}_conc`;
    await createSchema(databaseUrl!, concurrentSchema);
    const poolA = poolFor(databaseUrl!, concurrentSchema);
    const poolB = poolFor(databaseUrl!, concurrentSchema);
    try {
      // Pre-create the ledger so both transactions go straight to the advisory lock.
      await poolA.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL)`
      );
      const [appliedA, appliedB] = await Promise.all([
        migrate(poolA as any, { advisoryLock: true }),
        migrate(poolB as any, { advisoryLock: true }),
      ]);
      expect(appliedA.length + appliedB.length).toBe(MIGRATIONS.length);

      const recorded = await poolA.query('SELECT id FROM schema_migrations ORDER BY id');
      expect(recorded.rows.map((r: any) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
    } finally {
      await poolA.end().catch(() => undefined);
      await poolB.end().catch(() => undefined);
      await dropSchema(databaseUrl!, concurrentSchema).catch(() => undefined);
    }
  });
});

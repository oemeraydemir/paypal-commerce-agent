/**
 * Real-PostgreSQL durability and concurrency smoke test (no emulator).
 *
 * Skipped, and reported BLOCKED, when DATABASE_URL is not set. Each run uses a throw-away schema.
 *   DATABASE_URL=postgres://user:pass@host:5432/db npx jest -c jest.smoke.config.js tests/smoke/pg-durability.test.ts
 */
import { Client, Pool } from 'pg';

// paypal client is never used here, but webhook-service imports it.
jest.mock('../../src/paypal/client', () => ({ paypalClient: {} }));

import { webhookService } from '../../src/paypal/webhook-service';
import { attachPersistence, detachPersistence, PoolLike } from '../../src/persistence/init';
import { writeQueue, getRepos } from '../../src/persistence/registry';
import { createPgRepositories } from '../../src/persistence/pg-repositories';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn('[smoke] BLOCKED: DATABASE_URL is not set. pg-durability was NOT executed.');
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

suite('durability and concurrency on a real PostgreSQL server', () => {
  jest.setTimeout(120_000);
  let schema: string;
  let pool: Pool;

  beforeAll(async () => {
    schema = `aicafe_dur_${Date.now()}`;
    await admin(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await attachPersistence(pool as unknown as PoolLike, { advisoryLock: false });
  });

  afterAll(async () => {
    detachPersistence();
    await pool.end();
    await admin(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  });

  async function restart() {
    await writeQueue.idle();
    webhookService.reset(); // the process memory is gone
    detachPersistence();
    await attachPersistence(pool as unknown as PoolLike, { advisoryLock: false }); // boot: migrate + hydrate
  }

  test('a processed webhook event is still a duplicate after a restart', async () => {
    await webhookService.markProcessed('WH-REAL-1');
    expect(webhookService.isDuplicate('WH-REAL-1')).toBe(true);
    await restart();
    expect(webhookService.isDuplicate('WH-REAL-1')).toBe(true);
    expect(webhookService.isDuplicate('WH-REAL-UNKNOWN')).toBe(false);
  });

  test('ten concurrent deliveries of one event id leave exactly one row and no error', async () => {
    await Promise.all(Array.from({ length: 10 }, () => webhookService.markProcessed('WH-REAL-RACE')));
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM webhook_events WHERE event_id = 'WH-REAL-RACE'");
    expect(rows[0].n).toBe(1);
  });

  test('migrations are repeatable: a second boot changes nothing', async () => {
    const before = await pool.query('SELECT count(*)::int AS n FROM schema_migrations');
    await restart();
    const after = await pool.query('SELECT count(*)::int AS n FROM schema_migrations');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  test('the database allows only one open refund per order, even under concurrent inserts', async () => {
    const insert = (id: string) =>
      pool.query(
        `INSERT INTO refund_requests (id, order_id, amount_minor, currency, reason, proposed_by, status, created_at, updated_at)
         VALUES ($1, 'ORDER-RACE', 100, 'EUR', 'test', 'merchant', 'PROPOSED', now(), now())`,
        [id]
      );
    const results = await Promise.allSettled([insert('R1'), insert('R2'), insert('R3'), insert('R4')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM refund_requests WHERE order_id = 'ORDER-RACE'");
    expect(rows[0].n).toBe(1);
  });

  test('capture claim: of ten concurrent claimers exactly one wins, and release lets the next one in', async () => {
    const repos = getRepos()!;
    const wins = (await Promise.all(Array.from({ length: 10 }, () => repos.captureClaims.tryClaim('ORDER-CLAIM', 60_000)))).filter(Boolean);
    expect(wins).toHaveLength(1);
    await repos.captureClaims.release('ORDER-CLAIM');
    expect(await repos.captureClaims.tryClaim('ORDER-CLAIM', 60_000)).toBe(true);
    await repos.captureClaims.release('ORDER-CLAIM');
  });

  test('capture claim across two application instances (two pools, one database)', async () => {
    const second = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    try {
      const a = createPgRepositories(pool as unknown as PoolLike, async () => undefined);
      const b = createPgRepositories(second as unknown as PoolLike, async () => undefined);
      expect(await a.captureClaims.tryClaim('ORDER-TWO', 60_000)).toBe(true);
      expect(await b.captureClaims.tryClaim('ORDER-TWO', 60_000)).toBe(false); // instance B is refused
      await a.captureClaims.release('ORDER-TWO');
      expect(await b.captureClaims.tryClaim('ORDER-TWO', 60_000)).toBe(true);
      await b.captureClaims.release('ORDER-TWO');
    } finally {
      await second.end();
    }
  });

  test('a stale claim left by a crashed instance can be taken over; a fresh one cannot', async () => {
    const repos = getRepos()!;
    await pool.query("INSERT INTO capture_claims (order_id, claimed_at) VALUES ('ORDER-STALE', now() - interval '10 minutes')");
    expect(await repos.captureClaims.tryClaim('ORDER-STALE', 120_000)).toBe(true); // older than the TTL
    expect(await repos.captureClaims.tryClaim('ORDER-STALE', 120_000)).toBe(false); // now fresh
    await repos.captureClaims.release('ORDER-STALE');
  });

  test('a transaction that fails rolls back completely (no partial webhook/refund rows)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO webhook_events (event_id, processed_at) VALUES ('WH-ROLLBACK', now())");
      await expect(client.query("INSERT INTO webhook_events (event_id, processed_at) VALUES ('WH-ROLLBACK', now())")).rejects.toThrow();
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM webhook_events WHERE event_id = 'WH-ROLLBACK'");
    expect(rows[0].n).toBe(0);
  });

  test('database outage: a claim attempt fails closed, and the repository works again once it is back', async () => {
    const broken = new Pool({ connectionString: 'postgres://x:y@127.0.0.1:1/none' });
    try {
      const repos = createPgRepositories(broken as unknown as PoolLike, async () => undefined);
      await expect(repos.captureClaims.tryClaim('ORDER-DOWN', 1000)).rejects.toThrow();
    } finally {
      await broken.end().catch(() => undefined);
    }
    expect(await getRepos()!.captureClaims.tryClaim('ORDER-BACK', 1000)).toBe(true);
    await getRepos()!.captureClaims.release('ORDER-BACK');
  });
});

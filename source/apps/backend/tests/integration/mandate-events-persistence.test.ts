/**
 * Mandate Events P3: durable repository-layer tests on the pg-mem emulator.
 *
 * This exercises the REAL persistence path that the in-memory `mandateAudit`
 * hash-chain tests do NOT cover:
 *   - migration `013_mandate_events` creates the `mandate_events` table;
 *   - `PgMandateEventsRepository.append` / `loadAll` read and write it.
 *
 * pg-mem models PostgreSQL DDL (the CREATE TABLE) and plain CRUD, so this proves
 * the migration + repository column mapping actually work end-to-end. It is the
 * closest available substitute for a real-PostgreSQL run inside this sandbox.
 *
 * The literal real-DB gate is the smoke suite under tests/smoke/*, which runs
 * ONLY when DATABASE_URL points at a real PostgreSQL (no pg/pg_ctl/docker here,
 * so it is BLOCKED in this environment — verify there with
 * `DATABASE_URL=postgres://... npm run db:migrate && npm run test:smoke`).
 */
import { newDb } from 'pg-mem';
import { createPgRepositories } from '../../src/persistence/pg-repositories';
import { migrate } from '../../src/persistence/migrations';

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

describe('mandate_events repository: persistence round-trip', () => {
  test('append then loadAll round-trips the hash-chained event', async () => {
    const at = new Date('2026-01-01T00:00:00.000Z').toISOString();
    await repos.mandateEvents!.append({ userId: 'u1', seq: 1, event: { revision: 1, hash: 'abc' }, at });
    const all = await repos.mandateEvents!.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].userId).toBe('u1');
    expect(all[0].seq).toBe(1);
    expect(all[0].event).toMatchObject({ revision: 1, hash: 'abc' });
    expect(all[0].at).toBe(at);
  });

  test('append is idempotent: re-sending the same (user_id, seq) is a no-op', async () => {
    const at = new Date('2026-01-01T00:00:00.000Z').toISOString();
    await repos.mandateEvents!.append({ userId: 'u1', seq: 1, event: { revision: 1 }, at });
    await repos.mandateEvents!.append({ userId: 'u1', seq: 1, event: { revision: 1 }, at });
    const all = await repos.mandateEvents!.loadAll();
    expect(all).toHaveLength(1);
  });

  test('events for different users are kept distinct', async () => {
    const at = new Date('2026-01-01T00:00:00.000Z').toISOString();
    await repos.mandateEvents!.append({ userId: 'u1', seq: 1, event: { revision: 1 }, at });
    await repos.mandateEvents!.append({ userId: 'u2', seq: 1, event: { revision: 1 }, at });
    const all = await repos.mandateEvents!.loadAll();
    expect(all.map((e) => e.userId).sort()).toEqual(['u1', 'u2']);
  });
});

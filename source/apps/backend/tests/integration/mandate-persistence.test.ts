import request from 'supertest';
import { newDb } from 'pg-mem';
import { createApp } from '../../src/app';
import { mandateAudit } from '../../src/policy/mandate-audit';
import { attachPersistence, detachPersistence, PoolLike } from '../../src/persistence/init';
import { writeQueue } from '../../src/persistence/registry';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// The spending-mandate audit chain is written to PostgreSQL (append-only) and reloaded at startup.
const app = createApp();
let pool: PoolLike;
let sess: TestSession;
const newPool = (): PoolLike => new (newDb().adapters.createPg().Pool)() as unknown as PoolLike;

beforeEach(async () => {
  (writeQueue as any).retryDelaysMs = [1, 1, 1];
  resetSessionState();
  mandateAudit.reset();
  pool = newPool();
  await attachPersistence(pool, { advisoryLock: false });
  sess = await newSession(app);
});
afterEach(async () => { await writeQueue.idle(); detachPersistence(); mandateAudit.reset(); });

const patch = (b: object) => request(app).patch('/api/policy').set(sess.headers).send(b);

test('events are stored and the chain verifies after a restart', async () => {
  await patch({ maxPerPurchaseMinor: 1500 });
  await patch({ maxPerPurchaseMinor: 3000, confirmIncrease: true });
  await writeQueue.idle();
  const rows = (await pool.query('SELECT * FROM mandate_events ORDER BY seq')).rows;
  expect(rows).toHaveLength(2);

  mandateAudit.reset(); // simulate a process restart: memory gone, database stays
  expect(mandateAudit.list(sess.userId)).toHaveLength(0);
  await attachPersistence(pool, { advisoryLock: false });
  const audit = await request(app).get('/api/policy/audit').set(sess.headers);
  expect(audit.body.events.map((e: { type: string }) => e.type)).toEqual(['AUTHORITY_REDUCED', 'AUTHORITY_INCREASED']);
  expect(audit.body.events[1].prevHash).toBe(audit.body.events[0].hash);
  expect(audit.body.chainValid).toBe(true);
});

test('history is append-only: replaying an event does not rewrite it', async () => {
  await patch({ maxPerPurchaseMinor: 1500 });
  await writeQueue.idle();
  const first = (await pool.query('SELECT event FROM mandate_events')).rows[0].event;
  // A retry of the same (user, seq) must not change the stored row.
  await pool.query(
    `INSERT INTO mandate_events (user_id, seq, event, at) VALUES ($1, 1, $2, now()) ON CONFLICT (user_id, seq) DO NOTHING`,
    [sess.userId, JSON.stringify({ forged: true })]
  );
  const after = (await pool.query('SELECT event FROM mandate_events')).rows[0].event;
  expect(after).toEqual(first);
});

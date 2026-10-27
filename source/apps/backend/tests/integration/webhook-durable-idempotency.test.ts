import { newDb } from 'pg-mem';
import { webhookService } from '../../src/paypal/webhook-service';
import { attachPersistence, detachPersistence, PoolLike } from '../../src/persistence/init';
import { writeQueue, getRepos } from '../../src/persistence/registry';

// GAP-06: the webhook idempotency guard used to be an in-memory Set, so a restart (every Render
// deploy / spin-down) made a redelivered PayPal event look new. It is now backed by webhook_events.
jest.mock('../../src/paypal/client', () => ({ paypalClient: { getOrder: jest.fn() } }));

let pool: PoolLike;
const newPool = (): PoolLike => new (newDb().adapters.createPg().Pool)() as unknown as PoolLike;

/** Process restart: pending writes finish, memory is wiped, state is reloaded from the database. */
async function restart() {
  await writeQueue.idle();
  webhookService.reset();
  return attachPersistence(pool, { advisoryLock: false });
}

beforeEach(async () => {
  webhookService.reset();
  pool = newPool();
  await attachPersistence(pool, { advisoryLock: false });
});
afterEach(() => detachPersistence());

test('a processed event is still a duplicate after a restart', async () => {
  expect(webhookService.isDuplicate('WH-EVENT-1')).toBe(false);
  await webhookService.markProcessed('WH-EVENT-1');
  expect(webhookService.isDuplicate('WH-EVENT-1')).toBe(true);

  await restart();
  expect(webhookService.isDuplicate('WH-EVENT-1')).toBe(true); // reloaded from webhook_events
  expect(webhookService.isDuplicate('WH-EVENT-2')).toBe(false);
});

test('recording the same event id twice stores a single row', async () => {
  await webhookService.markProcessed('WH-DUP');
  await webhookService.markProcessed('WH-DUP');
  const { rows } = await pool.query("SELECT event_id FROM webhook_events WHERE event_id = 'WH-DUP'");
  expect(rows).toHaveLength(1);
});

test('a failed durable write keeps the in-memory guard and is retried by the sweeper', async () => {
  const repos = getRepos()!;
  const original = repos.webhookEvents.save;
  repos.webhookEvents.save = jest.fn().mockRejectedValue(new Error('db down'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);

  await webhookService.markProcessed('WH-RETRY');
  expect(webhookService.isDuplicate('WH-RETRY')).toBe(true); // still guarded in this process

  repos.webhookEvents.save = original; // database is back
  expect(await webhookService.retryDirty()).toBe(1);
  const { rows } = await pool.query("SELECT event_id FROM webhook_events WHERE event_id = 'WH-RETRY'");
  expect(rows).toHaveLength(1);
  jest.restoreAllMocks();
});

test('old event ids are purged, recent ones are kept', async () => {
  const repos = getRepos()!;
  await webhookService.markProcessed('WH-RECENT');
  await pool.query("INSERT INTO webhook_events (event_id, processed_at) VALUES ('WH-OLD', now() - interval '30 days')");
  const removed = await repos.webhookEvents.deleteOlderThan(new Date(Date.now() - 14 * 24 * 3600 * 1000));
  expect(removed).toBe(1);
  expect(await repos.webhookEvents.loadRecentIds(10)).toEqual(['WH-RECENT']);
});

test('without a database the guard still works in memory', async () => {
  detachPersistence();
  webhookService.reset();
  await webhookService.markProcessed('WH-MEM');
  expect(webhookService.isDuplicate('WH-MEM')).toBe(true);
});

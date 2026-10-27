import request from 'supertest';
import { newDb } from 'pg-mem';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { OrderService, createRequestFingerprint } from '../../src/orders/service';
import { OrderStatus } from '../../src/orders/domain';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { resetIdempotencyMemory } from '../../src/middleware/idempotency';
import { attachPersistence, detachPersistence, PoolLike } from '../../src/persistence/init';
import { getRepos, writeQueue } from '../../src/persistence/registry';
import { migrate } from '../../src/persistence/migrations';
import { reconcileAfterRestart } from '../../src/orders/payment-lifecycle';
import { sessionStore } from '../../src/session';
import { validateOrderItems } from '../../src/orders/validation';
import { CatalogService } from '../../src/catalog/service';
import { createHash } from 'crypto';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn(), getRefund: jest.fn() },
}));
const mockCreate = paypalClient.createOrder as jest.Mock;
const mockCapture = paypalClient.captureOrder as jest.Mock;
const mockGet = paypalClient.getOrder as jest.Mock;

const app = createApp();
const orderService = OrderService.getInstance();
const ITEMS = [{ productId: 'coffee', quantity: 1 }];

let pool: PoolLike;
let sess: TestSession;
let seq = 0;

const approve = (id: string) => ({
  id,
  status: 'CREATED',
  links: [{ rel: 'approve', href: `https://sandbox.paypal.com/checkoutnow?token=${id}` }],
});
const completed = (id: string, cap = 'CAP-1') => ({
  id,
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: cap, status: 'COMPLETED', amount: { value: '3.00', currency_code: 'EUR' } }] } }],
});

function newPool(): PoolLike {
  const { Pool } = newDb().adapters.createPg();
  return new Pool() as unknown as PoolLike;
}

function wipeMemory(): void {
  orderService.reset();
  dailySpendTracker.reset();
  sessionStore.reset();
  resetIdempotencyMemory();
}

/** Process restart: pending writes finished (graceful), memory gone, state reloaded. */
async function restart(opts: { flush?: boolean } = {}) {
  if (opts.flush !== false) await writeQueue.idle();
  wipeMemory();
  return attachPersistence(pool, { advisoryLock: false });
}

const create = (s: TestSession, key?: string, body: any = { items: ITEMS }) => {
  const r = request(app).post('/api/orders/create').set(s.headers);
  if (key) r.set('Idempotency-Key', key);
  return r.send(body);
};

const dbOrders = async () => (await pool.query('SELECT * FROM orders ORDER BY created_at')).rows;

beforeEach(async () => {
  (writeQueue as any).retryDelaysMs = [1, 1, 1]; // keep failure paths fast
  seq = 0;
  resetSessionState();
  wipeMemory();
  mockCreate.mockReset();
  mockCapture.mockReset();
  mockGet.mockReset();
  mockCreate.mockImplementation(async () => approve(`PP-${++seq}`));
  pool = newPool();
  await attachPersistence(pool, { advisoryLock: false });
  sess = await newSession(app);
});

afterEach(async () => {
  await writeQueue.idle();
  detachPersistence();
  wipeMemory();
});

describe('migrations', () => {
  test('are idempotent: a second run applies nothing', async () => {
    const fresh = newPool();
    expect(await migrate(fresh as any, { advisoryLock: false })).toEqual([
      '001_init',
      '002_refunds_and_policy_events',
      '003_open_refund_uniqueness',
      '004_webhook_events',
      '005_capture_claims',
      '006_webhook_reviews',
    ]);
    expect(await migrate(fresh as any, { advisoryLock: false })).toEqual([]);
  });

  test('enforce at most one open refund per order at the database level', async () => {
    const orderId = `order-open-${Date.now()}`;
    const insert = (id: string, status: string) =>
      pool.query(
        `INSERT INTO refund_requests
           (id, order_id, amount_minor, currency, reason, proposed_by, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, orderId, 100, 'EUR', 'test', 'MERCHANT', status, new Date(), new Date()]
      );

    await insert(`open-1-${orderId}`, 'PROPOSED');
    await expect(insert(`open-2-${orderId}`, 'PROCESSING')).rejects.toThrow();
    // A closed row for the same order is allowed (refund of the remaining amount).
    await insert(`closed-${orderId}`, 'REFUNDED');
  });
});

describe('restart durability', () => {
  test('orders, PayPal references, reservations and the session survive a restart', async () => {
    const res = await create(sess, 'k-restart');
    expect(res.status).toBe(201);
    const { orderId, paypalOrderId } = res.body;

    const status = await restart();
    expect(status.ordersLoaded).toBe(1);

    const order = orderService.getById(orderId)!;
    expect(order.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(order.paypalOrderId).toBe(paypalOrderId);
    expect(order.sessionId).toBe(sess.sessionId);
    // the webhook correlates by PayPal order id: must work right after a restart
    expect(orderService.getByPayPalOrderId(paypalOrderId)?.id).toBe(orderId);
    // the daily-budget reservation is back too
    expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(300);
    // the client keeps its session (token still verifies) and sees its order
    expect(sessionStore.verify(sess.sessionId, sess.token)).not.toBeNull();
    const list = await request(app).get('/api/orders');
    expect(list.body.orders.map((o: any) => o.id)).toContain(orderId);
  });

  test('confirmed daily spend is rebuilt after a restart', async () => {
    const res = await create(sess, 'k-spend');
    mockCapture.mockResolvedValue(completed(res.body.paypalOrderId));
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
    expect(cap.status).toBe(200);
    expect(cap.body.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(sess.userId)).toBe(300);

    await restart();
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(sess.userId)).toBe(300);
    expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(0);
  });

  test('a session ended before the restart stays ended', async () => {
    const gone = await newSession(app);
    await request(app).delete('/api/sessions/current').set(gone.headers);
    await restart();
    expect(sessionStore.verify(gone.sessionId, gone.token)).toBeNull();
    expect(sessionStore.verify(sess.sessionId, sess.token)).not.toBeNull();
  });

  test('/api/health reports durable storage', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.storage).toEqual({ mode: 'postgres', durable: true });
  });
});

describe('idempotency: no duplicate order or payment', () => {
  test('the same request after a restart replays the stored answer', async () => {
    const first = await create(sess, 'k-replay');
    await restart();
    const second = await create(sess, 'k-replay');
    expect(second.status).toBe(201);
    expect(second.body.orderId).toBe(first.body.orderId);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(await dbOrders()).toHaveLength(1);
  });

  test('same key + different body is still refused after a restart', async () => {
    await create(sess, 'k-diff');
    await restart();
    const res = await create(sess, 'k-diff', { items: [{ productId: 'coffee', quantity: 2 }] });
    expect(res.status).toBe(409);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test('crash after the order row but before the response was cached: retry reuses the order', async () => {
    const first = await create(sess, 'k-lost-record');
    await writeQueue.idle();
    await pool.query('DELETE FROM idempotency_records'); // the cached answer never reached the DB
    await restart();
    mockGet.mockResolvedValue(approve(first.body.paypalOrderId));

    const retry = await create(sess, 'k-lost-record');
    expect(retry.status).toBe(201);
    expect(retry.body.orderId).toBe(first.body.orderId);
    expect(retry.body.paypalOrderId).toBe(first.body.paypalOrderId);
    expect(retry.body.approvalUrl).toContain(first.body.paypalOrderId);
    expect(mockCreate).toHaveBeenCalledTimes(1); // no second PayPal order
    expect(await dbOrders()).toHaveLength(1); // no second order
  });

  test('crash after the order row but before PayPal was called: retry resumes the SAME order', async () => {
    const key = 'k-resume';
    const hashed = createHash('sha256').update(`${sess.sessionId}:${key}`).digest('hex');
    const items = validateOrderItems(ITEMS, new CatalogService());
    // State left behind by a crash between the write-ahead and the PayPal call:
    const stuck = orderService.create(
      sess.sessionId, items, 'EUR', 'HUMAN' as any, hashed, createRequestFingerprint({ sessionId: sess.sessionId, items: ITEMS })
    );
    const reservation = dailySpendTracker.tryReserve(sess.userId, stuck.totalMinor, 10_000)!;
    orderService.setReservationId(stuck.id, reservation.id);
    await orderService.saveNow(stuck.id);
    await restart();

    const retry = await create(sess, key);
    expect(retry.status).toBe(201);
    expect(retry.body.orderId).toBe(stuck.id);
    expect(retry.body.paypalOrderId).toBe('PP-1');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(await dbOrders()).toHaveLength(1);
    // the reservation is reused, not doubled
    expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(300);
  });
});

describe('write-ahead and crash around the PayPal capture', () => {
  test('the order and its reservation are durable BEFORE PayPal is contacted', async () => {
    mockCreate.mockImplementationOnce(async () => {
      const rows = await dbOrders();
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('CART_READY');
      expect(rows[0].paypal_order_id).toBeNull();
      const res = await pool.query('SELECT * FROM spend_reservations');
      expect(res.rows).toHaveLength(1);
      return approve('PP-WA');
    });
    const res = await create(sess, 'k-wa');
    expect(res.status).toBe(201);
    await writeQueue.idle();
    expect((await dbOrders())[0].paypal_order_id).toBe('PP-WA');
  });

  test('capture attempt is marked durably BEFORE PayPal captures', async () => {
    const res = await create(sess, 'k-cap-wa');
    await writeQueue.idle();
    mockCapture.mockImplementationOnce(async () => {
      const rows = await dbOrders();
      expect(rows[0].capture_started_at).not.toBeNull();
      return completed(res.body.paypalOrderId);
    });
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
    expect(cap.status).toBe(200);
  });

  test('PayPal captured, process died before saving: startup reconciliation settles it from PayPal', async () => {
    const res = await create(sess, 'k-crash');
    await writeQueue.idle();
    const repos = getRepos()!;

    mockCapture.mockImplementationOnce(async () => {
      // from here on the database is "gone": the result of the capture cannot be saved
      jest.spyOn(repos.orders, 'save').mockRejectedValue(new Error('db down'));
      jest.spyOn(repos.reservations, 'save').mockRejectedValue(new Error('db down'));
      return completed(res.body.paypalOrderId, 'CAP-CRASH');
    });
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
    expect(cap.status).toBe(200); // money moved: a storage error must not become a failed payment
    await writeQueue.idle();

    // Database state at "crash" time: still PAYMENT_PENDING, but with the write-ahead marker.
    jest.restoreAllMocks();
    const [row] = await dbOrders();
    expect(row.status).toBe('PAYMENT_PENDING');
    expect(row.capture_started_at).not.toBeNull();

    await restart({ flush: false });
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAYMENT_PENDING);

    mockGet.mockResolvedValue(completed(res.body.paypalOrderId, 'CAP-CRASH'));
    const summary = await reconcileAfterRestart();
    expect(summary).toMatchObject({ examined: 1, settled: 1, errors: 0 });

    const healed = orderService.getById(res.body.orderId)!;
    expect(healed.status).toBe(OrderStatus.PAID);
    expect(healed.paypalCaptureId).toBe('CAP-CRASH');
    expect(dailySpendTracker.getSpentToday(sess.userId)).toBe(300);
    await writeQueue.idle();
    expect((await dbOrders())[0].status).toBe('PAID'); // and it is durable again
  });

  test('startup reconciliation keeps the order pending when PayPal cannot be reached', async () => {
    await create(sess, 'k-offline');
    await restart();
    mockGet.mockRejectedValue(new Error('network'));
    const summary = await reconcileAfterRestart();
    expect(summary).toMatchObject({ examined: 1, settled: 0, errors: 1 });
  });
});

describe('storage failures fail safe', () => {
  test('if the order cannot be stored, PayPal is never contacted and nothing stays reserved', async () => {
    jest.spyOn(getRepos()!.orders, 'save').mockRejectedValue(new Error('db down'));
    const res = await create(sess, 'k-down');
    expect(res.status).toBe(503);
    expect(mockCreate).not.toHaveBeenCalled();
    await writeQueue.idle();
    expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(0);
    jest.restoreAllMocks();
  });

  test('if the PayPal order id cannot be stored, no approval link is handed out', async () => {
    const repos = getRepos()!;
    let calls = 0;
    const real = repos.orders.save.bind(repos.orders);
    jest.spyOn(repos.orders, 'save').mockImplementation(async (o: any) => {
      calls++;
      if (calls >= 2) throw new Error('db down'); // write-ahead ok, PayPal-id write fails
      return real(o);
    });
    const res = await create(sess, 'k-half');
    expect(res.status).toBe(503);
    expect(res.body.approvalUrl).toBeUndefined();
    jest.restoreAllMocks();
    await writeQueue.idle();
    expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(0);
  });

  test('if the capture attempt cannot be recorded, PayPal is not asked to capture', async () => {
    const res = await create(sess, 'k-nocap');
    await writeQueue.idle();
    jest.spyOn(getRepos()!.orders, 'save').mockRejectedValue(new Error('db down'));
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
    expect(cap.status).toBe(503);
    expect(mockCapture).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

describe('payment status is never taken from the client or the AI', () => {
  test('status / capture fields in the create body are ignored', async () => {
    const res = await create(sess, 'k-forge', {
      items: ITEMS,
      status: 'PAID',
      paypalCaptureId: 'FORGED',
      reservationId: 'FORGED',
    });
    expect(res.status).toBe(201);
    const order = orderService.getById(res.body.orderId)!;
    expect(order.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(order.paypalCaptureId).toBeUndefined();
    expect(order.reservationId).not.toBe('FORGED');
  });

  test('a forged status in the capture body cannot mark an unapproved order paid', async () => {
    const res = await create(sess, 'k-forge2');
    mockCapture.mockRejectedValue({ details: [{ issue: 'ORDER_NOT_APPROVED' }] });
    const cap = await request(app)
      .post(`/api/orders/${res.body.orderId}/capture`)
      .set(sess.headers)
      .send({ status: 'PAID', paypalStatus: 'COMPLETED' });
    expect(cap.status).toBe(400);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });
});

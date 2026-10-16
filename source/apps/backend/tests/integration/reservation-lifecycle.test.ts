import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { OrderStatus } from '../../src/orders/domain';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { getDemoUserId } from '../../src/policy/default-policy';
import { webhookService } from '../../src/paypal/webhook-service';
import { captureLock } from '../../src/orders/capture-lock';
import { reconcileExpiredReservations } from '../../src/orders/payment-lifecycle';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// PayPal is mocked: these tests prove OUR lifecycle logic against simulated
// PayPal responses. They do NOT replace a real PayPal Sandbox run.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
    getOrder: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  },
}));

const app = createApp();
const orderService = OrderService.getInstance();
const pp = paypalClient as unknown as Record<'createOrder' | 'captureOrder' | 'getOrder' | 'verifyWebhookSignature', jest.Mock>;
let USER = getDemoUserId(); // reassigned to the per-test session's user
let sess: TestSession;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

let seq = 0;
const COMPLETED = {
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED' }] } }],
};
const ppOrder = (status: string, captureStatus?: string) => ({
  status,
  purchaseUnits: [{ payments: { captures: captureStatus ? [{ id: 'CAP-Z', status: captureStatus }] : [] } }],
});

async function create(sessionId: string, items = [{ productId: 'coffee', quantity: 2 }]) {
  const ppId = `PP-LC-${++seq}`;
  pp.createOrder.mockResolvedValueOnce({
    id: ppId,
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/approve' }],
  });
  const res = await request(app)
    .post('/api/orders/create').set(sess.headers)
    .set('Idempotency-Key', `lc-${sessionId}-${++seq}`)
    .send({ items });
  expect(res.status).toBe(200);
  return { id: res.body.orderId as string, ppId };
}

async function webhook(eventType: string, ppId: string, eventId = `WH-LC-${++seq}`) {
  return request(app)
    .post('/api/webhooks/paypal')
    .set('Content-Type', 'application/json')
    .set('paypal-transmission-id', 't')
    .set('paypal-transmission-time', new Date().toISOString())
    .set('paypal-transmission-sig', 's')
    .set('paypal-cert-url', 'https://example.com/c')
    .set('paypal-auth-algo', 'SHA256withRSA')
    .send({
      id: eventId,
      event_type: eventType,
      resource: { id: 'CAP-WH', supplementary_data: { related_ids: { order_id: ppId } } },
    });
}

const waitFor = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(cond()).toBe(true);
};

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  USER = sess.userId;
  Object.values(pp).forEach((m) => m.mockReset());
  pp.verifyWebhookSignature.mockResolvedValue({ verification_status: 'SUCCESS' });
  pp.captureOrder.mockResolvedValue(COMPLETED);
  orderService.reset();
  policyStorage.reset();
  dailySpendTracker.reset();
  captureLock.reset();
  (webhookService as any).processedEvents.clear();
});

describe('reconcileExpiredReservations', () => {
  test('does not touch reservations younger than the TTL (no PayPal call)', async () => {
    await create('young');
    const s = await reconcileExpiredReservations({ ttlMs: HOUR });
    expect(s.examined).toBe(0);
    expect(pp.getOrder).not.toHaveBeenCalled();
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600);
  });

  test('NOT_APPROVED after TTL -> expire reservation, cancel order; a later capture is refused', async () => {
    const { id } = await create('na');
    pp.getOrder.mockResolvedValue(ppOrder('CREATED'));
    const s = await reconcileExpiredReservations({ now: Date.now() + DAY });
    expect(s).toMatchObject({ examined: 1, released: 1 });
    expect(orderService.getById(id)!.status).toBe(OrderStatus.ORDER_CANCELLED);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);

    const cap = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect(cap.status).toBe(400);
    expect(pp.captureOrder).not.toHaveBeenCalled();
  });

  test('APPROVED (buyer mid-flow) is kept until the hard max age, then released', async () => {
    const { id } = await create('approved');
    pp.getOrder.mockResolvedValue(ppOrder('APPROVED'));
    const early = await reconcileExpiredReservations({ ttlMs: HOUR, maxAgeMs: DAY, now: Date.now() + 2 * HOUR });
    expect(early).toMatchObject({ examined: 1, kept: 1, released: 0 });
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600);

    const late = await reconcileExpiredReservations({ ttlMs: HOUR, maxAgeMs: DAY, now: Date.now() + 2 * DAY });
    expect(late.released).toBe(1);
    expect(orderService.getById(id)!.status).toBe(OrderStatus.ORDER_CANCELLED);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });

  test.each([
    ['capture PENDING', ppOrder('COMPLETED', 'PENDING')],
    ['unknown status', { status: 'MYSTERY' }],
    ['COMPLETED without capture evidence', ppOrder('COMPLETED')],
  ])('%s is kept even far past the max age (never guess)', async (_n, result) => {
    const { id } = await create('keep');
    pp.getOrder.mockResolvedValue(result);
    const s = await reconcileExpiredReservations({ now: Date.now() + 30 * DAY });
    expect(s).toMatchObject({ examined: 1, kept: 1, released: 0 });
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600);
    expect(orderService.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('definitive DECLINED at PayPal -> release and fail the order', async () => {
    const { id } = await create('declined');
    pp.getOrder.mockResolvedValue(ppOrder('COMPLETED', 'DECLINED'));
    const s = await reconcileExpiredReservations({ now: Date.now() + DAY });
    expect(s.released).toBe(1);
    expect(orderService.getById(id)!.status).toBe(OrderStatus.PAYMENT_FAILED);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });

  test('orphan reservation (no order) and order without a PayPal id are expired without a PayPal call', async () => {
    dailySpendTracker.tryReserve(USER, 700, 10000); // orphan
    const o = orderService.create('s', [{ productId: 'coffee', name: 'c', quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300 }], 'EUR', 'HUMAN' as any);
    const r = dailySpendTracker.tryReserve(USER, 300, 10000)!;
    o.reservationId = r.id;
    const s = await reconcileExpiredReservations({ now: Date.now() + DAY });
    expect(s.released).toBe(2);
    expect(pp.getOrder).not.toHaveBeenCalled();
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });

  test('skips an order whose capture is in flight', async () => {
    const { id } = await create('inflight');
    captureLock.acquire(id);
    const s = await reconcileExpiredReservations({ now: Date.now() + DAY });
    expect(s).toMatchObject({ examined: 1, kept: 1 });
    expect(pp.getOrder).not.toHaveBeenCalled();
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600);
  });
});

describe('races and replays', () => {
  test('late COMPLETED webhook after the reservation EXPIRED still books the spend and marks PAID', async () => {
    const { id, ppId } = await create('late');
    pp.getOrder.mockResolvedValue(ppOrder('CREATED'));
    await reconcileExpiredReservations({ now: Date.now() + DAY });
    expect(orderService.getById(id)!.status).toBe(OrderStatus.ORDER_CANCELLED);

    expect((await webhook('PAYMENT.CAPTURE.COMPLETED', ppId)).status).toBe(200);
    expect(orderService.getById(id)!.status).toBe(OrderStatus.PAID);
    expect(orderService.getById(id)!.paypalCaptureId).toBe('CAP-WH');
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });

  test('DENIED then a later COMPLETED (successful retry at PayPal) ends PAID with spend booked once', async () => {
    const { id, ppId } = await create('denied-then-ok');
    await webhook('PAYMENT.CAPTURE.DENIED', ppId);
    expect(orderService.getById(id)!.status).toBe(OrderStatus.PAYMENT_FAILED);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(0);
    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId);
    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId);
    expect(orderService.getById(id)!.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
  });

  test('webhook COMPLETED arriving WHILE the capture request is in flight: spend booked exactly once', async () => {
    const { id, ppId } = await create('race');
    let resolveCapture!: (v: any) => void;
    pp.captureOrder.mockReset();
    pp.captureOrder.mockReturnValueOnce(new Promise((r) => (resolveCapture = r)));

    const capturePromise = request(app).post(`/api/orders/${id}/capture`).set(sess.headers).then((r) => r);
    await waitFor(() => pp.captureOrder.mock.calls.length === 1);

    expect((await webhook('PAYMENT.CAPTURE.COMPLETED', ppId)).status).toBe(200);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);

    resolveCapture(COMPLETED);
    const res = await capturePromise;
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600); // not 1200
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });

  test('a late PENDING capture response never downgrades an order the webhook already marked PAID', async () => {
    const { id, ppId } = await create('no-downgrade');
    let resolveCapture!: (v: any) => void;
    pp.captureOrder.mockReset();
    pp.captureOrder.mockReturnValueOnce(new Promise((r) => (resolveCapture = r)));
    const capturePromise = request(app).post(`/api/orders/${id}/capture`).set(sess.headers).then((r) => r);
    await waitFor(() => pp.captureOrder.mock.calls.length === 1);

    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId);
    resolveCapture({ ...COMPLETED, status: 'PENDING' });
    await capturePromise;
    expect(orderService.getById(id)!.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
  });

  test('a second concurrent capture is rejected without a second PayPal call', async () => {
    const { id } = await create('dup-capture');
    let resolveCapture!: (v: any) => void;
    pp.captureOrder.mockReset();
    pp.captureOrder.mockReturnValueOnce(new Promise((r) => (resolveCapture = r)));
    const first = request(app).post(`/api/orders/${id}/capture`).set(sess.headers).then((r) => r);
    await waitFor(() => pp.captureOrder.mock.calls.length === 1);

    const second = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/in progress/i);

    resolveCapture(COMPLETED);
    expect((await first).status).toBe(200);
    expect(pp.captureOrder).toHaveBeenCalledTimes(1);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
    expect(captureLock.isHeld(id)).toBe(false); // lock released
  });

  test('capture response lost (502) then retried: ORDER_ALREADY_CAPTURED is settled from PayPal -> PAID + spend booked', async () => {
    const { id } = await create('lost-response');
    pp.captureOrder.mockReset();
    pp.captureOrder.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect((await request(app).post(`/api/orders/${id}/capture`).set(sess.headers)).status).toBe(502);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(0);

    pp.captureOrder.mockRejectedValueOnce({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
    pp.getOrder.mockResolvedValueOnce(COMPLETED);
    const retry = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect(retry.status).toBe(409);
    expect(retry.body.details).toEqual({ settled: true });
    expect(orderService.getById(id)!.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);

    // Further retries are idempotent.
    const again = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect(again.status).toBe(409);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
  });

  test('the capture lock is released even when capture throws', async () => {
    const { id } = await create('lock-release');
    pp.captureOrder.mockReset();
    pp.captureOrder.mockRejectedValueOnce(new Error('boom'));
    expect((await request(app).post(`/api/orders/${id}/capture`).set(sess.headers)).status).toBe(502);
    expect(captureLock.isHeld(id)).toBe(false);
  });
});

describe('server restart (in-memory state lost)', () => {
  test('webhook replay after the dedup set is lost does not double count', async () => {
    const { ppId } = await create('restart-dedup');
    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId, 'WH-SAME');
    (webhookService as any).processedEvents.clear(); // simulates losing the dedup set
    expect((await webhook('PAYMENT.CAPTURE.COMPLETED', ppId, 'WH-SAME')).status).toBe(200);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
  });

  test('after a full state loss, a COMPLETED webhook for an unknown order is kept retryable (503) and books no spend', async () => {
    const { ppId } = await create('restart-full');
    orderService.reset();
    dailySpendTracker.reset();
    (webhookService as any).processedEvents.clear();

    const res = await webhook('PAYMENT.CAPTURE.COMPLETED', ppId);
    // Not 2xx: PayPal keeps retrying for up to 3 days so the real capture is not
    // silently lost after an in-memory restart. No spend is invented here.
    expect(res.status).toBe(503);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(0);
    // KNOWN LIMITATION (documented, not fixed here): with in-memory storage the
    // payment is real at PayPal but invisible to this instance after a restart.
    expect((await reconcileExpiredReservations({ now: Date.now() + DAY })).examined).toBe(0);
  });
});

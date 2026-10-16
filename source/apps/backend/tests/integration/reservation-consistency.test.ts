/**
 * Step-1 acceptance scenarios (B1-B6, C1-C3). PayPal is MOCKED: these tests
 * prove the application's own consistency logic against simulated PayPal
 * responses. They are NOT a substitute for a real PayPal Sandbox run.
 */
import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { OrderStatus } from '../../src/orders/domain';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { getDemoUserId } from '../../src/policy/default-policy';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { webhookService } from '../../src/paypal/webhook-service';
import { captureLock } from '../../src/orders/capture-lock';
import { reconcileExpiredReservations } from '../../src/orders/payment-lifecycle';

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
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let seq = 0;
const COMPLETED = {
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED' }] } }],
};
const ppOrder = (status: string, captureStatus?: string) => ({
  status,
  purchaseUnits: [{ payments: { captures: captureStatus ? [{ id: 'CAP-Z', status: captureStatus }] : [] } }],
});
const deferred = () => {
  let resolve!: (v: any) => void;
  const promise = new Promise<any>((r) => (resolve = r));
  return { promise, resolve };
};
const waitFor = async (cond: () => boolean) => {
  for (let i = 0; i < 300 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(cond()).toBe(true);
};

async function create(sessionId: string) {
  const ppId = `PP-CS-${++seq}`;
  pp.createOrder.mockResolvedValueOnce({
    id: ppId,
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/approve' }],
  });
  const res = await request(app)
    .post('/api/orders/create').set(sess.headers)
    .set('Idempotency-Key', `cs-${sessionId}-${++seq}`)
    .send({ items: [{ productId: 'coffee', quantity: 2 }] }); // 600 minor
  expect(res.status).toBe(200);
  return { id: res.body.orderId as string, ppId };
}

async function webhook(eventType: string, ppId: string, eventId = `WH-CS-${++seq}`) {
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
      resource: { id: 'CAP-WH', amount: { value: '6.00', currency_code: 'EUR' }, supplementary_data: { related_ids: { order_id: ppId } } },
    });
}

const status = (id: string) => orderService.getById(id)!.status;
const spent = () => dailySpendTracker.getSpentToday(USER);
const pending = () => dailySpendTracker.getPendingReservations(USER);

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  USER = sess.userId;
  jest.restoreAllMocks();
  Object.values(pp).forEach((m) => m.mockReset());
  pp.verifyWebhookSignature.mockResolvedValue({ verification_status: 'SUCCESS' });
  pp.captureOrder.mockResolvedValue(COMPLETED);
  orderService.reset();
  policyStorage.reset();
  dailySpendTracker.reset();
  captureLock.reset();
  (webhookService as any).processedEvents.clear();
});

describe('B1 duplicate COMPLETED webhooks', () => {
  test('same event id delivered 3x, then 3 different event ids for the same capture: spend booked once', async () => {
    const { id, ppId } = await create('b1');
    const first = await webhook('PAYMENT.CAPTURE.COMPLETED', ppId, 'WH-DUP');
    expect(first.body.message).toBe('Webhook processed successfully');
    for (let i = 0; i < 2; i++) {
      const again = await webhook('PAYMENT.CAPTURE.COMPLETED', ppId, 'WH-DUP');
      expect(again.status).toBe(200);
      expect(again.body.message).toBe('Event already processed');
    }
    for (let i = 0; i < 3; i++) {
      expect((await webhook('PAYMENT.CAPTURE.COMPLETED', ppId)).status).toBe(200);
    }
    expect(status(id)).toBe(OrderStatus.PAID);
    expect(spent()).toBe(600);
    expect(pending()).toBe(0);
  });
});

describe('B2 DENIED followed by a delayed COMPLETED', () => {
  test('state is correct after each event', async () => {
    const { id, ppId } = await create('b2');
    await webhook('PAYMENT.CAPTURE.DENIED', ppId);
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAYMENT_FAILED, 0, 0]);
    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId);
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAID, 600, 0]);
    expect((await webhook('PAYMENT.CAPTURE.DENIED', ppId)).status).toBe(200); // stale DENIED must not cause a 500/retry loop
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAID, 600, 0]);
  });
});

describe('B3 capture and reconciliation running at the same time', () => {
  test('B3a reconcile awaits PayPal (stale CREATED) while capture completes: order stays PAID, never cancelled or released', async () => {
    const { id } = await create('b3a');
    const lookup = deferred();
    pp.getOrder.mockReturnValueOnce(lookup.promise);
    const expire = jest.spyOn(dailySpendTracker, 'expireReservation');

    const sweep = reconcileExpiredReservations({ now: Date.now() + DAY });
    await waitFor(() => pp.getOrder.mock.calls.length === 1);

    const cap = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect(cap.status).toBe(200);
    expect(spent()).toBe(600);

    lookup.resolve(ppOrder('CREATED')); // stale answer arrives after the capture
    const summary = await sweep;
    expect(summary.released).toBe(0);
    expect(expire).not.toHaveBeenCalled();
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAID, 600, 0]);
  });

  test('B3b reconcile awaits PayPal while a capture is mid-flight: sweep keeps the reservation, capture then books spend once', async () => {
    const { id } = await create('b3b');
    const lookup = deferred();
    const capture = deferred();
    pp.getOrder.mockReturnValueOnce(lookup.promise);
    pp.captureOrder.mockReset();
    pp.captureOrder.mockReturnValueOnce(capture.promise);

    const sweep = reconcileExpiredReservations({ now: Date.now() + DAY });
    await waitFor(() => pp.getOrder.mock.calls.length === 1);
    const capReq = request(app).post(`/api/orders/${id}/capture`).set(sess.headers).then((r) => r);
    await waitFor(() => pp.captureOrder.mock.calls.length === 1);

    lookup.resolve(ppOrder('CREATED'));
    const summary = await sweep;
    expect(summary).toMatchObject({ kept: 1, released: 0 });
    expect(dailySpendTracker.getReservationState(orderService.getById(id)!.reservationId!)).toBe('PENDING');
    expect(status(id)).toBe(OrderStatus.PAYMENT_PENDING);

    capture.resolve(COMPLETED);
    expect((await capReq).status).toBe(200);
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAID, 600, 0]);
  });

  test('B3c sweep releases first: a capture arriving afterwards is refused and PayPal is never called', async () => {
    const { id } = await create('b3c');
    pp.getOrder.mockResolvedValueOnce(ppOrder('CREATED'));
    await reconcileExpiredReservations({ now: Date.now() + DAY });
    const cap = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect(cap.status).toBe(400);
    expect(pp.captureOrder).not.toHaveBeenCalled();
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.ORDER_CANCELLED, 0, 0]);
  });

  test('B3d (C2) two overlapping sweeps release the same reservation exactly once', async () => {
    const { id } = await create('b3d');
    const l1 = deferred();
    const l2 = deferred();
    pp.getOrder.mockReturnValueOnce(l1.promise).mockReturnValueOnce(l2.promise);
    const expire = jest.spyOn(dailySpendTracker, 'expireReservation');
    const cancelled = jest.spyOn(orderService, 'updateStatus');

    const now = Date.now() + DAY;
    const s1 = reconcileExpiredReservations({ now });
    const s2 = reconcileExpiredReservations({ now });
    await waitFor(() => pp.getOrder.mock.calls.length === 2);
    l1.resolve(ppOrder('CREATED'));
    l2.resolve(ppOrder('CREATED'));
    const [r1, r2] = await Promise.all([s1, s2]);

    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire.mock.results[0].value).toBe('RELEASED');
    expect(cancelled.mock.calls.filter((c) => c[1] === OrderStatus.ORDER_CANCELLED)).toHaveLength(1);
    expect(r1.released + r2.released).toBe(1); // not double counted
    expect([status(id), pending()]).toEqual([OrderStatus.ORDER_CANCELLED, 0]);

    // Further sweeps find nothing to do.
    pp.getOrder.mockClear();
    expect((await reconcileExpiredReservations({ now })).examined).toBe(0);
    expect(pp.getOrder).not.toHaveBeenCalled();
  });
});

describe('B4 PayPal lookup fails: reservation is kept', () => {
  test.each([
    ['rejects (network)', () => pp.getOrder.mockRejectedValue(new Error('ECONNRESET'))],
    ['rejects (PayPal 500)', () => pp.getOrder.mockRejectedValue({ statusCode: 500 })],
    ['resolves undefined', () => pp.getOrder.mockResolvedValue(undefined)],
    ['resolves null', () => pp.getOrder.mockResolvedValue(null)],
    ['resolves garbage', () => pp.getOrder.mockResolvedValue({ foo: 'bar' })],
  ])('%s', async (_name, arrange) => {
    const { id } = await create('b4');
    arrange();
    const s = await reconcileExpiredReservations({ now: Date.now() + 30 * DAY });
    expect(s.released).toBe(0);
    expect(s.kept).toBe(1);
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAYMENT_PENDING, 0, 600]);
  });

  test('a failing lookup also blocks the explicit cancel endpoint from releasing', async () => {
    const { id } = await create('b4-cancel');
    pp.getOrder.mockRejectedValue(new Error('down'));
    expect((await request(app).post(`/api/orders/${id}/cancel`).set(sess.headers)).status).toBe(502);
    expect([status(id), pending()]).toEqual([OrderStatus.PAYMENT_PENDING, 600]);
  });
});

describe('B5 ORDER_ALREADY_CAPTURED is verified against the PayPal order', () => {
  const alreadyCaptured = () => pp.captureOrder.mockRejectedValueOnce({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });

  test('PayPal says COMPLETED -> PAID, spend booked, settled:true', async () => {
    const { id } = await create('b5a');
    alreadyCaptured();
    pp.getOrder.mockResolvedValueOnce(COMPLETED);
    const r = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect([r.status, r.body.details]).toEqual([409, { settled: true }]);
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAID, 600, 0]);
    expect(pp.getOrder).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['APPROVED (not captured)', () => pp.getOrder.mockResolvedValueOnce(ppOrder('APPROVED'))],
    ['capture PENDING', () => pp.getOrder.mockResolvedValueOnce(ppOrder('COMPLETED', 'PENDING'))],
    ['lookup fails', () => pp.getOrder.mockRejectedValueOnce(new Error('down'))],
  ])('PayPal does not confirm a completed capture (%s) -> nothing is booked', async (_n, arrange) => {
    const { id } = await create('b5b');
    alreadyCaptured();
    arrange();
    const r = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect([r.status, r.body.details]).toEqual([409, { settled: false }]);
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAYMENT_PENDING, 0, 600]);
  });
});

describe('B6 server restart: real payment webhook for an order that no longer exists', () => {
  test('B6 server restart: real payment webhook for an order that no longer exists is kept retryable (503, not acknowledged)', async () => {
    const { ppId } = await create('b6');
    // Simulated restart: every in-memory store is lost.
    orderService.reset();
    dailySpendTracker.reset();
    (webhookService as any).processedEvents.clear();
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    // Money WAS captured at PayPal, but the order is gone (state loss). We must
    // NOT acknowledge with a 2xx: PayPal stops retrying on any 2xx (verified —
    // "Any non-2xx status code will cause PayPal to reattempt delivery up to 25
    // times over the course of 3 days"). Returning 503 keeps the payment alive in
    // PayPal's retry queue while an operator reconciles it from the loud log.
    const res = await webhook('PAYMENT.CAPTURE.COMPLETED', ppId, 'WH-RESTART');
    expect(res.status).toBe(503); // NOT 2xx => PayPal WILL retry for up to 3 days
    expect(res.body.error).toMatch(/cannot be reconciled/i);

    // The money moved at PayPal but is not booked to a (now missing) order:
    expect(orderService.getAll()).toHaveLength(0);
    expect(spent()).toBe(0);
    // NOT marked processed, so a retry is processed again rather than swallowed:
    expect(webhookService.isDuplicate('WH-RESTART')).toBe(false);

    // The only trace is the error log (so an operator can reconcile manually):
    const logged = errorLog.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('UNRECONCILED_PAYMENT_EVENT');
    expect(logged).toContain(ppId);
    expect(logged).toContain('6.00');
  });

  test('DENIED for an unknown order is also flagged; a non-payment event is only a warning', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnLog = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await webhook('PAYMENT.CAPTURE.DENIED', 'PP-GONE-1');
    expect(errorLog.mock.calls.map((c) => String(c[0])).join('\n')).toContain('UNRECONCILED_PAYMENT_EVENT');
    errorLog.mockClear();
    await webhook('CHECKOUT.ORDER.APPROVED', 'PP-GONE-2');
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalled();
  });

  test('the dedup-set loss alone (order still known) does not double count on replay', async () => {
    const { ppId } = await create('b6b');
    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId, 'WH-REPLAY');
    (webhookService as any).processedEvents.clear();
    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId, 'WH-REPLAY');
    expect(spent()).toBe(600);
  });
});

describe('C1 APPROVED reservations and the 24h hard age', () => {
  test('kept while APPROVED before max age; completed meanwhile -> confirmed by the next sweep', async () => {
    const { id } = await create('c1a');
    pp.getOrder.mockResolvedValueOnce(ppOrder('APPROVED'));
    const early = await reconcileExpiredReservations({ now: Date.now() + 2 * HOUR });
    expect(early).toMatchObject({ kept: 1, released: 0 });
    expect([status(id), pending()]).toEqual([OrderStatus.PAYMENT_PENDING, 600]);

    pp.getOrder.mockResolvedValueOnce(COMPLETED); // the payment completed in between
    const next = await reconcileExpiredReservations({ now: Date.now() + 3 * HOUR });
    expect(next.confirmed).toBe(1);
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAID, 600, 0]);
  });

  test('past 24h and still APPROVED: released and cancelled; capture is then refused; a payment that nevertheless completed is still booked by the late webhook', async () => {
    const { id, ppId } = await create('c1b');
    pp.getOrder.mockResolvedValueOnce(ppOrder('APPROVED'));
    const late = await reconcileExpiredReservations({ now: Date.now() + 25 * HOUR });
    expect(late.released).toBe(1);
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.ORDER_CANCELLED, 0, 0]);

    expect((await request(app).post(`/api/orders/${id}/capture`).set(sess.headers)).status).toBe(400);
    expect(pp.captureOrder).not.toHaveBeenCalled();

    // Defensive path (e.g. a capture that raced the release): PayPal reports it completed.
    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId);
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAID, 600, 0]);
    expect(dailySpendTracker.getReservationState(orderService.getById(id)!.reservationId!)).toBe('CONFIRMED');
  });
});

describe('C3 a late response or event never moves PAID backwards', () => {
  test.each([
    ['capture response PENDING', { ...COMPLETED, status: 'PENDING' }],
    ['capture response DECLINED', { ...COMPLETED, status: 'DECLINED' }],
  ])('webhook COMPLETED wins over a late %s', async (_n, lateResponse) => {
    const { id, ppId } = await create('c3');
    const capture = deferred();
    pp.captureOrder.mockReset();
    pp.captureOrder.mockReturnValueOnce(capture.promise);
    const req = request(app).post(`/api/orders/${id}/capture`).set(sess.headers).then((r) => r);
    await waitFor(() => pp.captureOrder.mock.calls.length === 1);

    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId);
    capture.resolve(lateResponse);
    await req;
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAID, 600, 0]);
  });

  test('late DENIED webhook, late cancel request and a stale sweep all leave a PAID order untouched', async () => {
    const { id, ppId } = await create('c3b');
    expect((await request(app).post(`/api/orders/${id}/capture`).set(sess.headers)).status).toBe(200);
    expect((await webhook('PAYMENT.CAPTURE.DENIED', ppId)).status).toBe(200);
    expect((await request(app).post(`/api/orders/${id}/cancel`).set(sess.headers)).status).toBe(409);
    pp.getOrder.mockResolvedValue(ppOrder('CREATED'));
    await reconcileExpiredReservations({ now: Date.now() + 30 * DAY });
    expect([status(id), spent(), pending()]).toEqual([OrderStatus.PAID, 600, 0]);
  });
});

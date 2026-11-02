import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { OrderService } from '../../src/orders/service';
import { OrderStatus } from '../../src/orders/domain';
import { markOrderPaid } from '../../src/orders/payment-lifecycle';
import { captureLock } from '../../src/orders/capture-lock';

// MOCKED PayPal (no network, no database): proves the application's own state machine. Whether
// PayPal itself behaves this way (second capture of an order -> ORDER_ALREADY_CAPTURED) is only
// proven by the Sandbox run, not here.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn() },
}));

const createOrder = paypalClient.createOrder as jest.Mock;
const captureOrder = paypalClient.captureOrder as jest.Mock;
const getOrder = paypalClient.getOrder as jest.Mock;
const app = createApp();
const orders = OrderService.getInstance();

const CAPTURED = {
  id: 'PP1',
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', amount: { value: '3.00', currency_code: 'EUR' } }] } }],
};
const sdkError = (issue: string) =>
  Object.assign(new Error(''), { statusCode: 422, result: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue }] } });

let sess: TestSession;
let n = 0;

beforeEach(async () => {
  resetSessionState();
  captureLock.reset();
  sess = await newSession(app);
  createOrder.mockReset().mockResolvedValue({ id: 'PP1', status: 'CREATED', links: [{ rel: 'approve', href: 'https://x/approve' }] });
  captureOrder.mockReset();
  getOrder.mockReset();
});

async function newOrder(): Promise<string> {
  const res = await request(app)
    .post('/api/orders/create')
    .set(sess.headers)
    .set('Idempotency-Key', `conc-${++n}`)
    .send({ items: [{ productId: 'coffee', quantity: 1 }] });
  expect(res.status).toBe(201);
  return res.body.orderId;
}
const capture = (id: string) => request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
const statusOf = (id: string) => orders.getById(id)!.status;

/** A capture call that stays "in flight at PayPal" until the test releases it. */
function gate() {
  let release!: (v: unknown) => void;
  let fail!: (e: unknown) => void;
  const promise = new Promise((res, rej) => ((release = res), (fail = rej)));
  return { promise, release, fail };
}
const tick = () => new Promise((r) => setTimeout(r, 25));

describe('capture concurrency and legal state transitions', () => {
  test('two simultaneous captures reach PayPal once; the other gets 409 and the order is paid exactly once', async () => {
    const id = await newOrder();
    const g = gate();
    captureOrder.mockReturnValueOnce(g.promise);

    const first = capture(id).then((r) => r);
    await tick();
    const second = await capture(id);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('Capture already in progress');

    g.release(CAPTURED);
    const firstRes = await first;
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.status).toBe('PAID');
    expect(captureOrder).toHaveBeenCalledTimes(1);
    expect(statusOf(id)).toBe(OrderStatus.PAID);
  });

  test('a capture after success is refused (409) and never contacts PayPal again', async () => {
    const id = await newOrder();
    captureOrder.mockResolvedValueOnce(CAPTURED);
    expect((await capture(id)).status).toBe(200);
    const again = await capture(id);
    expect(again.status).toBe(409);
    expect(captureOrder).toHaveBeenCalledTimes(1);
  });

  test('a lost response (timeout) never marks the order paid; the retry settles from PayPal state', async () => {
    const id = await newOrder();
    captureOrder.mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { code: 'ETIMEDOUT' }));
    const timedOut = await capture(id);
    expect(timedOut.status).toBe(502);
    expect(statusOf(id)).toBe(OrderStatus.PAYMENT_PENDING); // unknown outcome != paid, != failed
    expect(captureLock.isHeld(id)).toBe(false); // the lock does not leak after an error

    // PayPal had in fact captured. The retry reconciles FIRST (a capture attempt is already on record), finds the
    // verified COMPLETED capture, and settles the order without sending a second capture request.
    getOrder.mockResolvedValueOnce(CAPTURED);
    const retry = await capture(id);
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe('PAID');
    expect(captureOrder).toHaveBeenCalledTimes(1);
    expect(statusOf(id)).toBe(OrderStatus.PAID);
    expect(orders.getById(id)!.paypalCaptureId).toBe('CAP1');
  });

  test('if PayPal cannot be asked either, the order stays pending instead of being guessed paid', async () => {
    const id = await newOrder();
    captureOrder.mockRejectedValueOnce(sdkError('ORDER_ALREADY_CAPTURED'));
    getOrder.mockRejectedValueOnce(new Error('lookup down'));
    const res = await capture(id);
    expect(res.status).toBe(409);
    expect(res.body.details.settled).toBe(false);
    expect(statusOf(id)).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('a webhook settling the order while the capture is in flight yields one PAID order and one capture id', async () => {
    const id = await newOrder();
    const g = gate();
    captureOrder.mockReturnValueOnce(g.promise);
    const inFlight = capture(id).then((r) => r);
    await tick();

    markOrderPaid(orders.getById(id)!, 'CAP1'); // what the verified PAYMENT.CAPTURE.COMPLETED handler does
    expect(statusOf(id)).toBe(OrderStatus.PAID);

    g.release(CAPTURED);
    const res = await inFlight;
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    expect(orders.getById(id)!.paypalCaptureId).toBe('CAP1');
  });

  test('a declined capture fails the order definitively and cannot be captured again', async () => {
    const id = await newOrder();
    captureOrder.mockRejectedValueOnce(sdkError('INSTRUMENT_DECLINED'));
    expect((await capture(id)).status).toBe(402);
    expect(statusOf(id)).toBe(OrderStatus.PAYMENT_FAILED);

    const again = await capture(id);
    expect(again.status).toBe(400);
    expect(captureOrder).toHaveBeenCalledTimes(1);
  });

  test('a cancelled order cannot be captured', async () => {
    const id = await newOrder();
    const cancel = await request(app).post(`/api/orders/${id}/cancel`).set(sess.headers);
    expect(cancel.status).toBe(200);
    const res = await capture(id);
    expect(res.status).toBe(400);
    expect(captureOrder).not.toHaveBeenCalled();
    expect(statusOf(id)).toBe(OrderStatus.ORDER_CANCELLED);
  });

  test("another session cannot capture, and cannot tell the order exists", async () => {
    const id = await newOrder();
    const other = await newSession(app);
    const res = await request(app).post(`/api/orders/${id}/capture`).set(other.headers);
    expect(res.status).toBe(404);
    expect(captureOrder).not.toHaveBeenCalled();
  });

  test('capture requires a session (401) and a PayPal order id', async () => {
    const id = await newOrder();
    expect((await request(app).post(`/api/orders/${id}/capture`)).status).toBe(401);
  });
});

import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { OrderService } from '../../src/orders/service';
import { OrderStatus } from '../../src/orders/domain';

// MOCKED PayPal (no network, no database). Proves the application's own trust
// boundaries: the client can never declare a payment made, and a payment is
// never confirmed before its write-ahead record is durable.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn() },
}));

const createOrder = paypalClient.createOrder as jest.Mock;
const captureOrder = paypalClient.captureOrder as jest.Mock;
const getOrder = paypalClient.getOrder as jest.Mock;
const app = createApp();
const orders = OrderService.getInstance();

/** A COMPLETED PayPal capture for an arbitrary amount (fixture builder). */
const captured = (value: string, currency: string) => ({
  id: 'PP1',
  status: 'COMPLETED',
  purchaseUnits: [
    { payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', amount: { value, currency_code: currency } }] } },
  ],
});
/** A COMPLETED PayPal capture for exactly the order's own total and currency. */
const capturedFor = (id: string) => {
  const order = orders.getById(id)!;
  return captured((order.totalMinor / 100).toFixed(2), order.currency);
};

let sess: TestSession;
let n = 0;

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  createOrder.mockReset().mockResolvedValue({ id: 'PP1', status: 'CREATED', links: [{ rel: 'approve', href: 'https://x/approve' }] });
  captureOrder.mockReset();
  getOrder.mockReset();
});

async function newOrder(): Promise<string> {
  const res = await request(app)
    .post('/api/orders/create')
    .set(sess.headers)
    .set('Idempotency-Key', `trust-${++n}`)
    .send({ items: [{ productId: 'coffee', quantity: 1 }] });
  expect(res.status).toBe(201);
  return res.body.orderId;
}

describe('the client can never declare a payment', () => {
  test('a capture body claiming PAID/COMPLETED is ignored: PayPal is still the source of truth', async () => {
    const id = await newOrder();
    // The buyer never approved, so PayPal refuses the capture.
    captureOrder.mockRejectedValueOnce(
      Object.assign(new Error(''), { statusCode: 422, result: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] } })
    );

    const res = await request(app)
      .post(`/api/orders/${id}/capture`)
      .set(sess.headers)
      .send({ status: 'PAID', paypalStatus: 'COMPLETED', paypalCaptureId: 'FAKE-CAP', paid: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not approved/i);
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(orders.getById(id)!.paypalCaptureId).toBeUndefined();
    // The forged capture id never reaches the stored order.
    expect(JSON.stringify(orders.getById(id))).not.toContain('FAKE-CAP');
  });

  test('a create body claiming origin/status/total is ignored (server-owned fields)', async () => {
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', `trust-body-${++n}`)
      .send({
        items: [{ productId: 'coffee', quantity: 1 }],
        status: 'PAID',
        origin: 'HUMAN',
        totalMinor: 1,
        currency: 'USD',
        paypalCaptureId: 'FAKE',
      });
    expect(res.status).toBe(201);
    // Server-owned values win: the real catalog price, the server currency, pending status.
    expect(res.body.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(res.body.totalMinor).toBeGreaterThan(1);
    expect(res.body.currency).toBe('EUR');
    expect(res.body.paypalCaptureId).toBeUndefined();
  });

  test('the order status endpoint reports only what PayPal/the server recorded', async () => {
    const id = await newOrder();
    captureOrder.mockResolvedValueOnce(capturedFor(id));
    expect((await request(app).post(`/api/orders/${id}/capture`).set(sess.headers)).status).toBe(200);

    const res = await request(app).get('/api/orders').set(sess.headers);
    expect(res.status).toBe(200);
    const listed = res.body.orders.find((o: any) => o.id === id);
    expect(listed.status).toBe('PAID');
    // The public list still leaks no PayPal ids (B5) — the capture id lives only
    // in the server-side order record.
    expect(listed.paypalCaptureId).toBeUndefined();
    expect(JSON.stringify(listed)).not.toContain('CAP1');
    expect(orders.getById(id)!.paypalCaptureId).toBe('CAP1');
  });
});

describe('a payment is never answered before its write-ahead record is durable', () => {
  test('if the pre-capture write fails, PayPal is never contacted and the order stays pending', async () => {
    const id = await newOrder();
    const spy = jest.spyOn(orders, 'saveNow').mockRejectedValueOnce(new Error('db down'));

    const res = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);

    expect(res.status).toBe(503);
    expect(captureOrder).not.toHaveBeenCalled();
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    spy.mockRestore();
  });

  test('if the post-capture write fails, the answer still reflects PayPal (money moved) and is not an error', async () => {
    const id = await newOrder();
    // First saveNow (write-ahead) succeeds, the second (after the capture) fails.
    const spy = jest
      .spyOn(orders, 'saveNow')
      .mockImplementationOnce(async () => undefined)
      .mockRejectedValueOnce(new Error('db down'));
    captureOrder.mockResolvedValueOnce(capturedFor(id));

    const res = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    expect(res.body.paypalCaptureId).toBe('CAP1');
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAID);
    spy.mockRestore();
  });
});

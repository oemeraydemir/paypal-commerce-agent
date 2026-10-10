import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { policyStorage } from '../../src/policy/storage';
import {
  markSessionAIPrepared,
  peekAIPreparedSession,
} from '../../src/ai/session-tracker';

// Mock the PayPal client — NO real PayPal calls in this suite.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
  },
}));

const mockCreateOrder = paypalClient.createOrder as jest.Mock;
const mockCaptureOrder = paypalClient.captureOrder as jest.Mock;

const app = createApp();

const CREATED = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/mock-approve' }],
};
const CAPTURED = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'MOCK_CAPTURE_ID' }] } }],
};

let sess: TestSession;

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  mockCreateOrder.mockReset();
  mockCaptureOrder.mockReset();
  mockCreateOrder.mockResolvedValue(CREATED);
  mockCaptureOrder.mockResolvedValue(CAPTURED);
});

describe('Orders API', () => {
  test('POST /api/orders/create validates quantity (FIX #12)', async () => {
    const response = await request(app)
      .post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'test-quantity-001')
      .send({ items: [{ productId: 'coffee', quantity: 0 }] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid quantity');
  });

  test('POST /api/orders/create enforces the server-owned maximum order value', async () => {
    const response = await request(app)
      .post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'test-order-limit-001')
      .send({
        items: [{ productId: 'premium_cake', quantity: 3 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('must not exceed');
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('POST /api/orders/create uses authoritative pricing', async () => {
    const response = await request(app)
      .post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'test-pricing-001')
      .send({
        items: [
          { productId: 'coffee', quantity: 2 },
          { productId: 'veg_breakfast', quantity: 1 },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.totalMinor).toBe(1600); // 300*2 + 1000*1
    expect(response.body.totalFormatted).toBe('€16.00');
    expect(response.body.approvalUrl).toBeDefined();
    expect(response.body.paypalOrderId).toBe('MOCK_PAYPAL_ORDER_ID');
    expect(response.body.origin).toBe('HUMAN'); // FIX #7
  });

  test('B1: GET /api/orders does not expose PayPal order/capture ids', async () => {
    // Create an order (mocked PayPal) so a real paypalOrderId exists server-side.
    await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'b1-orders-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] })
      .expect(200);

    const response = await request(app).get('/api/orders');
    expect(response.status).toBe(200);
    expect(response.body.orders.length).toBeGreaterThan(0);

    const order = response.body.orders[0];
    // Public list must never leak the real PayPal resource identifiers (B1).
    expect(order).not.toHaveProperty('paypalOrderId');
    expect(order).not.toHaveProperty('paypalCaptureId');
    // The masked session ref is still present for correlation.
    expect(order.sessionId).toBeDefined();
  });

  test('B5: a BLOCKed create does not consume the AI-prepared marker (retry stays AI_AGENT)', async () => {
    // This session has an AI-prepared cart.
    markSessionAIPrepared(sess.sessionId);

    // Force an authoritative BLOCK (per-purchase limit below the cart total).
    policyStorage.setPolicy({
      ...policyStorage.getOrCreatePolicy(sess.userId),
      maxPerPurchaseMinor: 1,
      dailySpendLimitMinor: 1,
    });

    const blocked = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'b5-block-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(blocked.status).toBe(403);

    // The marker must remain: the BLOCKed attempt must not consume it, so a
    // retry is still attributed AI_AGENT (and not silently HUMAN).
    expect(peekAIPreparedSession(sess.sessionId)).toBe(true);

    // Restore a permissive policy and retry with a fresh idempotency key.
    policyStorage.setPolicy({
      ...policyStorage.getOrCreatePolicy(sess.userId),
      maxPerPurchaseMinor: 100000,
      dailySpendLimitMinor: 100000,
    });
    const allowed = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'b5-allow-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(allowed.status).toBe(200);
    expect(allowed.body.origin).toBe('AI_AGENT');
    // Now the marker is consumed on the proceeding attempt.
    expect(peekAIPreparedSession(sess.sessionId)).toBe(false);
  });

  test('Idempotency: same key + different body returns 409 (FIX #3 cache + reuse)', async () => {
    const body1 = { items: [{ productId: 'coffee', quantity: 1 }] };
    const body2 = { items: [{ productId: 'latte', quantity: 1 }] };

    await request(app).post('/api/orders/create').set(sess.headers).set('Idempotency-Key', 'idempotency-test-002').send(body1);
    const response2 = await request(app)
      .post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'idempotency-test-002')
      .send(body2);

    expect(response2.status).toBe(409);
    expect(response2.body.error).toBe('IDEMPOTENCY_KEY_REUSE');
  });

  test('POST /api/orders/:id/capture succeeds → PAID (FIX #1 dual idempotency path)', async () => {
    const createResponse = await request(app)
      .post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'test-capture-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });

    const orderId = createResponse.body.orderId;

    const captureResponse = await request(app).post(`/api/orders/${orderId}/capture`).set(sess.headers);

    expect(captureResponse.status).toBe(200);
    expect(captureResponse.body.status).toBe('PAID');
    expect(captureResponse.body.paypalStatus).toBe('COMPLETED');
  });

  test('PayPal error mapping: ORDER_ALREADY_CAPTURED → 409 (FIX #6)', async () => {
    const createResponse = await request(app)
      .post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'test-errmap-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    const orderId = createResponse.body.orderId;

    mockCaptureOrder.mockRejectedValue({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });

    const captureResponse = await request(app).post(`/api/orders/${orderId}/capture`).set(sess.headers);
    expect(captureResponse.status).toBe(409);
    expect(captureResponse.body.error).toBe('Order already captured');
  });

  test('PayPal error mapping: INSTRUMENT_DECLINED → 402 (FIX #6)', async () => {
    const createResponse = await request(app)
      .post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'test-errmap-002')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    const orderId = createResponse.body.orderId;

    mockCaptureOrder.mockRejectedValue({ details: [{ issue: 'INSTRUMENT_DECLINED' }] });

    const captureResponse = await request(app).post(`/api/orders/${orderId}/capture`).set(sess.headers);
    expect(captureResponse.status).toBe(402);
  });

  test('5xx is NOT cached — retry after PayPal outage returns 200 (FIX #3)', async () => {
    const body = { items: [{ productId: 'coffee', quantity: 1 }] };

    // First create: PayPal down → 500 (must NOT be cached).
    mockCreateOrder.mockRejectedValueOnce(new Error('PayPal down'));

    const r1 = await request(app).post('/api/orders/create').set(sess.headers).set('Idempotency-Key', '5xx-001').send(body);
    expect(r1.status).toBe(500);

    // Second create with same key: re-executes, now succeeds.
    const r2 = await request(app).post('/api/orders/create').set(sess.headers).set('Idempotency-Key', '5xx-001').send(body);
    expect(r2.status).toBe(200);
  });

  test('Concurrent same key + same body → both 200, same orderId (FIX #8)', async () => {
    const body = { items: [{ productId: 'coffee', quantity: 1 }] };

    // Delay the PayPal call so both requests overlap in-flight.
    mockCreateOrder.mockImplementation(
      () => new Promise((res) => setTimeout(() => res(CREATED), 50))
    );

    const [a, b] = await Promise.all([
      request(app).post('/api/orders/create').set(sess.headers).set('Idempotency-Key', 'concurrent-001').send(body),
      request(app).post('/api/orders/create').set(sess.headers).set('Idempotency-Key', 'concurrent-001').send(body),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.orderId).toBe(b.body.orderId);
  });
});

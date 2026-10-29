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
    getOrder: jest.fn(),
  },
}));

const mockCreateOrder = paypalClient.createOrder as jest.Mock;
const mockCaptureOrder = paypalClient.captureOrder as jest.Mock;
const mockGetOrder = paypalClient.getOrder as jest.Mock;

const app = createApp();

const CREATED = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/mock-approve' }],
};
const CAPTURED = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'MOCK_CAPTURE_ID', status: 'COMPLETED', amount: { value: '3.00', currency_code: 'EUR' } }] } }],
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

    expect(response.status).toBe(201);
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
      .expect(201);

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

  test('GET /api/orders/pending only recovers a pending order for its session', async () => {
    const created = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'pending-recovery-session-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] })
      .expect(201);
    const token = created.body.paypalOrderId as string;

    const owner = await request(app)
      .get('/api/orders/pending')
      .set(sess.headers)
      .query({ token })
      .expect(200);
    expect(owner.body.orderId).toBe(created.body.orderId);
    expect(owner.body.paypalOrderId).toBe(token);

    const otherSession = await newSession(app);
    await request(app)
      .get('/api/orders/pending')
      .set(otherSession.headers)
      .query({ token })
      .expect(404);
  });

  test('B5: a BLOCKed create does not consume the AI-prepared marker (retry stays AI_AGENT)', async () => {
    // This session has an AI-prepared cart.
    markSessionAIPrepared(sess.sessionId, 'AI_AGENT');

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
    expect(peekAIPreparedSession(sess.sessionId)).toBe('AI_AGENT');

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
    expect(allowed.status).toBe(201);
    expect(allowed.body.origin).toBe('AI_AGENT');
    // Now the marker is consumed on the proceeding attempt.
    expect(peekAIPreparedSession(sess.sessionId)).toBeUndefined();
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
    expect(r2.status).toBe(201);
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

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.orderId).toBe(b.body.orderId);
  });
});

describe('PayPal upstream failures on create are not leaked as client statuses', () => {
  const create = (key: string) =>
    request(app)
      .post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', key)
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });

  test('a PayPal 401 (bad merchant credentials) becomes 502, never a session-style 401', async () => {
    mockCreateOrder.mockRejectedValueOnce(Object.assign(new Error(''), { statusCode: 401 }));
    const res = await create('upstream-401-001');
    expect(res.status).toBe(502);
    expect(res.body.error).toContain('PAYPAL_CLIENT_ID');
    expect(res.body.details).toEqual({ code: 'PAYPAL_UPSTREAM_ERROR', upstreamStatus: 401 });
  });

  test('a PayPal 422 becomes a retryable 502 with a safe message', async () => {
    mockCreateOrder.mockRejectedValueOnce(Object.assign(new Error('UNPROCESSABLE_ENTITY'), { statusCode: 422 }));
    const res = await create('upstream-422-001');
    expect(res.status).toBe(502);
    expect(res.body.error).not.toContain('UNPROCESSABLE');
  });
});

describe('capture error branches with the REAL PayPal SDK error shape', () => {
  // The earlier tests reject with { details: [...] }, a shape the SDK never produces, which is
  // why they stayed green while every real capture error fell through to a generic 502.
  const sdkError = (issue: string) =>
    Object.assign(new Error(''), {
      statusCode: 422,
      body: JSON.stringify({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue }] }),
      result: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue }] },
    });

  const createOrder = async (key: string) => {
    const res = await request(app)
      .post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', key)
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    return res.body.orderId as string;
  };

  test('ORDER_NOT_APPROVED → 400 retryable, order stays payable', async () => {
    const orderId = await createOrder('sdk-shape-001');
    mockCaptureOrder.mockRejectedValueOnce(sdkError('ORDER_NOT_APPROVED'));

    const res = await request(app).post(`/api/orders/${orderId}/capture`).set(sess.headers);
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual({ paypalIssue: 'ORDER_NOT_APPROVED', retryable: true });

    // Recoverable: after the buyer approves, the same order can be captured.
    // A capture attempt is on record, so the retry first asks PayPal: approved and not captured yet -> capture again.
    mockGetOrder.mockResolvedValueOnce({ status: 'APPROVED', purchaseUnits: [{}] });
    const retry = await request(app).post(`/api/orders/${orderId}/capture`).set(sess.headers);
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe('PAID');
  });

  test('INSTRUMENT_DECLINED → 402', async () => {
    const orderId = await createOrder('sdk-shape-002');
    mockCaptureOrder.mockRejectedValueOnce(sdkError('INSTRUMENT_DECLINED'));
    const res = await request(app).post(`/api/orders/${orderId}/capture`).set(sess.headers);
    expect(res.status).toBe(402);
  });

  test('ORDER_ALREADY_CAPTURED → 409 and the order is settled from PayPal', async () => {
    const orderId = await createOrder('sdk-shape-003');
    mockCaptureOrder.mockRejectedValueOnce(sdkError('ORDER_ALREADY_CAPTURED'));
    const res = await request(app).post(`/api/orders/${orderId}/capture`).set(sess.headers);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Order already captured');
    expect(res.body.details).toHaveProperty('settled');
  });

  test('a transport error without an issue code stays a 502 and keeps the order pending', async () => {
    const orderId = await createOrder('sdk-shape-004');
    mockCaptureOrder.mockRejectedValueOnce(new Error('ECONNRESET'));
    const res = await request(app).post(`/api/orders/${orderId}/capture`).set(sess.headers);
    expect(res.status).toBe(502);
  });
});


// FIX-02 (verification findings H1/H2): POST /api/orders/create must answer with the
// status the OpenAPI spec and the Postman collection document — 201 Created — on every
// success path, including idempotent replays, while error codes stay unchanged.
describe('order creation HTTP contract (openapi.json + Postman collection)', () => {
  test('a successful creation is 201 Created', async () => {
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'contract-201-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.orderId).toBeDefined();
    expect(res.body.paypalOrderId).toBeDefined();
  });

  test('an idempotent replay is 201 with the identical body (never 200)', async () => {
    const body = { items: [{ productId: 'coffee', quantity: 1 }] };
    const first = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'contract-201-002')
      .send(body);
    const second = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'contract-201-002')
      .send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
  });

  test('error paths keep their documented codes: 403 policy, 400 invalid, 502 upstream', async () => {
    const blocked = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'contract-403')
      .send({ items: [{ productId: 'premium_cake', quantity: 1 }] }); // over the EUR 20 limit
    expect(blocked.status).toBe(403);

    const invalid = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'contract-400')
      .send({ items: [{ productId: 'coffee', quantity: 0 }] });
    expect(invalid.status).toBe(400);

    mockCreateOrder.mockRejectedValueOnce(Object.assign(new Error(''), { statusCode: 401 }));
    const upstream = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'contract-502')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(upstream.status).toBe(502);
  });
});

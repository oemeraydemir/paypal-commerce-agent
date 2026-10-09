import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';

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

beforeEach(() => {
  mockCreateOrder.mockReset();
  mockCaptureOrder.mockReset();
  mockCreateOrder.mockResolvedValue(CREATED);
  mockCaptureOrder.mockResolvedValue(CAPTURED);
});

describe('Orders API', () => {
  test('POST /api/orders/create validates quantity (FIX #12)', async () => {
    const response = await request(app)
      .post('/api/orders/create')
      .set('Idempotency-Key', 'test-quantity-001')
      .send({ sessionId: 'test-session', items: [{ productId: 'coffee', quantity: 0 }] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid quantity');
  });

  test('POST /api/orders/create enforces the server-owned maximum order value', async () => {
    const response = await request(app)
      .post('/api/orders/create')
      .set('Idempotency-Key', 'test-order-limit-001')
      .send({
        sessionId: 'test-session',
        items: [{ productId: 'premium_cake', quantity: 3 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('must not exceed');
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('POST /api/orders/create uses authoritative pricing', async () => {
    const response = await request(app)
      .post('/api/orders/create')
      .set('Idempotency-Key', 'test-pricing-001')
      .send({
        sessionId: 'test-session',
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

  test('Idempotency: same key + different body returns 409 (FIX #3 cache + reuse)', async () => {
    const body1 = { sessionId: 'test-session', items: [{ productId: 'coffee', quantity: 1 }] };
    const body2 = { sessionId: 'test-session', items: [{ productId: 'latte', quantity: 1 }] };

    await request(app).post('/api/orders/create').set('Idempotency-Key', 'idempotency-test-002').send(body1);
    const response2 = await request(app)
      .post('/api/orders/create')
      .set('Idempotency-Key', 'idempotency-test-002')
      .send(body2);

    expect(response2.status).toBe(409);
    expect(response2.body.error).toBe('IDEMPOTENCY_KEY_REUSE');
  });

  test('POST /api/orders/:id/capture succeeds → PAID (FIX #1 dual idempotency path)', async () => {
    const createResponse = await request(app)
      .post('/api/orders/create')
      .set('Idempotency-Key', 'test-capture-001')
      .send({ sessionId: 'test-session', items: [{ productId: 'coffee', quantity: 1 }] });

    const orderId = createResponse.body.orderId;

    const captureResponse = await request(app).post(`/api/orders/${orderId}/capture`);

    expect(captureResponse.status).toBe(200);
    expect(captureResponse.body.status).toBe('PAID');
    expect(captureResponse.body.paypalStatus).toBe('COMPLETED');
  });

  test('PayPal error mapping: ORDER_ALREADY_CAPTURED → 409 (FIX #6)', async () => {
    const createResponse = await request(app)
      .post('/api/orders/create')
      .set('Idempotency-Key', 'test-errmap-001')
      .send({ sessionId: 'test-session', items: [{ productId: 'coffee', quantity: 1 }] });
    const orderId = createResponse.body.orderId;

    mockCaptureOrder.mockRejectedValue({ details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });

    const captureResponse = await request(app).post(`/api/orders/${orderId}/capture`);
    expect(captureResponse.status).toBe(409);
    expect(captureResponse.body.error).toBe('Order already captured');
  });

  test('PayPal error mapping: INSTRUMENT_DECLINED → 402 (FIX #6)', async () => {
    const createResponse = await request(app)
      .post('/api/orders/create')
      .set('Idempotency-Key', 'test-errmap-002')
      .send({ sessionId: 'test-session', items: [{ productId: 'coffee', quantity: 1 }] });
    const orderId = createResponse.body.orderId;

    mockCaptureOrder.mockRejectedValue({ details: [{ issue: 'INSTRUMENT_DECLINED' }] });

    const captureResponse = await request(app).post(`/api/orders/${orderId}/capture`);
    expect(captureResponse.status).toBe(402);
  });

  test('5xx is NOT cached — retry after PayPal outage returns 200 (FIX #3)', async () => {
    const body = { sessionId: 'test-session', items: [{ productId: 'coffee', quantity: 1 }] };

    // First create: PayPal down → 500 (must NOT be cached).
    mockCreateOrder.mockRejectedValueOnce(new Error('PayPal down'));

    const r1 = await request(app).post('/api/orders/create').set('Idempotency-Key', '5xx-001').send(body);
    expect(r1.status).toBe(500);

    // Second create with same key: re-executes, now succeeds.
    const r2 = await request(app).post('/api/orders/create').set('Idempotency-Key', '5xx-001').send(body);
    expect(r2.status).toBe(200);
  });

  test('Concurrent same key + same body → both 200, same orderId (FIX #8)', async () => {
    const body = { sessionId: 'test-session', items: [{ productId: 'coffee', quantity: 1 }] };

    // Delay the PayPal call so both requests overlap in-flight.
    mockCreateOrder.mockImplementation(
      () => new Promise((res) => setTimeout(() => res(CREATED), 50))
    );

    const [a, b] = await Promise.all([
      request(app).post('/api/orders/create').set('Idempotency-Key', 'concurrent-001').send(body),
      request(app).post('/api/orders/create').set('Idempotency-Key', 'concurrent-001').send(body),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.orderId).toBe(b.body.orderId);
  });
});

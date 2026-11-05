import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { allowanceScopeService } from '../../src/policy/allowance-scope';
import { OrderOrigin } from '../../src/orders/domain';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';

// Mock the PayPal client — NO real PayPal calls in this suite.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
    getOrder: jest.fn(),
  },
}));

const mockCreateOrder = paypalClient.createOrder as jest.Mock;

const app = createApp();

const CREATED = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/mock-approve' }],
};

let sess: TestSession;
let other: TestSession;

async function pendingReservationsFor(userId: string): Promise<number> {
  return dailySpendTracker.listPendingReservations().filter((r) => r.userId === userId).length;
}

async function globalOrderCount(): Promise<number> {
  const res = await request(app).get('/api/orders').set(sess.headers);
  expect(res.status).toBe(200);
  return (res.body.orders as unknown[]).length;
}

beforeEach(async () => {
  resetSessionState();
  allowanceScopeService.reset();
  dailySpendTracker.reset();
  sess = await newSession(app);
  other = await newSession(app);
  mockCreateOrder.mockReset();
  mockCreateOrder.mockResolvedValue(CREATED);
});

describe('POST /api/orders/create — explicit scopeId is fail-closed', () => {
  test('1. explicit unknown scope is rejected and creates no order/reservation', async () => {
    const beforeOrders = await globalOrderCount();
    const beforeRes = await pendingReservationsFor(sess.userId);
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'scope-unknown-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }], scopeId: 'scp_does_not_exist' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_NOT_FOUND');
    expect(mockCreateOrder).not.toHaveBeenCalled();

    // No order created, no reservation created.
    expect(await globalOrderCount()).toBe(beforeOrders);
    expect(await pendingReservationsFor(sess.userId)).toBe(beforeRes);
  });

  test('2a. explicit revoked scope is rejected (SCOPE_REVOKED)', async () => {
    const scope = await allowanceScopeService.create(
      sess.userId, `sess_${sess.sessionId.slice(0, 8)}`, OrderOrigin.HUMAN,
      { label: 'Reusable', currency: 'EUR' }
    );
    await allowanceScopeService.revoke(sess.userId, scope.id);

    const beforeOrders = await globalOrderCount();
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'scope-revoked-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }], scopeId: scope.id });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_REVOKED');
    expect(mockCreateOrder).not.toHaveBeenCalled();

    expect(await globalOrderCount()).toBe(beforeOrders);
  });

  test('2b. explicit expired scope is rejected (SCOPE_EXPIRED)', async () => {
    const scope = await allowanceScopeService.create(
      sess.userId, `sess_${sess.sessionId.slice(0, 8)}`, OrderOrigin.HUMAN,
      { label: 'Old', currency: 'EUR', expiresAt: new Date(Date.now() - 5000) }
    );

    const beforeOrders = await globalOrderCount();
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'scope-expired-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }], scopeId: scope.id });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_EXPIRED');
    expect(mockCreateOrder).not.toHaveBeenCalled();

    expect(await globalOrderCount()).toBe(beforeOrders);
  });

  test('2c. explicit foreign-session scope is rejected (SCOPE_NOT_OWNED)', async () => {
    // The scope is owned by sess; the checkout is attempted by `other`.
    const scope = await allowanceScopeService.create(
      sess.userId, `sess_${sess.sessionId.slice(0, 8)}`, OrderOrigin.HUMAN,
      { label: 'Mine', currency: 'EUR' }
    );

    const beforeOrders = await globalOrderCount();
    const res = await request(app)
      .post('/api/orders/create')
      .set(other.headers)
      .set('Idempotency-Key', 'scope-foreign-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }], scopeId: scope.id });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_NOT_OWNED');
    expect(mockCreateOrder).not.toHaveBeenCalled();

    expect(await globalOrderCount()).toBe(beforeOrders);
  });

  test('2d. explicit pending (agent-proposed, unapproved) scope is rejected (SCOPE_PENDING)', async () => {
    const scope = await allowanceScopeService.create(
      sess.userId, `sess_${sess.sessionId.slice(0, 8)}`, OrderOrigin.AI_AGENT,
      { label: 'Agent suggestion', currency: 'EUR' }
    );

    const beforeOrders = await globalOrderCount();
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'scope-pending-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }], scopeId: scope.id });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_PENDING');
    expect(mockCreateOrder).not.toHaveBeenCalled();

    expect(await globalOrderCount()).toBe(beforeOrders);
  });

  test('3. no explicit scope continues to use the global-policy path (success)', async () => {
    const beforeOrders = await globalOrderCount();
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'scope-absent-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.orderId).toBeDefined();
    expect(res.body.approvalUrl).toBeDefined();
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);

    // The global-policy path did create an order.
    expect(await globalOrderCount()).toBe(beforeOrders + 1);
  });

  test('4. explicit invalid scope is rejected even when it would otherwise pass the global policy', async () => {
    // The cart is small and valid under the global policy; only the explicit
    // scope is invalid — the request must STILL be rejected (never fall back).
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'scope-invalid-despite-global-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }], scopeId: 'scp_nope' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_NOT_FOUND');
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('5. a malformed scopeId (null) is rejected, never treated as absent', async () => {
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'scope-null-001')
      .send({ items: [{ productId: 'coffee', quantity: 1 }], scopeId: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('scopeId');
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});

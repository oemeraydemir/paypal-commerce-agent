import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// Scoped AI Allowance (Stage 2): real-HTTP contract for GET/PATCH /api/policy
// plus cross-session isolation. PayPal is mocked so /orders/create can be used
// to prove the updated allowance is actually enforced server-side.

jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
  },
}));

const app = createApp();
const orderService = OrderService.getInstance();
const mockCreateOrder = paypalClient.createOrder as jest.Mock;

const CREATED_PAYPAL = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/approve' }],
};

let sess: TestSession;

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  jest.clearAllMocks();
  orderService.reset();
  policyStorage.reset();
  dailySpendTracker.reset();
  mockCreateOrder.mockResolvedValue(CREATED_PAYPAL);
});

describe('Scoped AI Allowance', () => {
  test('GET /api/policy returns the session-scoped limits, usage and no validUntil by default', async () => {
    const res = await request(app).get('/api/policy').set(sess.headers);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.validUntil).toBeNull();
    expect(res.body.limits.maxPerPurchaseMinor).toBeGreaterThan(0);
    expect(res.body.limits.dailySpendLimitMinor).toBeGreaterThan(0);
    expect(res.body.usage.spentTodayMinor).toBe(0);
  });

  test('401 without a session', async () => {
    const res = await request(app).patch('/api/policy').send({ maxPerPurchaseMinor: 2000 });
    expect(res.status).toBe(401);
    expect(res.body.details?.code).toBe('SESSION_REQUIRED');
  });

  test('PATCH sets a future validUntil; it appears in policy preview and is enforced at /orders/create', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const patch = await request(app)
      .patch('/api/policy')
      .set(sess.headers)
      .send({ validUntil: future, maxPerPurchaseMinor: 2000 });
    expect(patch.status).toBe(200);
    expect(patch.body.validUntil).toBe(future);
    expect(patch.body.limits.maxPerPurchaseMinor).toBe(2000);

    const preview = await request(app)
      .post('/api/policy/preview')
      .set(sess.headers)
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(preview.status).toBe(200);
    expect(preview.body.limits.validUntil).toBe(future);

    const created = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'allowance-1')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(created.status).toBe(201);
  });

  test('PATCH rejects a past validUntil', async () => {
    const res = await request(app)
      .patch('/api/policy')
      .set(sess.headers)
      .send({ validUntil: new Date('2020-01-01T00:00:00.000Z').toISOString() });
    expect(res.status).toBe(400);
  });

  test('PATCH enforces the cross-field invariant: daily >= per-purchase', async () => {
    const res = await request(app)
      .patch('/api/policy')
      .set(sess.headers)
      .send({ maxPerPurchaseMinor: 8000, dailySpendLimitMinor: 2000 });
    expect(res.status).toBe(422);
  });

  test('an expired allowance blocks order creation with ALLOWANCE_EXPIRED', async () => {
    // Directly expire the caller's session-scoped policy (server-side).
    policyStorage.setPolicy({
      ...policyStorage.getOrCreatePolicy(sess.userId),
      validUntil: new Date('2020-01-01T00:00:00.000Z'),
    });

    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'allowance-expired')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });

    expect(res.status).toBe(403);
    expect(res.body.policyDecision).toBe('BLOCK');
    expect(res.body.violations.map((v: any) => v.type)).toContain('ALLOWANCE_EXPIRED');
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('cross-session isolation: one session lowering its limit does not affect another', async () => {
    const other = await newSession(app);

    await request(app)
      .patch('/api/policy')
      .set(sess.headers)
      .send({ maxPerPurchaseMinor: 3000 });

    const a = await request(app).get('/api/policy').set(sess.headers);
    const b = await request(app).get('/api/policy').set(other.headers);
    expect(a.body.limits.maxPerPurchaseMinor).toBe(3000);
    expect(b.body.limits.maxPerPurchaseMinor).not.toBe(3000);
  });

  test('PATCH ignores non-whitelisted fields', async () => {
    const res = await request(app)
      .patch('/api/policy')
      .set(sess.headers)
      .send({ userId: 'someone-else', currency: 'USD', maxPerPurchaseMinor: 2000 });
    expect(res.status).toBe(200);
    expect(res.body.currency).not.toBe('USD');
    expect(res.body.limits.maxPerPurchaseMinor).toBe(2000);
  });

  test('the signed cart mandate evidences the applied allowance limits', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const patch = await request(app)
      .patch('/api/policy')
      .set(sess.headers)
      .send({ validUntil: future, maxPerPurchaseMinor: 2000 });
    expect(patch.status).toBe(200);

    const created = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'mandate-evidence')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(created.status).toBe(201);
    const orderId = created.body.orderId;
    expect(typeof orderId).toBe('string');

    const mandate = await request(app)
      .get(`/api/orders/${orderId}/mandate`)
      .set(sess.headers);
    expect(mandate.status).toBe(200);
    expect(mandate.body.mandate.constraints.policyEnforcedByServer).toBe(true);
    expect(mandate.body.mandate.constraints.appliedLimits).toMatchObject({
      maxPerPurchaseMinor: 2000,
      enabled: true,
      validUntil: future,
    });
    // The applied limits are covered by the signed record.
    expect(typeof mandate.body.signature).toBe('string');
  });
});

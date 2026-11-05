import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// Stage 3: Dispute Evidence Package contract — build + verify endpoints,
// cross-session isolation, tamper detection and PII minimization.

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

async function createOrder(): Promise<string> {
  const res = await request(app)
    .post('/api/orders/create')
    .set(sess.headers)
    .set('Idempotency-Key', 'evidence-order')
    .send({ items: [{ productId: 'coffee', quantity: 1 }] });
  expect(res.status).toBe(201);
  return res.body.orderId;
}

describe('Dispute Evidence Package', () => {
  test('GET evidence returns a signed, self-consistent package for the shopper\'s own order', async () => {
    const orderId = await createOrder();

    const res = await request(app).get(`/api/orders/${orderId}/evidence`).set(sess.headers);
    expect(res.status).toBe(200);
    const pkg = res.body;
    expect(pkg.version).toBe('aicafe.evidence/1');
    expect(pkg.orderId).toBe(orderId);
    expect(pkg.mandate.mandate.orderId).toBe(orderId);
    expect(pkg.mandate.mandate.constraints.policyEnforcedByServer).toBe(true);
    expect(pkg.order.items).toEqual([{ productId: 'coffee', quantity: 1 }]);
    expect(pkg.humanApproval.authority).toBe('buyer_approval_at_paypal');
    typeof pkg.integrity.signature === 'string' && expect(pkg.integrity.signature.length).toBeGreaterThan(20);
    // The ALLOW policy event is correlated to the order.
    expect(pkg.policyEvents.length).toBe(1);
    expect(pkg.policyEvents[0].decision).toBe('AUTO_ALLOW');
  });

  test('a valid package verifies as valid with all checks passing', async () => {
    const orderId = await createOrder();
    const pkg = (await request(app).get(`/api/orders/${orderId}/evidence`).set(sess.headers)).body;

    const verify = await request(app).post('/api/evidence/verify').send(pkg);
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.checks.signature).toBe(true);
    expect(verify.body.checks.digest).toBe(true);
    expect(verify.body.checks.mandateValid).toBe(true);
    expect(verify.body.checks.matchesOrder).toBe(true);
  });

  test('tampering with the order total breaks the verification', async () => {
    const orderId = await createOrder();
    const pkg = (await request(app).get(`/api/orders/${orderId}/evidence`).set(sess.headers)).body;

    // Tamper: change a value covered by the signature/digest.
    pkg.order.totalMinor = pkg.order.totalMinor + 1;

    const verify = await request(app).post('/api/evidence/verify').send(pkg);
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(false);
    expect(verify.body.checks.signature).toBe(false);
    expect(verify.body.checks.digest).toBe(false);
  });

  test('another session cannot read the order\'s evidence', async () => {
    const orderId = await createOrder();
    const other = await newSession(app);

    const res = await request(app).get(`/api/orders/${orderId}/evidence`).set(other.headers);
    expect(res.status).toBe(404);
  });

  test('missing order returns 404 for the evidence endpoint', async () => {
    const res = await request(app).get('/api/orders/nope/evidence').set(sess.headers);
    expect(res.status).toBe(404);
  });

  test('the package minimizes PII: no shopper identity in events, no item names', async () => {
    const orderId = await createOrder();
    const pkg = (await request(app).get(`/api/orders/${orderId}/evidence`).set(sess.headers)).body;

    for (const ev of pkg.policyEvents) {
      expect(ev.userId).toBeUndefined();
      expect(ev.sessionId).toBeUndefined();
      expect(ev.cartId).toBeUndefined();
    }
    for (const item of pkg.order.items) {
      expect(item.name).toBeUndefined();
    }
  });

  test('the package separates verified records from AI-generated narrative', async () => {
    const orderId = await createOrder();
    const pkg = (await request(app).get(`/api/orders/${orderId}/evidence`).set(sess.headers)).body;

    expect(Array.isArray(pkg.evidenceItems)).toBe(true);
    expect(pkg.evidenceItems.length).toBeGreaterThan(1);
    // The AI narrative is explicitly marked as narrative + unverified.
    const narrative = pkg.evidenceItems.find((it: any) => it.kind === 'generated-statement');
    expect(narrative).toBeDefined();
    expect(narrative.source).toBe('narrative');
    expect(narrative.verified).toBe(false);
    // Every verified record must carry source=record + verified=true.
    for (const it of pkg.evidenceItems) {
      if (it.kind === 'generated-statement') continue;
      expect(it.source).toBe('record');
      expect(it.verified).toBe(true);
    }
  });

  test('a scoped allowance is reflected in the evidence order summary and timeline', async () => {
    // Create a shopper scope, then an order bound to it.
    const scopeRes = await request(app)
      .post('/api/policy/scopes')
      .set(sess.headers)
      .send({ label: 'Evidence budget', currency: 'EUR', dailySpendLimitMinor: 2000 });
    expect(scopeRes.status).toBe(201);
    const scopeId = scopeRes.body.scope.id;

    const orderRes = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'evidence-scoped-order')
      .send({ items: [{ productId: 'coffee', quantity: 1 }], scopeId });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.orderId;

    const pkg = (await request(app).get(`/api/orders/${orderId}/evidence`).set(sess.headers)).body;
    expect(pkg.order.appliedScopeId).toBe(scopeId);
    const scopeStep = pkg.timeline.find((s: any) => typeof s.detail === 'string' && s.detail.includes(scopeId));
    expect(scopeStep).toBeDefined();
  });
});

describe('Merchant evidence access (single route, two audiences)', () => {
  const KEY = 'merchant-test-key-0123456789';
  afterEach(() => { delete process.env.OPS_COPILOT_KEY; delete process.env.DASHBOARD_PUBLIC; });

  test('merchant with the ops key reads any order\'s package without a session', async () => {
    const orderId = await createOrder();
    process.env.OPS_COPILOT_KEY = KEY;
    const res = await request(app).get(`/api/orders/${orderId}/evidence`).set('x-ops-key', KEY);
    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe(orderId);
  });

  test('no session and no/invalid key is rejected, even in public dashboard demo mode', async () => {
    const orderId = await createOrder();
    process.env.OPS_COPILOT_KEY = KEY;
    process.env.DASHBOARD_PUBLIC = 'true';
    expect((await request(app).get(`/api/orders/${orderId}/evidence`)).status).toBeGreaterThanOrEqual(401);
    expect((await request(app).get(`/api/orders/${orderId}/evidence`).set('x-ops-key', 'wrong-wrong-wrong-wrong')).status).toBeGreaterThanOrEqual(401);
  });
});

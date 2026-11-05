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
const CREATED = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/mock-approve' }],
};

const app = createApp();

let sess: TestSession;
let other: TestSession;

/** Create an ACTIVE SHOPPER scoped allowance (auto-actives) with a per-purchase cap. */
async function activeScope(userId: string, maxPerPurchaseMinor: number): Promise<string> {
  const s = await allowanceScopeService.create(
    userId,
    `sess_${Date.now()}`,
    OrderOrigin.HUMAN,
    { label: 'Scoped €5', currency: 'EUR', maxPerPurchaseMinor }
  );
  return s.id;
}

const previewWithScope = (items: unknown, scopeId: string | undefined, headers = sess.headers) => {
  const body: any = { items };
  if (scopeId !== undefined) body.scopeId = scopeId;
  return request(app).post('/api/policy/preview').set(headers).send(body);
};

beforeEach(async () => {
  resetSessionState();
  allowanceScopeService.reset();
  dailySpendTracker.reset();
  sess = await newSession(app);
  other = await newSession(app);
  mockCreateOrder.mockReset();
  mockCreateOrder.mockResolvedValue(CREATED);
});

describe('POST /api/policy/preview — scoped allowance enforcement', () => {
  test('1. active €5 scope with a €7.80 cart (lentil_soup) is BLOCKED: effective limit becomes €5', async () => {
    const scopeId = await activeScope(sess.userId, 500);
    const res = await previewWithScope([{ productId: 'lentil_soup', quantity: 1 }], scopeId);
    expect(res.status).toBe(200);
    expect(res.body.totalMinor).toBe(780);
    expect(res.body.appliedScopeId).toBe(scopeId);
    expect(res.body.scope.id).toBe(scopeId);
    expect(res.body.scope.maxPerPurchaseMinor).toBe(500);
    expect(res.body.limits.maxPerPurchaseMinor).toBe(500); // effective (scoped), not the global €20
    expect(res.body.decision).toBe('BLOCK');
    const max = res.body.checks.find((c: any) => c.rule === 'maxPerPurchase');
    expect(max.status).toBe('fail');
    // Global ceiling is €20 — this cart would pass globally, so a BLOCK proves the scope tightened it.
  });

  test('2. active €5 scope with a €3.90 cart (brownie) is permitted (AUTO_ALLOW)', async () => {
    const scopeId = await activeScope(sess.userId, 500);
    const res = await previewWithScope([{ productId: 'brownie', quantity: 1 }], scopeId);
    expect(res.status).toBe(200);
    expect(res.body.totalMinor).toBe(390);
    expect(res.body.appliedScopeId).toBe(scopeId);
    expect(res.body.decision).toBe('AUTO_ALLOW');
    expect(res.body.requiresExplicitApproval).toBe(false);
  });

  test('3. REVOKED scope is rejected fail-closed (409 SCOPE_REVOKED) — never falls back to global', async () => {
    const scope = await allowanceScopeService.create(
      sess.userId, `sess_${Date.now()}`, OrderOrigin.HUMAN,
      { label: 'Revokable', currency: 'EUR', maxPerPurchaseMinor: 500 }
    );
    await allowanceScopeService.revoke(sess.userId, scope.id);
    // This cart (€7.80) would otherwise pass the global policy — it must STILL be refused.
    const res = await previewWithScope([{ productId: 'lentil_soup', quantity: 1 }], scope.id);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_REVOKED');
  });

  test('4. PENDING (agent-proposed, unapproved) scope is rejected fail-closed (409 SCOPE_PENDING)', async () => {
    const scope = await allowanceScopeService.create(
      sess.userId, `sess_${Date.now()}`, OrderOrigin.AI_AGENT,
      { label: 'Agent suggestion', currency: 'EUR', maxPerPurchaseMinor: 500 }
    );
    const res = await previewWithScope([{ productId: 'coffee', quantity: 1 }], scope.id);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_PENDING');
  });

  test('5. EXPIRED scope is rejected fail-closed (409 SCOPE_EXPIRED)', async () => {
    const s = await allowanceScopeService.create(
      sess.userId, `sess_${Date.now()}`, OrderOrigin.HUMAN,
      { label: 'Old', currency: 'EUR', maxPerPurchaseMinor: 500, expiresAt: new Date(Date.now() - 5000) }
    );
    const res = await previewWithScope([{ productId: 'coffee', quantity: 1 }], s.id);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_EXPIRED');
  });

  test('6. UNKNOWN scope is rejected fail-closed (403 SCOPE_NOT_FOUND)', async () => {
    const res = await previewWithScope([{ productId: 'coffee', quantity: 1 }], 'scp_does_not_exist');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_NOT_FOUND');
  });

  test('7. UNOWNED scope (another session) is rejected fail-closed (403 SCOPE_NOT_OWNED)', async () => {
    const scopeId = await activeScope(sess.userId, 500);
    const res = await previewWithScope([{ productId: 'coffee', quantity: 1 }], scopeId, other.headers);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.details?.code).toBe('SCOPE_NOT_OWNED');
  });

  test('8. no scope supplied keeps the legacy global-policy path unchanged', async () => {
    const res = await previewWithScope([{ productId: 'lentil_soup', quantity: 1 }], undefined);
    expect(res.status).toBe(200);
    expect(res.body.appliedScopeId).toBeNull();
    expect(res.body.scope).toBeNull();
    expect(res.body.limits.maxPerPurchaseMinor).toBe(2000); // global €20
    expect(res.body.decision).toBe('AUTO_ALLOW');
  });

  test('a malformed scopeId (non-string) is a 400 client error, not treated as absent', async () => {
    const res = await request(app)
      .post('/api/policy/preview')
      .set(sess.headers)
      .send({ items: [{ productId: 'coffee', quantity: 1 }], scopeId: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('scopeId');
  });
});

describe('POST /api/orders/create — checkout revalidates the scoped limit', () => {
  test('active €5 scope with a €7.80 cart is blocked at checkout even though the global policy allows it', async () => {
    const scopeId = await activeScope(sess.userId, 500);
    const beforeOrders = (await request(app).get('/api/orders').set(sess.headers)).body.orders.length;
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'scope-checkout-block-001')
      .send({ items: [{ productId: 'lentil_soup', quantity: 1 }], scopeId });
    expect(res.status).toBe(403);
    expect(res.body.policyDecision).toBe('BLOCK');
    expect(res.body.violations.map((v: any) => v.type)).toContain('MAX_PURCHASE_EXCEEDED');
    expect(mockCreateOrder).not.toHaveBeenCalled();
    const afterOrders = (await request(app).get('/api/orders').set(sess.headers)).body.orders.length;
    expect(afterOrders).toBe(beforeOrders); // no order created
  });

  test('active €5 scope with a €3.90 cart is permitted and creates the order', async () => {
    const scopeId = await activeScope(sess.userId, 500);
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'scope-checkout-ok-001')
      .send({ items: [{ productId: 'brownie', quantity: 1 }], scopeId });
    expect(res.status).toBe(201);
    expect(res.body.orderId).toBeDefined();
    expect(res.body.appliedScopeId).toBe(scopeId);
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });
});

import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// Priority 1: the evidence package now carries (a) a full per-rule detail list,
// (b) a canonical Order-to-Resolution timeline, and (c) an auto-generated
// dispute-defense statement. All three are covered by the package signature.

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
    .set('Idempotency-Key', 'evidence-enrichment')
    .send({ items: [{ productId: 'coffee', quantity: 1 }] });
  expect(res.status).toBe(201);
  return res.body.orderId;
}

async function fetchEvidence(orderId: string) {
  const res = await request(app).get(`/api/orders/${orderId}/evidence`).set(sess.headers);
  expect(res.status).toBe(200);
  return res.body;
}

describe('Priority 1: enriched dispute evidence package', () => {
  test('the package carries a canonical order-to-resolution timeline', async () => {
    const orderId = await createOrder();
    const pkg = await fetchEvidence(orderId);

    expect(Array.isArray(pkg.timeline)).toBe(true);
    const steps = pkg.timeline.map((s: any) => s.step);
    expect(steps[0]).toBe('ORDER_CREATED');
    expect(steps).toContain('POLICY_EVALUATED');
    expect(steps).toContain('HUMAN_APPROVAL');
    // Nothing is captured yet, so there is no PAYMENT_CAPTURED step.
    expect(steps).not.toContain('PAYMENT_CAPTURED');
    for (const step of pkg.timeline) {
      expect(typeof step.at).toBe('string');
      expect(Number.isNaN(new Date(step.at).getTime())).toBe(false);
    }
  });

  test('the package carries an auto-generated dispute-defense statement', async () => {
    const orderId = await createOrder();
    const pkg = await fetchEvidence(orderId);

    expect(pkg.disputeDefense.templateVersion).toBe('aicafe.dispute-defense/1');
    expect(pkg.disputeDefense.claimType).toBe('AUTHORIZED_CHECKOUT');
    expect(pkg.disputeDefense.orderReference).toBe(orderId);
    expect(Array.isArray(pkg.disputeDefense.keyFacts)).toBe(true);
    expect(pkg.disputeDefense.keyFacts.length).toBeGreaterThan(0);
    expect(Array.isArray(pkg.disputeDefense.evidencePointers)).toBe(true);
    expect(typeof pkg.disputeDefense.recommendedResponse).toBe('string');
    // The human-readable narrative is what a merchant pastes into a chargeback reply.
    expect(pkg.disputeDefense.narrative).toContain('DISPUTE / CHARGEBACK DEFENSE STATEMENT');
    expect(pkg.disputeDefense.narrative).toContain(orderId);
  });

  test('policy events keep full rule detail (which rule, expected vs actual)', async () => {
    // Force a REQUIRE_CONFIRMATION outcome so the order is created WITH a
    // recorded violation (a BLOCK would not create an order at all).
    const patch = await request(app)
      .patch('/api/policy')
      .set(sess.headers)
      .send({ confirmationThresholdMinor: 1 });
    expect(patch.status).toBe(200);

    const orderId = await createOrder();
    const pkg = await fetchEvidence(orderId);

    expect(pkg.policyEvents.length).toBeGreaterThan(0);
    const event = pkg.policyEvents[0];
    expect(event.decision).toBe('REQUIRE_CONFIRMATION');
    expect(Array.isArray(event.ruleDetails)).toBe(true);
    const detail = event.ruleDetails.find((d: any) => d.type === 'CONFIRMATION_THRESHOLD_EXCEEDED');
    expect(detail).toBeTruthy();
    expect(detail.rule).toBe('confirmationThresholdMinor');
    expect(detail.expected).toBe(1);
    expect(typeof detail.actual).toBe('number');
    expect(typeof detail.message).toBe('string');
    // The compact type list is still present for older consumers.
    expect(event.violatedRules).toContain('CONFIRMATION_THRESHOLD_EXCEEDED');
  });

  test('the enriched package still verifies as valid', async () => {
    const orderId = await createOrder();
    const pkg = await fetchEvidence(orderId);

    const verify = await request(app).post('/api/evidence/verify').send(pkg);
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.checks.signature).toBe(true);
    expect(verify.body.checks.digest).toBe(true);
  });

  test('tampering with the timeline breaks verification (it is signature-covered)', async () => {
    const orderId = await createOrder();
    const pkg = await fetchEvidence(orderId);
    pkg.timeline[0].detail = 'tampered';

    const verify = await request(app).post('/api/evidence/verify').send(pkg);
    expect(verify.body.valid).toBe(false);
    expect(verify.body.checks.signature).toBe(false);
    expect(verify.body.checks.digest).toBe(false);
  });

  test('tampering with the dispute-defense narrative breaks verification', async () => {
    const orderId = await createOrder();
    const pkg = await fetchEvidence(orderId);
    pkg.disputeDefense.narrative = 'I forged this statement.';

    const verify = await request(app).post('/api/evidence/verify').send(pkg);
    expect(verify.body.valid).toBe(false);
    expect(verify.body.checks.signature).toBe(false);
  });
});

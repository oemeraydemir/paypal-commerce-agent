import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin } from '../../src/orders/domain';
import { refundService } from '../../src/refunds/service';
import { resetRefundRouteState } from '../../src/routes/refunds';
import { resetRefundRequestRouteState } from '../../src/routes/refund-requests';
import { buildEvidencePackage } from '../../src/evidence/service';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), refundCapture: jest.fn(), getRefund: jest.fn(), getCapture: jest.fn() },
}));
const mockRefund = paypalClient.refundCapture as jest.Mock;
const KEY = 'merchant-key-0123456789';
const app = createApp();
const orders = OrderService.getInstance();
let me: TestSession;
let other: TestSession;

function paidOrder(sessionId: string, totalMinor = 1300) {
  const o = orders.create(sessionId, [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: totalMinor, lineTotalMinor: totalMinor }], 'EUR', OrderOrigin.HUMAN);
  orders.setPayPalOrderId(o.id, `PP-${o.id}`);
  orders.setPayPalCaptureResult(o.id, `CAP-${o.id}`, 'COMPLETED');
  return orders.getById(o.id)!;
}

beforeEach(async () => {
  process.env.OPS_COPILOT_KEY = KEY;
  resetSessionState();
  refundService.reset();
  resetRefundRouteState();
  resetRefundRequestRouteState();
  mockRefund.mockReset().mockResolvedValue({ id: 'REFUND-1', status: 'COMPLETED' });
  me = await newSession(app);
  other = await newSession(app);
});

describe('customer refund request', () => {
  test('creates a PROPOSED request that moves no money and shows a customer-safe status', async () => {
    const order = paidOrder(me.sessionId);
    const r = await request(app).post(`/api/orders/${order.id}/refund-request`).set(me.headers).send({ reason: 'wrong_item', note: 'Got tea instead' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'UNDER_REVIEW', amountMinor: 1300, currency: 'EUR' });
    expect(Object.keys(r.body).sort()).toEqual(['amountMinor', 'currency', 'decidedAt', 'id', 'requestedAt', 'status']);
    expect(mockRefund).not.toHaveBeenCalled();
    expect(refundService.get(r.body.id)?.proposedBy).toBe('CUSTOMER');
  });

  test('only the order owner can request or see it; others get 404', async () => {
    const order = paidOrder(me.sessionId);
    expect((await request(app).post(`/api/orders/${order.id}/refund-request`).set(other.headers).send({ reason: 'other' })).status).toBe(404);
    expect((await request(app).get(`/api/orders/${order.id}/refund-status`).set(other.headers)).status).toBe(404);
    expect((await request(app).post(`/api/orders/${order.id}/refund-request`).send({ reason: 'other' })).status).toBe(401);
  });

  test('validates reason, note and amount; one open request per order; cannot exceed the refundable amount', async () => {
    const order = paidOrder(me.sessionId);
    const url = `/api/orders/${order.id}/refund-request`;
    expect((await request(app).post(url).set(me.headers).send({ reason: 'because' })).status).toBe(400);
    expect((await request(app).post(url).set(me.headers).send({ reason: 'other', amountMinor: -5 })).status).toBe(400);
    expect((await request(app).post(url).set(me.headers).send({ reason: 'other', amountMinor: 999999 })).status).toBe(422);
    expect((await request(app).post(url).set(me.headers).send({ reason: 'other', amountMinor: 500 })).status).toBe(201);
    expect((await request(app).post(url).set(me.headers).send({ reason: 'other' })).status).toBe(409);
  });

  test('an unpaid order cannot be refunded', async () => {
    const o = orders.create(me.sessionId, [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300 }], 'EUR', OrderOrigin.HUMAN);
    expect((await request(app).post(`/api/orders/${o.id}/refund-request`).set(me.headers).send({ reason: 'other' })).status).toBe(409);
  });

  test('full cycle: request → merchant approves → customer sees REFUNDED, evidence shows the refund', async () => {
    const order = paidOrder(me.sessionId);
    const req = await request(app).post(`/api/orders/${order.id}/refund-request`).set(me.headers).send({ reason: 'not_as_described' });
    const approve = await request(app).post(`/api/refunds/${req.body.id}/approve`).set('X-Ops-Key', KEY);
    expect(approve.status).toBe(200);
    expect(mockRefund).toHaveBeenCalledTimes(1);

    const status = await request(app).get(`/api/orders/${order.id}/refund-status`).set(me.headers);
    expect(status.body.refunds[0].status).toBe('REFUNDED');
    expect(status.body.refundableMinor).toBe(0);
    expect(JSON.stringify(status.body)).not.toMatch(/REFUND-1|lastError|proposedBy/);

    const pkg = buildEvidencePackage(order.id)!;
    expect(pkg.timeline.map((t) => t.step)).toEqual(expect.arrayContaining(['REFUND_REQUESTED', 'REFUND_ISSUED']));
    expect(pkg.disputeDefense.recommendedResponse).toMatch(/refunded in full/i);
    expect(pkg.disputeDefense.keyFacts.join(' ')).toMatch(/refund of 13\.00 EUR was issued/i);
  });

  test('a declined request is shown as DECLINED and recorded in the evidence timeline', async () => {
    const order = paidOrder(me.sessionId);
    const req = await request(app).post(`/api/orders/${order.id}/refund-request`).set(me.headers).send({ reason: 'changed_mind' });
    await request(app).post(`/api/refunds/${req.body.id}/reject`).set('X-Ops-Key', KEY);
    const status = await request(app).get(`/api/orders/${order.id}/refund-status`).set(me.headers);
    expect(status.body.refunds[0].status).toBe('DECLINED');
    expect(buildEvidencePackage(order.id)!.timeline.map((t) => t.step)).toContain('REFUND_DECLINED');
  });
});

describe('merchant evidence for a refund request', () => {
  test('needs the merchant key and returns the signed package of the order', async () => {
    const order = paidOrder(me.sessionId);
    const req = await request(app).post(`/api/orders/${order.id}/refund-request`).set(me.headers).send({ reason: 'other' });
    expect((await request(app).get(`/api/refunds/${req.body.id}/evidence`)).status).toBe(401);
    const ok = await request(app).get(`/api/refunds/${req.body.id}/evidence`).set('X-Ops-Key', KEY);
    expect(ok.status).toBe(200);
    expect(ok.body.integrity.alg).toBe('EdDSA');
    expect(ok.body.timeline.map((t: any) => t.step)).toContain('REFUND_REQUESTED');
    const verify = await request(app).post('/api/evidence/verify').send(ok.body);
    expect(verify.body.valid ?? verify.body.verified ?? verify.body.ok).toBeTruthy();
    expect((await request(app).get('/api/refunds/nope/evidence').set('X-Ops-Key', KEY)).status).toBe(404);
  });

  test('without any refund, the evidence package is unchanged (no refund steps)', () => {
    const order = paidOrder(me.sessionId);
    expect(buildEvidencePackage(order.id)!.timeline.map((t) => t.step)).toEqual(['ORDER_CREATED', 'HUMAN_APPROVAL', 'PAYMENT_CAPTURED']);
  });
});

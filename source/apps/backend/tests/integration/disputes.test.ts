import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin } from '../../src/orders/domain';
import { disputeService } from '../../src/disputes/service';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn(), refundCapture: jest.fn(),
    getRefund: jest.fn(), getCapture: jest.fn(), getDispute: jest.fn(), provideDisputeEvidence: jest.fn(),
  },
}));

const app = createApp();
const KEY = 'merchant-key-0123456789';
const getDispute = paypalClient.getDispute as jest.Mock;
const provideEvidence = paypalClient.provideDisputeEvidence as jest.Mock;

function paidOrder() {
  const order = OrderService.getInstance().create('dispute-session', [
    { productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: 900, lineTotalMinor: 900 },
  ], 'EUR', OrderOrigin.HUMAN);
  OrderService.getInstance().setPayPalOrderId(order.id, `PP-${order.id}`);
  OrderService.getInstance().setPayPalCaptureResult(order.id, `CAP-${order.id}`, 'COMPLETED');
  return OrderService.getInstance().getById(order.id)!;
}

beforeEach(() => {
  process.env.OPS_COPILOT_KEY = KEY;
  disputeService.reset();
  getDispute.mockReset().mockImplementation(async (id: string) => ({
    dispute_id: id,
    status: 'WAITING_FOR_SELLER_RESPONSE',
    dispute_life_cycle_stage: 'INQUIRY',
    seller_response_due_date: '2026-12-01T00:00:00Z',
    evidences: [{ evidence_type: 'OTHER', source: 'REQUESTED_FROM_SELLER' }],
    links: [{ rel: 'provide-evidence', href: 'https://api-m.sandbox.paypal.com/v1/customer/disputes/X/provide-evidence' }],
  }));
  provideEvidence.mockReset().mockResolvedValue({ _httpStatus: 200, links: [{ rel: 'self', href: 'https://api-m.sandbox.paypal.com/v1/customer/disputes/X' }] });
});

describe('merchant-controlled dispute evidence workflow', () => {
  test('requires merchant authorization and verifies the PayPal case before recording', async () => {
    const order = paidOrder();
    expect((await request(app).post('/api/disputes').send({ orderId: order.id, paypalDisputeId: 'PP-D-123' })).status).toBe(401);
    const created = await request(app).post('/api/disputes').set('X-Ops-Key', KEY).send({ orderId: order.id, paypalDisputeId: 'PP-D-123' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ orderId: order.id, paypalDisputeId: 'PP-D-123', status: 'OPEN' });
    expect(getDispute).toHaveBeenCalledWith('PP-D-123');
    expect((await request(app).post('/api/disputes').set('X-Ops-Key', KEY).send({ orderId: order.id, paypalDisputeId: 'PP-D-123' })).status).toBe(409);
  });

  test('evidence must be prepared and merchant-submitted; only verified API response becomes SUBMITTED', async () => {
    const order = paidOrder();
    const created = await request(app).post('/api/disputes').set('X-Ops-Key', KEY).send({ orderId: order.id, paypalDisputeId: 'PP-D-456' });
    const id = created.body.id;
    const prepared = await request(app).post(`/api/disputes/${id}/evidence/prepare`).set('X-Ops-Key', KEY);
    expect(prepared.body.status).toBe('EVIDENCE_READY');
    expect(prepared.body.evidenceDigest).toMatch(/^[a-f0-9]{64}$/);
    const submitted = await request(app).post(`/api/disputes/${id}/evidence/submit`).set('X-Ops-Key', KEY).send({ evidenceType: 'OTHER', notes: 'Order details verified.' });
    expect(submitted.body.status).toBe('SUBMITTED');
    expect(provideEvidence).toHaveBeenCalledWith('PP-D-456', { evidence_type: 'OTHER', notes: 'Order details verified.' });
    const exported = await request(app).get(`/api/disputes/${id}/evidence/export`).set('X-Ops-Key', KEY);
    expect(exported.status).toBe(200);
    expect(exported.body.submissionMode).toBe('MERCHANT_CONTROLLED');
    expect(exported.body.package.integrity.alg).toBe('EdDSA');
    expect(JSON.stringify(exported.body)).not.toMatch(/CLIENT_SECRET|access_token|refresh_token/i);
  });

  test('uncertain submit response is not fabricated as success or blindly resubmitted', async () => {
    const order = paidOrder();
    const created = await request(app).post('/api/disputes').set('X-Ops-Key', KEY).send({ orderId: order.id, paypalDisputeId: 'PP-D-789' });
    const id = created.body.id;
    await request(app).post(`/api/disputes/${id}/evidence/prepare`).set('X-Ops-Key', KEY);
    provideEvidence.mockRejectedValueOnce(new Error('network timeout'));
    const result = await request(app).post(`/api/disputes/${id}/evidence/submit`).set('X-Ops-Key', KEY).send({ evidenceType: 'OTHER', notes: 'Reviewed.' });
    expect(result.body.status).toBe('SUBMISSION_UNCERTAIN');
    const retry = await request(app).post(`/api/disputes/${id}/evidence/submit`).set('X-Ops-Key', KEY).send({ evidenceType: 'OTHER', notes: 'Reviewed.' });
    expect(retry.status).toBe(409);
    expect(provideEvidence).toHaveBeenCalledTimes(1);
  });

  test('restart recovery marks an unresolved submission uncertain without retrying it', async () => {
    const order = paidOrder();
    const created = await request(app).post('/api/disputes').set('X-Ops-Key', KEY).send({ orderId: order.id, paypalDisputeId: 'PP-D-987' });
    const id = created.body.id;
    await request(app).post(`/api/disputes/${id}/evidence/prepare`).set('X-Ops-Key', KEY);
    disputeService.get(id)!.status = 'SUBMISSION_PENDING'; // simulate process interruption after durable claim
    const refreshed = await request(app).post(`/api/disputes/${id}/refresh`).set('X-Ops-Key', KEY);
    expect(refreshed.body.status).toBe('SUBMISSION_UNCERTAIN');
    expect((await request(app).post(`/api/disputes/${id}/evidence/submit`).set('X-Ops-Key', KEY).send({ evidenceType: 'OTHER', notes: 'Reviewed.' })).status).toBe(409);
    expect(provideEvidence).not.toHaveBeenCalled();
  });

  test('non-OTHER evidence is kept on the merchant-controlled PayPal path', async () => {
    const order = paidOrder();
    getDispute.mockResolvedValueOnce({
      dispute_id: 'PP-D-654', status: 'WAITING_FOR_SELLER_RESPONSE',
      evidences: [{ evidence_type: 'PROOF_OF_REFUND', source: 'REQUESTED_FROM_SELLER' }],
      links: [{ rel: 'provide-evidence', href: 'https://api-m.sandbox.paypal.com/example' }],
    });
    const created = await request(app).post('/api/disputes').set('X-Ops-Key', KEY).send({ orderId: order.id, paypalDisputeId: 'PP-D-654' });
    const id = created.body.id;
    await request(app).post(`/api/disputes/${id}/evidence/prepare`).set('X-Ops-Key', KEY);
    const result = await request(app).post(`/api/disputes/${id}/evidence/submit`).set('X-Ops-Key', KEY).send({ evidenceType: 'PROOF_OF_REFUND', notes: 'Refund record exists.' });
    expect(result.status).toBe(422);
    expect(provideEvidence).not.toHaveBeenCalled();
  });
});

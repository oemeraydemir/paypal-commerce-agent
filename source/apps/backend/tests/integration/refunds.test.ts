import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin, OrderStatus } from '../../src/orders/domain';
import { refundService } from '../../src/refunds/service';
import { resetRefundRouteState } from '../../src/routes/refunds';
import { executeInternalTool } from '../../src/ops/ops-tools';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), refundCapture: jest.fn() },
}));

const mockRefund = paypalClient.refundCapture as jest.Mock;
const KEY = 'merchant-key-0123456789';
const app = createApp();
const orders = OrderService.getInstance();

function paidOrder(totalMinor = 1300) {
  const order = orders.create(
    'sess-refund',
    [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: totalMinor, lineTotalMinor: totalMinor }],
    'EUR',
    OrderOrigin.AI_ASSISTED
  );
  orders.setPayPalOrderId(order.id, `PP-${order.id}`);
  orders.setPayPalCaptureResult(order.id, `CAP-${order.id}`, 'COMPLETED');
  return orders.getById(order.id)!;
}

beforeEach(() => {
  process.env.OPS_COPILOT_KEY = KEY;
  refundService.reset();
  resetRefundRouteState();
  mockRefund.mockReset();
  mockRefund.mockResolvedValue({ id: 'REFUND-1', status: 'COMPLETED' });
});

describe('Refund queue API', () => {
  test('requires the merchant key; 503 when no key is configured', async () => {
    expect((await request(app).get('/api/refunds')).status).toBe(401);
    expect((await request(app).get('/api/refunds').set('X-Ops-Key', 'wrong-wrong-wrong-wrong')).status).toBe(401);
    delete process.env.OPS_COPILOT_KEY;
    expect((await request(app).get('/api/refunds').set('X-Ops-Key', KEY)).status).toBe(503);
  });

  test('proposing moves no money; approving issues exactly one PayPal refund with a stable request id', async () => {
    const order = paidOrder(1300);
    const proposed = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY)
      .send({ orderId: order.id, reason: 'Cold coffee' });
    expect(proposed.status).toBe(201);
    expect(proposed.body).toMatchObject({ status: 'PROPOSED', amountMinor: 1300, currency: 'EUR' });
    expect(mockRefund).not.toHaveBeenCalled();

    const id = proposed.body.id;
    const [a, b] = await Promise.all([
      request(app).post(`/api/refunds/${id}/approve`).set('X-Ops-Key', KEY),
      request(app).post(`/api/refunds/${id}/approve`).set('X-Ops-Key', KEY),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith(
      `CAP-${order.id}`,
      expect.objectContaining({ amount: { currencyCode: 'EUR', value: '13.00' }, noteToPayer: 'Cold coffee' }),
      `aicafe-refund-${id}`
    );
    expect(refundService.get(id)).toMatchObject({ status: 'REFUNDED', paypalRefundId: 'REFUND-1' });
  });

  test('cannot refund more than the order total, or an unpaid order, or twice in parallel', async () => {
    const order = paidOrder(1000);
    const tooMuch = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY)
      .send({ orderId: order.id, amountMinor: 1001, reason: 'too much' });
    expect(tooMuch.status).toBe(422);

    const ok = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY)
      .send({ orderId: order.id, amountMinor: 400, reason: 'partial' });
    expect(ok.status).toBe(201);
    const dup = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY)
      .send({ orderId: order.id, reason: 'again' });
    expect(dup.status).toBe(409);

    await request(app).post(`/api/refunds/${ok.body.id}/approve`).set('X-Ops-Key', KEY);
    const rest = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY)
      .send({ orderId: order.id, amountMinor: 700, reason: 'remaining' });
    expect(rest.status).toBe(422); // only 600 left

    const unpaid = orders.create('s', [{ productId: 'coffee', name: 'c', quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300 }], 'EUR', OrderOrigin.HUMAN);
    const res = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: unpaid.id, reason: 'nope' });
    expect(res.status).toBe(409);
    expect(unpaid.status).not.toBe(OrderStatus.PAID);
  });

  test('a PayPal failure leaves the request PROPOSED and retryable', async () => {
    const order = paidOrder(500);
    const { body } = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, reason: 'oops' });
    mockRefund.mockRejectedValueOnce(new Error('boom client_secret=abc123'));
    const fail = await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(fail.status).toBe(502);
    expect(fail.body.status).toBe('PROPOSED');
    expect(JSON.stringify(fail.body)).not.toContain('abc123');
    const retry = await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(retry.status).toBe(200);
    expect(mockRefund.mock.calls[0][2]).toBe(mockRefund.mock.calls[1][2]); // same PayPal-Request-Id
  });

  test('reject ends the request without calling PayPal', async () => {
    const order = paidOrder(500);
    const { body } = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, reason: 'nah' });
    expect((await request(app).post(`/api/refunds/${body.id}/reject`).set('X-Ops-Key', KEY)).body.status).toBe('REJECTED');
    expect((await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY)).status).toBe(409);
    expect(mockRefund).not.toHaveBeenCalled();
  });
});

describe('Ops Copilot propose_refund tool', () => {
  test('only queues a proposal: PayPal is never called', () => {
    const order = paidOrder(900);
    const out: any = executeInternalTool('propose_refund', JSON.stringify({ orderId: order.id, reason: 'Late delivery' }));
    expect(out).toMatchObject({ proposed: true, status: 'PROPOSED' });
    expect(out.note).toMatch(/Nothing was refunded/);
    expect(mockRefund).not.toHaveBeenCalled();
    expect(refundService.get(out.refundRequestId)?.proposedBy).toBe('OPS_COPILOT');
  });

  test('reports (does not throw) when the order cannot be refunded', () => {
    const out: any = executeInternalTool('propose_refund', JSON.stringify({ orderId: 'missing', reason: 'x test' }));
    expect(out).toMatchObject({ proposed: false });
  });
});

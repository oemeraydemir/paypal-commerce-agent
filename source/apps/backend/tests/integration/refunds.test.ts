import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin, OrderStatus } from '../../src/orders/domain';
import { refundService } from '../../src/refunds/service';
import { resetRefundRouteState } from '../../src/routes/refunds';
import { executeInternalTool } from '../../src/ops/ops-tools';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
    refundCapture: jest.fn(),
    getRefund: jest.fn(),
    getCapture: jest.fn(),
  },
}));
const mockRefund = paypalClient.refundCapture as jest.Mock;
const mockGetRefund = paypalClient.getRefund as jest.Mock;
const mockGetCapture = paypalClient.getCapture as jest.Mock;
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
  mockGetRefund.mockReset();
  mockGetCapture.mockReset();
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

  test('an ambiguous PayPal failure requires capture reconciliation before retry', async () => {
    const order = paidOrder(500);
    const { body } = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, reason: 'oops' });
    mockRefund.mockRejectedValueOnce(new Error('boom client_secret=abc123'));
    const fail = await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(fail.status).toBe(502);
    expect(fail.body.status).toBe('PROPOSED');
    expect(fail.body.lastError).toMatch(/may already have been issued/i);
    expect(JSON.stringify(fail.body)).not.toContain('abc123');

    mockGetCapture.mockResolvedValueOnce({
      sellerPayableBreakdown: { totalRefundedAmount: { currencyCode: 'EUR', value: '0.00' } },
    });
    const retry = await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(retry.status).toBe(200);
    expect(mockGetCapture).toHaveBeenCalledWith(`CAP-${order.id}`);
    expect(mockRefund.mock.calls[0][2]).toBe(mockRefund.mock.calls[1][2]); // same PayPal-Request-Id
  });

  test('an ambiguous PayPal failure is not retried when capture reconciliation is unavailable', async () => {
    const order = paidOrder(500);
    const { body } = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, reason: 'oops' });
    mockRefund.mockRejectedValueOnce(new Error('timeout'));
    expect((await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY)).status).toBe(502);
    mockGetCapture.mockRejectedValueOnce(new Error('network'));

    const retry = await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(retry.status).toBe(503);
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  test('an ambiguous PayPal failure reconciled as issued is not sent again', async () => {
    const order = paidOrder(500);
    const { body } = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, reason: 'oops' });
    mockRefund.mockRejectedValueOnce(new Error('timeout'));
    expect((await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY)).status).toBe(502);
    mockGetCapture.mockResolvedValueOnce({
      sellerPayableBreakdown: { totalRefundedAmount: { currencyCode: 'EUR', value: '5.00' } },
    });

    const retry = await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe('REFUNDED');
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  test('a PENDING PayPal response stays PROCESSING and is never reported as REFUNDED', async () => {
    const order = paidOrder(500);
    const { body } = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, reason: 'pending' });
    mockRefund.mockResolvedValueOnce({ id: 'REFUND-PENDING', status: 'PENDING' });

    const result = await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(result.status).toBe(202);
    expect(result.body.status).toBe('PROCESSING');
    expect(result.body.paypalRefundStatus).toBe('PENDING');
    expect((await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY)).status).toBe(409);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    // Pending money is visible as pending, not as refunded (so net revenue is not reduced early).
    expect(refundService.pendingMinor(order.id)).toBe(500);
    expect(refundService.refundedMinor(order.id)).toBe(0);
  });

  test('multiple partial refunds add up and the sum can never exceed what was captured', async () => {
    const order = paidOrder(1300);
    const refund = async (amountMinor: number, status: string, id: string) => {
      const { body } = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, amountMinor, reason: 'partial' });
      if (!body.id) return { proposed: body };
      mockRefund.mockResolvedValueOnce({ id, status });
      return { approved: await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY) };
    };
    expect((await refund(650, 'COMPLETED', 'R-A')).approved!.body.status).toBe('REFUNDED');
    expect((await refund(300, 'COMPLETED', 'R-B')).approved!.body.status).toBe('REFUNDED');
    expect(refundService.refundedMinor(order.id)).toBe(950);
    // 350 remain: asking for more is refused before PayPal is contacted.
    const tooMuch = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, amountMinor: 400, reason: 'too much' });
    expect(tooMuch.status).toBe(422);
    expect((await refund(350, 'COMPLETED', 'R-C')).approved!.body.status).toBe('REFUNDED');
    expect(refundService.refundedMinor(order.id)).toBe(1300);
    const again = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, reason: 'again' });
    expect(again.status).toBe(409); // already fully refunded
    expect(mockRefund).toHaveBeenCalledTimes(3);
  });

  test('a FAILED or CANCELLED refund moves no money in the totals and can be retried', async () => {
    const order = paidOrder(500);
    const { body } = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, reason: 'fail' });
    mockRefund.mockResolvedValueOnce({ id: 'R-F', status: 'FAILED' });
    await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(refundService.refundedMinor(order.id)).toBe(0);
    expect(refundService.pendingMinor(order.id)).toBe(0);
    // The retry first asks PayPal what became of the failed refund (never re-sends blindly), then re-issues.
    mockGetRefund.mockResolvedValueOnce({ id: 'R-F', status: 'FAILED' });
    mockRefund.mockResolvedValueOnce({ id: 'R-F2', status: 'COMPLETED' });
    const retry = await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(retry.body.status).toBe('REFUNDED');
    expect(refundService.refundedMinor(order.id)).toBe(500);
  });

  test('an existing PENDING PayPal refund is not retried', async () => {
    const order = paidOrder(500);
    const { body } = await request(app).post('/api/refunds/propose').set('X-Ops-Key', KEY).send({ orderId: order.id, reason: 'pending' });
    const record = refundService.get(body.id)!;
    record.paypalRefundId = 'REFUND-PENDING';
    mockGetRefund.mockResolvedValueOnce({ id: 'REFUND-PENDING', status: 'PENDING' });

    const result = await request(app).post(`/api/refunds/${body.id}/approve`).set('X-Ops-Key', KEY);
    expect(result.status).toBe(409);
    expect(refundService.get(body.id)?.status).toBe('PROPOSED');
    expect(mockRefund).not.toHaveBeenCalled();
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

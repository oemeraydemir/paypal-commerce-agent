import request from 'supertest';
import { createApp } from '../../src/app';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin, OrderStatus } from '../../src/orders/domain';
import { webhookService } from '../../src/paypal/webhook-service';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { verifyWebhookSignature: jest.fn().mockResolvedValue({ verification_status: 'SUCCESS' }) },
}));

const app = createApp();
const orders = OrderService.getInstance();
let seq = 0;

function pendingOrder(totalMinor = 1300) {
  const order = orders.create(
    'sess-wh-amount',
    [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: totalMinor, lineTotalMinor: totalMinor }],
    'EUR',
    OrderOrigin.HUMAN
  );
  orders.setPayPalOrderId(order.id, `PP-WH-AMT-${++seq}`);
  return orders.getById(order.id)!;
}

const post = (
  order: { paypalOrderId?: string },
  amount?: { value: string; currency_code?: string },
  status: string | null = 'COMPLETED'
) =>
  request(app)
    .post('/api/webhooks/paypal')
    .set('Content-Type', 'application/json')
    .set('paypal-transmission-id', 't')
    .set('paypal-transmission-time', new Date().toISOString())
    .set('paypal-transmission-sig', 's')
    .set('paypal-cert-url', 'https://example.com/cert')
    .set('paypal-auth-algo', 'SHA256withRSA')
    .send({
      id: `WH-AMT-${++seq}`,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: `CAP-${seq}`,
        ...(status !== null ? { status } : {}),
        ...(amount ? { amount } : {}),
        supplementary_data: { related_ids: { order_id: order.paypalOrderId } },
      },
    });

describe('webhook amount check', () => {
  beforeEach(() => {
    webhookService.reset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  test('matching amount marks the order PAID', async () => {
    const order = pendingOrder(1300);
    const res = await post(order, { value: '13.00', currency_code: 'EUR' });
    expect(res.status).toBe(200);
    expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAID);
  });

  test('a different amount is held for review: order stays pending, no PAID', async () => {
    const order = pendingOrder(1300);
    const res = await post(order, { value: '1.00', currency_code: 'EUR' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/held for review/);
    expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(orders.getById(order.id)!.paypalCaptureId).toBeUndefined();
  });

  test('a different currency is held for review too', async () => {
    const order = pendingOrder(1300);
    await post(order, { value: '13.00', currency_code: 'USD' });
    expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('an event WITHOUT an amount is held for review: it cannot be verified, so it is never PAID', async () => {
    const order = pendingOrder(1300);
    const res = await post(order);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/incomplete capture evidence/);
    expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(orders.getById(order.id)!.paypalCaptureId).toBeUndefined();
    const held = webhookService.reviewsForOrder(order.id);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ reason: 'EVIDENCE_INCOMPLETE', expectedMinor: 1300, expectedCurrency: 'EUR' });
  });

  test('an event with an amount but WITHOUT a currency is held for review', async () => {
    const order = pendingOrder(1300);
    const res = await post(order, { value: '13.00' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/incomplete capture evidence/);
    expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('a capture that is not COMPLETED (PENDING, or no status at all) is held for review', async () => {
    const pending = pendingOrder(1300);
    await post(pending, { value: '13.00', currency_code: 'EUR' }, 'PENDING');
    expect(orders.getById(pending.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    const noStatus = pendingOrder(1300);
    await post(noStatus, { value: '13.00', currency_code: 'EUR' }, null);
    expect(orders.getById(noStatus.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('a mismatch is recorded as AMOUNT_MISMATCH with the normalised evidence, never the raw payload', async () => {
    const order = pendingOrder(1300);
    await post(order, { value: '1.00', currency_code: 'EUR' });
    const held = webhookService.reviewsForOrder(order.id);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({
      reason: 'AMOUNT_MISMATCH',
      reportedValue: '1.00',
      reportedCurrency: 'EUR',
      captureStatus: 'COMPLETED',
    });
    expect(JSON.stringify(held[0])).not.toMatch(/transmission|sig|cert/i);
  });

  test('a redelivered held event is a duplicate: no second review record', async () => {
    const order = pendingOrder(1300);
    const first = await post(order, { value: '1.00', currency_code: 'EUR' });
    expect(first.status).toBe(200);
    const again = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-transmission-id', 't')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-transmission-sig', 's')
      .set('paypal-cert-url', 'https://api.sandbox.paypal.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({
        id: `WH-AMT-${seq}`,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: `CAP-${seq}`, status: 'COMPLETED', amount: { value: '1.00', currency_code: 'EUR' }, supplementary_data: { related_ids: { order_id: order.paypalOrderId } } },
      });
    expect(again.status).toBe(200);
    expect(webhookService.reviewsForOrder(order.id)).toHaveLength(1);
  });

  test('amount with trailing zeros matches via integer comparison', async () => {
    const order = pendingOrder(1300);
    const res = await post(order, { value: '13.0', currency_code: 'EUR' });
    expect(res.status).toBe(200);
    expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAID);
  });

  test('a non-numeric amount value is held for review (not auto-paid)', async () => {
    const order = pendingOrder(1300);
    const res = await post(order, { value: 'not-a-number', currency_code: 'EUR' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/held for review/);
    expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('a negative amount is held for review', async () => {
    const order = pendingOrder(1300);
    const res = await post(order, { value: '-13.00', currency_code: 'EUR' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/held for review/);
    expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });
});

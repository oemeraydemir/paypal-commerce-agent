import request from 'supertest';
import { newDb } from 'pg-mem';
import { createApp } from '../../src/app';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin, OrderStatus } from '../../src/orders/domain';
import { webhookService } from '../../src/paypal/webhook-service';
import { attachPersistence, detachPersistence, PoolLike } from '../../src/persistence/init';
import { getRepos } from '../../src/persistence/registry';

// A signed PAYMENT.CAPTURE.COMPLETED event that cannot be applied (amount mismatch or incomplete evidence)
// is held for review. The hold must be DURABLE before the route answers 2xx: a 2xx stops PayPal's retries, so
// if the write fails the route must answer non-2xx and let PayPal redeliver the event.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: { getOrder: jest.fn(), verifyWebhookSignature: jest.fn().mockResolvedValue({ verification_status: 'SUCCESS' }) },
}));

const app = createApp();
const orders = OrderService.getInstance();
let seq = 0;
let pool: PoolLike;

function pendingOrder(totalMinor = 1300) {
  const order = orders.create(
    'sess-wh-review',
    [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: totalMinor, lineTotalMinor: totalMinor }],
    'EUR',
    OrderOrigin.HUMAN
  );
  orders.setPayPalOrderId(order.id, `PP-WH-REV-${++seq}`);
  return orders.getById(order.id)!;
}

const send = (eventId: string, ppOrderId: string, resource: Record<string, unknown>) =>
  request(app)
    .post('/api/webhooks/paypal')
    .set('Content-Type', 'application/json')
    .set('paypal-transmission-id', 't')
    .set('paypal-transmission-time', new Date().toISOString())
    .set('paypal-transmission-sig', 's')
    .set('paypal-cert-url', 'https://example.com/cert')
    .set('paypal-auth-algo', 'SHA256withRSA')
    .send({
      id: eventId,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { ...resource, supplementary_data: { related_ids: { order_id: ppOrderId } } },
    });

beforeEach(async () => {
  webhookService.reset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  pool = new (newDb().adapters.createPg().Pool)() as unknown as PoolLike;
  await attachPersistence(pool, { advisoryLock: false });
});
afterEach(() => {
  detachPersistence();
  jest.restoreAllMocks();
});

test('a mismatched capture is written to webhook_reviews BEFORE the 2xx, and the order stays pending', async () => {
  const order = pendingOrder(1300);
  const res = await send(`WH-REV-${++seq}`, order.paypalOrderId!, {
    id: 'CAP-9',
    status: 'COMPLETED',
    amount: { value: '1.00', currency_code: 'EUR' },
  });
  expect(res.status).toBe(200);
  expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);

  const rows = await getRepos()!.webhookReviews.listForOrder(order.id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    orderId: order.id,
    reason: 'AMOUNT_MISMATCH',
    expectedMinor: 1300,
    expectedCurrency: 'EUR',
    reportedValue: '1.00',
    reportedCurrency: 'EUR',
    captureStatus: 'COMPLETED',
    captureId: 'CAP-9',
  });
});

test('incomplete evidence (no amount) is recorded as EVIDENCE_INCOMPLETE', async () => {
  const order = pendingOrder(1300);
  const res = await send(`WH-REV-${++seq}`, order.paypalOrderId!, { id: 'CAP-10', status: 'COMPLETED' });
  expect(res.status).toBe(200);
  const rows = await getRepos()!.webhookReviews.listForOrder(order.id);
  expect(rows.map((r) => r.reason)).toEqual(['EVIDENCE_INCOMPLETE']);
  expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
});

test('when the durable write FAILS the route answers non-2xx and the event stays redeliverable', async () => {
  const order = pendingOrder(1300);
  const repos = getRepos()!;
  const original = repos.webhookReviews.record;
  repos.webhookReviews.record = jest.fn().mockRejectedValue(new Error('db down'));
  const eventId = `WH-REV-${++seq}`;
  const body = { id: 'CAP-11', status: 'COMPLETED', amount: { value: '1.00', currency_code: 'EUR' } };

  const failed = await send(eventId, order.paypalOrderId!, body);
  expect(failed.status).toBeGreaterThanOrEqual(500);
  expect(webhookService.isDuplicate(eventId)).toBe(false); // NOT marked processed: PayPal may redeliver
  expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAYMENT_PENDING);

  repos.webhookReviews.record = original; // database is back; PayPal redelivers
  const redelivered = await send(eventId, order.paypalOrderId!, body);
  expect(redelivered.status).toBe(200);
  expect(await repos.webhookReviews.listForOrder(order.id)).toHaveLength(1);
  expect(webhookService.isDuplicate(eventId)).toBe(true);
});

test('recording the same event twice stores a single review row', async () => {
  const order = pendingOrder(1300);
  const repos = getRepos()!;
  const review = {
    eventId: 'WH-REV-DUP',
    orderId: order.id,
    reason: 'AMOUNT_MISMATCH' as const,
    expectedMinor: 1300,
    expectedCurrency: 'EUR',
  };
  await repos.webhookReviews.record(review);
  await repos.webhookReviews.record(review);
  expect(await repos.webhookReviews.listForOrder(order.id)).toHaveLength(1);
});

test('a matching capture is still applied (PAID) and writes no review row', async () => {
  const order = pendingOrder(1300);
  const res = await send(`WH-REV-${++seq}`, order.paypalOrderId!, {
    id: 'CAP-12',
    status: 'COMPLETED',
    amount: { value: '13.00', currency_code: 'EUR' },
  });
  expect(res.status).toBe(200);
  expect(orders.getById(order.id)!.status).toBe(OrderStatus.PAID);
  expect(await getRepos()!.webhookReviews.listForOrder(order.id)).toHaveLength(0);
});

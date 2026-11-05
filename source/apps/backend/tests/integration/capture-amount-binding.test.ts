import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { OrderService } from '../../src/orders/service';
import { OrderStatus } from '../../src/orders/domain';
import { settleFromPayPal } from '../../src/orders/payment-lifecycle';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';

// MOCKED PayPal (no network, no database): proves the application's own amount
// binding. That PayPal itself returns the captured amount in this shape is a
// Sandbox-only proof.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn() },
}));

const createOrder = paypalClient.createOrder as jest.Mock;
const captureOrder = paypalClient.captureOrder as jest.Mock;
const getOrder = paypalClient.getOrder as jest.Mock;
const app = createApp();
const orders = OrderService.getInstance();

let sess: TestSession;
let n = 0;

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  createOrder.mockReset().mockResolvedValue({ id: 'PP1', status: 'CREATED', links: [{ rel: 'approve', href: 'https://x/approve' }] });
  captureOrder.mockReset();
  getOrder.mockReset();
});

async function newOrder(): Promise<string> {
  const res = await request(app)
    .post('/api/orders/create')
    .set(sess.headers)
    .set('Idempotency-Key', `amt-${++n}`)
    .send({ items: [{ productId: 'coffee', quantity: 1 }] });
  expect(res.status).toBe(201);
  return res.body.orderId;
}
const capture = (id: string) => request(app).post(`/api/orders/${id}/capture`).set(sess.headers);

/** A PayPal capture result with a COMPLETED status but an arbitrary amount. */
function captured(value: string, currency: string) {
  return {
    id: 'PP1',
    status: 'COMPLETED',
    purchaseUnits: [
      {
        payments: {
          captures: [{ id: 'CAP-X', status: 'COMPLETED', amount: { value, currency_code: currency } }],
        },
      },
    ],
  };
}

describe('capture amount / currency binding (defence in depth)', () => {
  test('a capture for the exact amount marks the order PAID', async () => {
    const id = await newOrder();
    const expected = (orders.getById(id)!.totalMinor / 100).toFixed(2);
    captureOrder.mockResolvedValueOnce(captured(expected, orders.getById(id)!.currency));

    const res = await capture(id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAID);
  });

  test('a capture for a SMALLER amount is held for review: no PAID, no capture id', async () => {
    const id = await newOrder();
    captureOrder.mockResolvedValueOnce(captured('0.01', orders.getById(id)!.currency));

    const res = await capture(id);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/held for review/i);
    expect(res.body.details?.paypalIssue).toBe('CAPTURE_AMOUNT_MISMATCH');
    // The order stays payable-pending and is never told it is paid.
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(orders.getById(id)!.paypalCaptureId).toBeUndefined();
    // The reservation is NOT confirmed: the spend is not ours to count.
    const reservationId = orders.getById(id)!.reservationId!;
    expect(dailySpendTracker.getReservationState(reservationId)).toBe('PENDING');
  });

  test('a capture for a LARGER amount is held for review too', async () => {
    const id = await newOrder();
    captureOrder.mockResolvedValueOnce(captured('999.00', orders.getById(id)!.currency));

    const res = await capture(id);
    expect(res.status).toBe(502);
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('a capture in the wrong currency is held for review', async () => {
    const id = await newOrder();
    const order = orders.getById(id)!;
    captureOrder.mockResolvedValueOnce(captured((order.totalMinor / 100).toFixed(2), order.currency === 'USD' ? 'EUR' : 'USD'));

    const res = await capture(id);
    expect(res.status).toBe(502);
    expect(res.body.details?.paypalIssue).toBe('CAPTURE_AMOUNT_MISMATCH');
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('a non-numeric or negative amount is held for review, never treated as equal', async () => {
    const idA = await newOrder();
    captureOrder.mockResolvedValueOnce(captured('not-a-number', orders.getById(idA)!.currency));
    expect((await capture(idA)).status).toBe(502);
    expect(orders.getById(idA)!.status).toBe(OrderStatus.PAYMENT_PENDING);

    const idB = await newOrder();
    captureOrder.mockResolvedValueOnce(captured('-13.00', orders.getById(idB)!.currency));
    expect((await capture(idB)).status).toBe(502);
    expect(orders.getById(idB)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('a capture WITHOUT an amount and without usable lookup evidence is held: no PAID, no capture id', async () => {
    const id = await newOrder();
    captureOrder.mockResolvedValueOnce({
      id: 'PP1',
      status: 'COMPLETED',
      purchaseUnits: [{ payments: { captures: [{ id: 'CAP-NOAMT', status: 'COMPLETED' }] } }],
    });
    // The lookup is not usable either (PayPal unavailable), so the evidence stays incomplete.
    getOrder.mockRejectedValueOnce(new Error('PayPal unavailable'));

    const res = await capture(id);
    expect(res.status).toBe(502);
    expect(res.body.details?.paypalIssue).toBe('CAPTURE_EVIDENCE_INCOMPLETE');
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(orders.getById(id)!.paypalCaptureId).toBeUndefined();
    expect(dailySpendTracker.getReservationState(orders.getById(id)!.reservationId!)).toBe('PENDING');
  });

  test('a capture response without an amount is completed from a full PayPal lookup that proves the exact amount', async () => {
    const id = await newOrder();
    const order = orders.getById(id)!;
    captureOrder.mockResolvedValueOnce({
      id: 'PP1',
      status: 'COMPLETED',
      purchaseUnits: [{ payments: { captures: [{ id: 'CAP-LOOKUP', status: 'COMPLETED' }] } }],
    });
    getOrder.mockResolvedValueOnce(captured((order.totalMinor / 100).toFixed(2), order.currency));

    const res = await capture(id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    expect(getOrder).toHaveBeenCalledTimes(1);
  });

  test('missing currency, and a PENDING capture inside a COMPLETED order, are held', async () => {
    const idA = await newOrder();
    const orderA = orders.getById(idA)!;
    captureOrder.mockResolvedValueOnce({
      id: 'PP1',
      status: 'COMPLETED',
      purchaseUnits: [{ payments: { captures: [{ id: 'CAP-NOCUR', status: 'COMPLETED', amount: { value: (orderA.totalMinor / 100).toFixed(2) } }] } }],
    });
    getOrder.mockRejectedValueOnce(new Error('down'));
    const missingCurrency = await capture(idA);
    expect(missingCurrency.status).toBe(502);
    expect(missingCurrency.body.details?.paypalIssue).toBe('CAPTURE_EVIDENCE_INCOMPLETE');
    expect(orders.getById(idA)!.status).toBe(OrderStatus.PAYMENT_PENDING);

    const idB = await newOrder();
    const orderB = orders.getById(idB)!;
    captureOrder.mockResolvedValueOnce({
      id: 'PP1',
      status: 'COMPLETED',
      purchaseUnits: [{ payments: { captures: [{ id: 'CAP-PEND', status: 'PENDING', amount: { value: (orderB.totalMinor / 100).toFixed(2), currency_code: orderB.currency } }] } }],
    });
    getOrder.mockRejectedValueOnce(new Error('down'));
    const pending = await capture(idB);
    expect(pending.status).toBe(502);
    expect(orders.getById(idB)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('the purchase-unit order amount is not capture evidence', async () => {
    const id = await newOrder();
    const order = orders.getById(id)!;
    captureOrder.mockResolvedValueOnce({
      id: 'PP1',
      status: 'COMPLETED',
      purchaseUnits: [{ amount: { value: (order.totalMinor / 100).toFixed(2), currency_code: order.currency }, payments: { captures: [{ id: 'CAP-X', status: 'COMPLETED' }] } }],
    });
    getOrder.mockRejectedValueOnce(new Error('down'));
    expect((await capture(id)).status).toBe(502);
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('the PayPal capture asks for the full representation and uses a STABLE request id', async () => {
    const id = await newOrder();
    const order = orders.getById(id)!;
    captureOrder.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect((await capture(id)).status).toBe(502);
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);

    // A previous attempt is on record: the retry asks PayPal first; "approved, no capture" allows a new attempt.
    getOrder.mockResolvedValueOnce({ status: 'APPROVED', purchaseUnits: [{}] });
    captureOrder.mockResolvedValueOnce(captured((order.totalMinor / 100).toFixed(2), order.currency));
    expect((await capture(id)).status).toBe(200);
    expect(captureOrder.mock.calls.map((c: any[]) => c[1])).toEqual([`capture-${id}`, `capture-${id}`]);
  });

  test('an indeterminate PayPal lookup prevents a blind second capture', async () => {
    const id = await newOrder();
    captureOrder.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect((await capture(id)).status).toBe(502);
    getOrder.mockRejectedValueOnce(new Error('PayPal unavailable'));
    const retry = await capture(id);
    expect(retry.status).toBe(502);
    expect(retry.body.details?.paypalIssue).toBe('CAPTURE_RECONCILIATION_REQUIRED');
    expect(captureOrder).toHaveBeenCalledTimes(1);
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(dailySpendTracker.getReservationState(orders.getById(id)!.reservationId!)).toBe('PENDING');
  });

  test('a lookup body that is missing, garbled or inconsistent never allows a second capture', async () => {
    for (const lookup of [undefined, null, { foo: 'bar' }, { status: 'APPROVED' }, { status: 'APPROVED', purchaseUnits: [{ payments: { captures: [{ id: 'C', status: 'COMPLETED' }] } }] }]) {
      const id = await newOrder();
      captureOrder.mockReset().mockRejectedValueOnce(new Error('ECONNRESET'));
      expect((await capture(id)).status).toBe(502);
      getOrder.mockReset().mockResolvedValueOnce(lookup);
      const retry = await capture(id);
      expect(retry.status).toBe(502);
      expect(captureOrder).toHaveBeenCalledTimes(1);
      expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    }
  });

  test('a held order stays pending when the retry lookup reports the wrong amount; no second capture', async () => {
    const id = await newOrder();
    captureOrder.mockResolvedValueOnce(captured('0.01', orders.getById(id)!.currency));
    expect((await capture(id)).status).toBe(502);
    getOrder.mockResolvedValueOnce(captured('0.01', orders.getById(id)!.currency));
    const retry = await capture(id);
    expect(retry.status).toBe(502);
    expect(retry.body.details?.paypalIssue).toBe('CAPTURE_AMOUNT_MISMATCH');
    expect(captureOrder).toHaveBeenCalledTimes(1);
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('settleFromPayPal does not mark a COMPLETED capture paid when its amount is missing', async () => {
    const id = await newOrder();
    const order = orders.getById(id)!;
    getOrder.mockResolvedValueOnce({
      status: 'COMPLETED',
      purchaseUnits: [{ payments: { captures: [{ id: 'CAP-NOAMT', status: 'COMPLETED' }] } }],
    });
    const classification = await settleFromPayPal(order);
    expect(classification.state).toBe('UNKNOWN');
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(dailySpendTracker.getReservationState(order.reservationId!)).toBe('PENDING');
  });

  test('settleFromPayPal reports AMOUNT_MISMATCH instead of marking an order paid', async () => {
    const id = await newOrder();
    const order = orders.getById(id)!;
    getOrder.mockResolvedValueOnce(captured('0.01', order.currency));

    const classification = await settleFromPayPal(order);
    expect(classification.state).toBe('AMOUNT_MISMATCH');
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    // Money moved: the reservation must NOT be released.
    expect(dailySpendTracker.getReservationState(order.reservationId!)).toBe('PENDING');
  });

  test('settleFromPayPal still marks a matching capture paid', async () => {
    const id = await newOrder();
    const order = orders.getById(id)!;
    getOrder.mockResolvedValueOnce(captured((order.totalMinor / 100).toFixed(2), order.currency));

    const classification = await settleFromPayPal(order);
    expect(classification.state).toBe('COMPLETED');
    expect(orders.getById(id)!.status).toBe(OrderStatus.PAID);
  });
});

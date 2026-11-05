import { BillService } from '../../src/bills/service';
import { BillShare, ShareStatus } from '../../src/bills/domain';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin } from '../../src/orders/domain';
import { RefundError, refundService } from '../../src/refunds/service';
import { processExpiredBills, proposeRefundsForExpiredBill } from '../../src/bills/expiry-refunds';

const billService = BillService.getInstance();
const orderService = OrderService.getInstance();

const item = (n: number) => [
  { productId: 'p', name: 'P', quantity: 1, unitPriceMinor: n, lineTotalMinor: n },
];

function paidOrder(amount = 1000) {
  const order = orderService.create('s', item(amount), 'EUR', OrderOrigin.HUMAN);
  orderService.setPayPalOrderId(order.id, 'PP');
  orderService.setPayPalCaptureResult(order.id, 'CAP', 'COMPLETED');
  return order;
}

function pendingOrder(amount = 1000) {
  const order = orderService.create('s', item(amount), 'EUR', OrderOrigin.HUMAN);
  orderService.setPayPalOrderId(order.id, 'PP'); // PayPal order exists, capture outcome unknown
  return order;
}

/** 3-person bill (EUR 30 = 3 x 10), deadline 15 minutes. */
function makeBill() {
  const g = billService.createGroup({
    createdByUserId: 'owner',
    items: [{ productId: 'p', name: 'P', quantity: 3, unitPriceMinor: 1000, lineTotalMinor: 3000 }],
    participantCount: 3,
    currency: 'EUR',
    merchantId: 'm1',
    expiresInMinutes: 15,
  });
  g.shares[1].participantUserId = 'u2';
  g.shares[2].participantUserId = 'u3';
  return g;
}

const afterDeadline = (g: { expiresAt?: Date }) => new Date(g.expiresAt!.getTime() + 1000);

beforeEach(() => {
  billService.reset();
  orderService.reset();
  refundService.reset();
});

describe('bill deadline expiry -> refund proposals (Faz 5)', () => {
  test('paid shares get a PROPOSED refund; unpaid and pending ones do not', async () => {
    const g = makeBill();
    g.shares[0].orderId = paidOrder().id;
    g.shares[1].orderId = pendingOrder().id; // unclear PayPal outcome
    // share 3 never started paying
    billService.closeIfExpired(g, afterDeadline(g));

    const results = await proposeRefundsForExpiredBill(g);
    const byShare = Object.fromEntries(results.map((r) => [r.shareId, r.outcome]));
    expect(byShare[g.shares[0].id]).toBe('PROPOSED');
    expect(byShare[g.shares[1].id]).toBe('SKIPPED_NOT_PAID');
    expect(results.find((r) => r.shareId === g.shares[2].id)).toBeUndefined();

    const refunds = refundService.list();
    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe('PROPOSED'); // no money moved
    expect(refunds[0].amountMinor).toBe(1000);
    expect(refunds[0].proposedBy).toBe('SYSTEM');
    expect(refundService.listForOrder(g.shares[1].orderId!)).toHaveLength(0);
  });

  test('running it twice never creates a second refund for the same share', async () => {
    const g = makeBill();
    g.shares[0].orderId = paidOrder().id;
    billService.closeIfExpired(g, afterDeadline(g));

    await proposeRefundsForExpiredBill(g);
    const second = await proposeRefundsForExpiredBill(g);
    expect(second[0].outcome).toBe('SKIPPED_ALREADY_HANDLED');
    expect(refundService.listForOrder(g.shares[0].orderId!)).toHaveLength(1);
  });

  test('nothing is proposed before the deadline or for a fully paid bill', async () => {
    const open = makeBill();
    open.shares[0].orderId = paidOrder().id;
    expect(await proposeRefundsForExpiredBill(open)).toEqual([]);

    const full = makeBill();
    full.shares.forEach((s) => (s.orderId = paidOrder().id));
    billService.closeIfExpired(full, afterDeadline(full)); // settled => never closes as expired
    expect(await proposeRefundsForExpiredBill(full)).toEqual([]);
    expect(refundService.list()).toHaveLength(0);
  });

  test('processExpiredBills closes overdue bills and reports proposals', async () => {
    const g = makeBill();
    g.shares[0].orderId = paidOrder().id;
    g.shares[1].orderId = paidOrder().id;
    const proposed = await processExpiredBills(afterDeadline(g));
    expect(proposed).toBe(2);
    expect(g.closeReason).toBe('DEADLINE_EXPIRED');
    expect(await processExpiredBills(afterDeadline(g))).toBe(0); // idempotent
  });
});

describe('per-participant refund (allergen scenario: EUR 30, 3 x EUR 10)', () => {
  test("one participant refunds only their own EUR 10; the other two orders are untouched", () => {
    const g = makeBill();
    const orders = g.shares.map(() => paidOrder(1000));
    g.shares.forEach((s, i) => (s.orderId = orders[i].id));

    const record = refundService.propose({
      orderId: orders[1].id,
      reason: 'Customer (other): allergen',
      proposedBy: 'CUSTOMER',
    });
    expect(record.amountMinor).toBe(1000); // their share, not the 3000 total

    const statuses = billService.effectiveShares(g).map((s: BillShare) => s.status);
    expect(statuses).toEqual([ShareStatus.PAID, ShareStatus.PAID, ShareStatus.PAID]);
    expect(refundService.listForOrder(orders[0].id)).toHaveLength(0);
    expect(refundService.listForOrder(orders[2].id)).toHaveLength(0);
  });

  test('a second refund for the same share order is refused (no double refund)', () => {
    const g = makeBill();
    const order = paidOrder(1000);
    g.shares[1].orderId = order.id;
    refundService.propose({ orderId: order.id, reason: 'first request', proposedBy: 'CUSTOMER' });
    expect(() =>
      refundService.propose({ orderId: order.id, reason: 'second request', proposedBy: 'MERCHANT' })
    ).toThrow(RefundError);
  });
});

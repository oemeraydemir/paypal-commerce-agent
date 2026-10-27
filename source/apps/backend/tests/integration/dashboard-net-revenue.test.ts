import { OrderService } from '../../src/orders/service';
import { OrderStatus, OrderOrigin } from '../../src/orders/domain';

describe('order stats net of refunds', () => {
  const svc = OrderService.getInstance();
  beforeEach(() => svc.reset());


  test('revenue is gross captured; netRevenue subtracts approved refunds and never goes below zero', () => {
    const orders: any[] = [
      { id: 'a', status: OrderStatus.PAID, totalMinor: 1300, origin: OrderOrigin.AI_AGENT },
      { id: 'b', status: OrderStatus.PAID, totalMinor: 1000, origin: OrderOrigin.HUMAN },
      { id: 'c', status: OrderStatus.PAYMENT_PENDING, totalMinor: 500, origin: OrderOrigin.HUMAN },
    ];
    jest.spyOn(svc, 'getAll').mockReturnValue(orders);
    const refunded: Record<string, number> = { a: 650, b: 99999, c: 300 }; // b over-reports; c is not paid
    const stats = svc.getStats((id) => refunded[id] ?? 0);

    expect(stats.revenueMinor).toBe(2300);
    expect(stats.refundedMinor).toBe(650 + 1000); // b is capped at what was captured; c ignored
    expect(stats.netRevenueMinor).toBe(2300 - 1650);
    expect(stats.netRevenueFormatted).toContain('6.50');
    expect(stats.refundedFormatted).toContain('16.50');
  });

  test('without a refund source nothing is subtracted (backwards compatible)', () => {
    jest.spyOn(svc, 'getAll').mockReturnValue([
      { id: 'a', status: OrderStatus.PAID, totalMinor: 1300, origin: OrderOrigin.HUMAN } as any,
    ]);
    const stats = svc.getStats();
    expect(stats.refundedMinor).toBe(0);
    expect(stats.netRevenueMinor).toBe(stats.revenueMinor);
  });

  test('pending refunds are reported separately and are not subtracted from net revenue', () => {
    jest.spyOn(svc, 'getAll').mockReturnValue([
      { id: 'a', status: OrderStatus.PAID, totalMinor: 1300, origin: OrderOrigin.HUMAN } as any,
    ]);
    const stats = svc.getStats(() => 0, () => 650);
    expect(stats.pendingRefundMinor).toBe(650);
    expect(stats.refundedMinor).toBe(0);
    expect(stats.netRevenueMinor).toBe(1300);
  });
});

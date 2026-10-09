import { DailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { classifyPayPalOrder } from '../../src/orders/payment-lifecycle';

describe('DailySpendTracker - idempotent lifecycle', () => {
  test('confirm is idempotent and never double counts', () => {
    const t = new DailySpendTracker();
    const r = t.tryReserve('u', 3000, 10000)!;
    expect(t.confirmReservation(r.id)).toBe('CONFIRMED');
    expect(t.confirmReservation(r.id)).toBe('ALREADY_CONFIRMED');
    expect(t.getSpentToday('u')).toBe(3000);
    expect(t.getPendingReservations('u')).toBe(0);
  });

  test('cancel is idempotent and releases pending only once', () => {
    const t = new DailySpendTracker();
    const r = t.tryReserve('u', 3000, 10000)!;
    expect(t.cancelReservation(r.id)).toBe('RELEASED');
    expect(t.cancelReservation(r.id)).toBe('ALREADY_RELEASED');
    expect(t.getPendingReservations('u')).toBe(0);
    expect(t.getSpentToday('u')).toBe(0);
  });

  test('cancel/expire after confirm never un-spends', () => {
    const t = new DailySpendTracker();
    const r = t.tryReserve('u', 3000, 10000)!;
    t.confirmReservation(r.id);
    expect(t.cancelReservation(r.id)).toBe('ALREADY_CONFIRMED');
    expect(t.expireReservation(r.id)).toBe('ALREADY_CONFIRMED');
    expect(t.getSpentToday('u')).toBe(3000);
  });

  test('confirm after release still records the spend (PayPal proved money moved)', () => {
    const t = new DailySpendTracker();
    const a = t.tryReserve('u', 3000, 10000)!;
    const b = t.tryReserve('u', 2000, 10000)!;
    t.expireReservation(a.id);
    t.cancelReservation(b.id);
    expect(t.confirmReservation(a.id)).toBe('CONFIRMED_AFTER_RELEASE');
    expect(t.confirmReservation(b.id)).toBe('CONFIRMED_AFTER_RELEASE');
    expect(t.getSpentToday('u')).toBe(5000);
    expect(t.confirmReservation(a.id)).toBe('ALREADY_CONFIRMED');
    expect(t.getSpentToday('u')).toBe(5000);
  });

  test('released capacity can be reserved again; pending/confirmed/daily limit are computed separately', () => {
    const t = new DailySpendTracker();
    const a = t.tryReserve('u', 6000, 10000)!;
    expect(t.tryReserve('u', 5000, 10000)).toBeNull(); // pending counts
    t.cancelReservation(a.id);
    const b = t.tryReserve('u', 5000, 10000)!;
    t.confirmReservation(b.id);
    expect(t.getSpentToday('u')).toBe(5000);
    expect(t.getPendingReservations('u')).toBe(0);
    expect(t.tryReserve('u', 5001, 10000)).toBeNull(); // confirmed counts
    expect(t.tryReserve('u', 5000, 10000)).not.toBeNull();
  });

  test('unknown reservation ids still throw (programming error)', () => {
    const t = new DailySpendTracker();
    expect(() => t.confirmReservation('nope')).toThrow(/does not exist/);
    expect(() => t.cancelReservation('nope')).toThrow(/does not exist/);
    expect(() => t.expireReservation('nope')).toThrow(/does not exist/);
  });

  test('listPendingReservations only returns PENDING records', () => {
    const t = new DailySpendTracker();
    const a = t.tryReserve('u', 100, 10000)!;
    const b = t.tryReserve('u', 200, 10000)!;
    t.confirmReservation(a.id);
    expect(t.listPendingReservations().map((r) => r.id)).toEqual([b.id]);
    expect(t.getReservationState(a.id)).toBe('CONFIRMED');
    expect(t.getReservationState('missing')).toBeUndefined();
  });
});

describe('classifyPayPalOrder', () => {
  const o = (status: string, cap?: string) => ({
    status,
    purchaseUnits: [{ payments: { captures: cap ? [{ id: 'C1', status: cap }] : [] } }],
  });

  test.each([
    ['COMPLETED', 'COMPLETED', 'COMPLETED'],
    ['COMPLETED', 'REFUNDED', 'COMPLETED'],
    ['COMPLETED', 'DECLINED', 'DECLINED'],
    ['COMPLETED', 'FAILED', 'DECLINED'],
    ['COMPLETED', 'PENDING', 'CAPTURE_PENDING'],
    ['COMPLETED', undefined, 'UNKNOWN'], // no evidence -> never guess
    ['APPROVED', undefined, 'IN_PROGRESS'],
    ['PAYER_ACTION_REQUIRED', undefined, 'IN_PROGRESS'],
    ['CREATED', undefined, 'NOT_APPROVED'],
    ['VOIDED', undefined, 'NOT_APPROVED'],
    ['SOMETHING_NEW', undefined, 'UNKNOWN'],
  ])('order %s / capture %s -> %s', (status, cap, expected) => {
    expect(classifyPayPalOrder(o(status, cap as any)).state).toBe(expected);
  });

  test('accepts raw snake_case PayPal JSON and malformed input', () => {
    expect(
      classifyPayPalOrder({
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'C9', status: 'COMPLETED' }] } }],
      })
    ).toMatchObject({ state: 'COMPLETED', captureId: 'C9' });
    expect(classifyPayPalOrder(undefined).state).toBe('UNKNOWN');
    expect(classifyPayPalOrder({}).state).toBe('UNKNOWN');
  });
});

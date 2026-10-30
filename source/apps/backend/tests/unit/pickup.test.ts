/**
 * Unit tests for the Pickup Planner business logic. These cover the state
 * machine, capacity math, idempotent reserve/release and ambiguous-payment
 * behaviour using the dev in-memory repository (no database). The PostgreSQL
 * SELECT … FOR UPDATE contention guarantee is proven separately on real
 * PostgreSQL in tests/smoke/pg-pickup-atomicity.test.ts — pg-mem cannot model
 * it, exactly like the Split Bill P3 suites.
 */
import { pickupService } from '../../src/pickup/service';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin, OrderStatus } from '../../src/orders/domain';

const orderService = OrderService.getInstance();

function mkOrder(sessionId: string): string {
  const o = orderService.create(
    sessionId,
    [{ productId: 'p', name: 'p', quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100 }],
    'EUR',
    OrderOrigin.HUMAN
  );
  return o.id;
}
function markPaid(id: string): void {
  orderService.setPayPalOrderId(id, `pp-${id}`);
  orderService.reconcileLateCapture(id);
}
function markFailed(id: string): void {
  orderService.setPayPalOrderId(id, `pp-${id}`);
  orderService.setPayPalCaptureResult(id, 'cap', 'FAILED');
}
function markPending(id: string): void {
  orderService.setPayPalOrderId(id, `pp-${id}`);
}

function makeSlot(id: string, capacity: number): void {
  const day = '2030-01-01';
  const start = new Date(`${day}T09:00:00Z`);
  const end = new Date(`${day}T10:00:00Z`);
  void pickupService.createSlot({ id, day, startTs: start, endTs: end, capacity });
}

describe('pickup capacity + state machine (in-memory)', () => {
  beforeEach(() => {
    orderService.reset();
    pickupService.reset();
  });

  test('capacity is held atomically and a full slot rejects the next reservation', async () => {
    makeSlot('s1', 1);
    const a = await pickupService.reserve('s1', 'sessA');
    expect(a.outcome).toBe('OK');
    // Same session cannot hold two bookings.
    const again = await pickupService.reserve('s1', 'sessA');
    expect(again.outcome).toBe('ALREADY_HELD');
    // A different session sees the slot full (capacity 1).
    const b = await pickupService.reserve('s1', 'sessB');
    expect(b.outcome).toBe('FULL');
  });

  test('releasing a HELD booking frees exactly one capacity unit, idempotently', async () => {
    makeSlot('s2', 2);
    const a = await pickupService.reserve('s2', 'sessA');
    const b = await pickupService.reserve('s2', 'sessB');
    expect(a.outcome).toBe('OK');
    expect(b.outcome).toBe('OK');
    // Full now (capacity 2).
    expect((await pickupService.reserve('s2', 'sessC')).outcome).toBe('FULL');

    const first = await pickupService.release(a.bookingId!, 'sessA');
    expect(first).toBe('RELEASED');
    // Exactly one unit freed: reservedCount 2 -> 1.
    let plan = (await pickupService.getMerchantPlan()).find((p) => p.slot.id === 's2')!;
    expect(plan.slot.reservedCount).toBe(1);
    // The freed slot is immediately usable again.
    expect((await pickupService.reserve('s2', 'sessC')).outcome).toBe('OK'); // 1 -> 2
    // Releasing the same booking again is a no-op (no second decrement).
    const second = await pickupService.release(a.bookingId!, 'sessA');
    expect(second).toBe('ALREADY_RELEASED');
    // Capacity must be 2 (sessB + sessC), never 1 (no double-free) and never 0.
    plan = (await pickupService.getMerchantPlan()).find((p) => p.slot.id === 's2')!;
    expect(plan.slot.reservedCount).toBe(2);
  });

  test('ambiguous payment keeps a linked HELD booking; later confirmation moves it to CONFIRMED', async () => {
    makeSlot('s3', 3);
    const r = await pickupService.reserve('s3', 'sessA');
    const orderId = mkOrder('sessA');
    markPending(orderId); // ambiguous: PAYMENT_PENDING, no definitive outcome
    expect(await pickupService.link(r.bookingId!, orderId, 'sessA')).toBe('OK');

    const mid = await pickupService.reconcile();
    expect(mid.examined).toBe(1);
    expect(mid.kept).toBe(1);
    expect(mid.released).toBe(0);
    expect(mid.confirmed).toBe(0);

    markPaid(orderId); // definitive success
    const after = await pickupService.reconcile();
    expect(after.confirmed).toBe(1);
    const plan = (await pickupService.getMerchantPlan()).find((p) => p.slot.id === 's3')!;
    expect(plan.bookings.find((b) => b.id === r.bookingId)!.status).toBe('CONFIRMED');
    // Confirmed booking keeps the slot occupied (capacity not freed).
    expect(plan.slot.reservedCount).toBe(1);
  });

  test('definitive payment failure releases the booking and frees capacity', async () => {
    makeSlot('s4', 2);
    const r = await pickupService.reserve('s4', 'sessA');
    const orderId = mkOrder('sessA');
    markFailed(orderId);
    expect(await pickupService.link(r.bookingId!, orderId, 'sessA')).toBe('OK');

    const res = await pickupService.reconcile();
    expect(res.released).toBe(1);
    const plan = (await pickupService.getMerchantPlan()).find((p) => p.slot.id === 's4')!;
    expect(plan.bookings.find((b) => b.id === r.bookingId)!.status).toBe('RELEASED');
    expect(plan.slot.reservedCount).toBe(0);
  });

  test('an UNLINKED HELD booking past its expiry is released (definitive non-payment)', async () => {
    const prev = process.env.PICKUP_HELD_TTL_MS;
    process.env.PICKUP_HELD_TTL_MS = '1'; // 1ms so the booking expires almost immediately
    makeSlot('s5', 2);
    const r = await pickupService.reserve('s5', 'sessA');
    expect(r.outcome).toBe('OK');
    await new Promise((res) => setTimeout(res, 10)); // let the 1ms expiry elapse
    const res = await pickupService.reconcile();
    expect(res.released).toBe(1);
    const plan = (await pickupService.getMerchantPlan()).find((p) => p.slot.id === 's5')!;
    expect(plan.bookings.find((b) => b.id === r.bookingId)!.status).toBe('RELEASED');
    if (prev === undefined) delete process.env.PICKUP_HELD_TTL_MS;
    else process.env.PICKUP_HELD_TTL_MS = prev;
  });

  test('an UNLINKED HELD booking within its expiry is kept (do not fabricate a decision)', async () => {
    makeSlot('s6', 2);
    const r = await pickupService.reserve('s6', 'sessA'); // default 30min TTL
    expect(r.outcome).toBe('OK');
    const res = await pickupService.reconcile();
    expect(res.kept).toBe(1);
    expect(res.released).toBe(0);
    const plan = (await pickupService.getMerchantPlan()).find((p) => p.slot.id === 's6')!;
    expect(plan.bookings.find((b) => b.id === r.bookingId)!.status).toBe('HELD');
  });
});

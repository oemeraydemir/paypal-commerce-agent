import { v4 as uuidv4 } from 'uuid';
import { getRepos } from '../persistence/registry';
import {
  PickupBookingRow,
  PickupBookingStatus,
  PickupReconcileSummary,
  PickupRepository,
  PickupReserveOutcome,
  PickupSlotRow,
} from '../persistence/types';
import { OrderService } from '../orders/service';
import { OrderStatus } from '../orders/domain';
import { pickupHeldTtlMs } from './domain';
import { currentBusiness } from '../config/business-config';

// ---- business-local time helpers (slots are wall-clock times in the café's time zone) ----
function businessTz(): string {
  const tz = currentBusiness.timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}
function zoneParts(ms: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}
/** YYYY-MM-DD of the given instant in the business time zone. */
export function businessDay(ms: number, tz = businessTz()): string {
  const p = zoneParts(ms, tz);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
/** The UTC instant at which the wall clock in `tz` reads `day` `h:m`. */
export function zonedWallTimeToUtc(day: string, h: number, m: number, tz = businessTz()): Date {
  const [y, mo, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const offsetAt = (ms: number) => {
    const p = zoneParts(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  };
  let utc = guess - offsetAt(guess);
  utc = guess - offsetAt(utc); // second pass settles DST edges
  return new Date(utc);
}


/**
 * Dev-only in-memory repository. NOT safe across instances and NOT a substitute
 * for the PostgreSQL guarantee — it exists so the feature is usable in the
 * local/demo (no-DB) mode where capacity races are not a concern. Capacity is
 * mutated synchronously (single-threaded event loop) so the logic is correct
 * for one process; the authoritative, contention-proof guarantee lives in
 * PgPickupRepository (SELECT … FOR UPDATE).
 */
class MemoryPickupRepository implements PickupRepository {
  private slots = new Map<string, PickupSlotRow>();
  private bookings = new Map<string, PickupBookingRow>();

  async createSlot(row: PickupSlotRow): Promise<void> {
    if (!this.slots.has(row.id)) this.slots.set(row.id, row);
  }

  async getSlot(slotId: string): Promise<PickupSlotRow | undefined> {
    return this.slots.get(slotId);
  }

  async getAvailability(day: string): Promise<PickupSlotRow[]> {
    return [...this.slots.values()]
      .filter((s) => s.day === day)
      .sort((a, b) => a.startTs.getTime() - b.startTs.getTime());
  }

  async getMerchantPlan(): Promise<{ slot: PickupSlotRow; bookings: PickupBookingRow[] }[]> {
    const slots = [...this.slots.values()].sort((a, b) => a.startTs.getTime() - b.startTs.getTime());
    return slots.map((slot) => ({
      slot,
      bookings: [...this.bookings.values()].filter((b) => b.slotId === slot.id),
    }));
  }

  async reserve(input: { slotId: string; sessionId: string; bookingId: string; expiresAt: Date }): Promise<
    'OK' | 'FULL' | 'SLOT_NOT_FOUND' | 'ALREADY_HELD'
  > {
    for (const b of this.bookings.values()) {
      if (b.sessionId === input.sessionId && b.status === 'HELD') return 'ALREADY_HELD';
    }
    const slot = this.slots.get(input.slotId);
    if (!slot) return 'SLOT_NOT_FOUND';
    if (slot.reservedCount >= slot.capacity) return 'FULL';
    slot.reservedCount += 1;
    slot.updatedAt = new Date();
    this.bookings.set(input.bookingId, {
      id: input.bookingId,
      slotId: input.slotId,
      sessionId: input.sessionId,
      status: 'HELD',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: input.expiresAt,
    });
    return 'OK';
  }

  async release(input: { bookingId: string; sessionId: string }): Promise<
    'RELEASED' | 'ALREADY_RELEASED' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFIRMED'
  > {
    const booking = this.bookings.get(input.bookingId);
    if (!booking) return 'NOT_FOUND';
    if (booking.sessionId !== input.sessionId) return 'FORBIDDEN';
    if (booking.status === 'RELEASED') return 'ALREADY_RELEASED';
    if (booking.status === 'CONFIRMED') return 'CONFIRMED';
    booking.status = 'RELEASED';
    booking.updatedAt = new Date();
    const slot = this.slots.get(booking.slotId);
    if (slot) slot.reservedCount = Math.max(0, slot.reservedCount - 1);
    return 'RELEASED';
  }

  async link(input: { bookingId: string; orderId: string; sessionId: string }): Promise<
    'OK' | 'CONFIRMED' | 'NOT_FOUND' | 'FORBIDDEN' | 'MISMATCH'
  > {
    const booking = this.bookings.get(input.bookingId);
    if (!booking) return 'NOT_FOUND';
    if (booking.sessionId !== input.sessionId) return 'FORBIDDEN';
    if (booking.status !== 'HELD') return 'MISMATCH';
    const order = OrderService.getInstance().getById(input.orderId);
    if (!order) return 'NOT_FOUND';
    if (order.sessionId !== input.sessionId) return 'FORBIDDEN';
    booking.orderId = input.orderId;
    booking.updatedAt = new Date();
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.ORDER_CONFIRMED) {
      booking.status = 'CONFIRMED';
      return 'CONFIRMED';
    }
    return 'OK';
  }

  async reconcile(): Promise<PickupReconcileSummary> {
    const summary: PickupReconcileSummary = {
      examined: 0,
      confirmed: 0,
      released: 0,
      kept: 0,
      errors: 0,
    };
    const now = Date.now();
    const orders = OrderService.getInstance();
    for (const booking of [...this.bookings.values()]) {
      if (booking.status !== 'HELD') continue;
      summary.examined++;
      let target: PickupBookingStatus | null = null;
      if (!booking.orderId) {
        if (booking.expiresAt.getTime() < now) target = 'RELEASED';
      } else {
        const o = orders.getById(booking.orderId);
        const st = o?.status;
        if (st === OrderStatus.PAID || st === OrderStatus.ORDER_CONFIRMED) target = 'CONFIRMED';
        else if (st === OrderStatus.PAYMENT_FAILED || st === OrderStatus.ORDER_CANCELLED) target = 'RELEASED';
      }
      if (!target) {
        summary.kept++;
        continue;
      }
      if (target === 'RELEASED' && booking.status === 'HELD') {
        booking.status = 'RELEASED';
        const slot = this.slots.get(booking.slotId);
        if (slot) slot.reservedCount = Math.max(0, slot.reservedCount - 1);
        summary.released++;
      } else if (target === 'CONFIRMED' && booking.status === 'HELD') {
        booking.status = 'CONFIRMED';
        summary.confirmed++;
      }
    }
    return summary;
  }
}

// Single dev-only instance, used only when no durable repositories are attached.
const memoryRepo = new MemoryPickupRepository();

function repo(): PickupRepository {
  const repos = getRepos();
  return repos?.pickup ?? memoryRepo;
}

export class PickupService {
  private static instance: PickupService;
  static getInstance(): PickupService {
    if (!PickupService.instance) PickupService.instance = new PickupService();
    return PickupService.instance;
  }

  async reserve(slotId: string, sessionId: string): Promise<PickupReserveOutcome> {
    // A slot that has already started can no longer be reserved (server-side rule; the UI
    // also hides it). Unknown ids fall through to the repository's own SLOT_NOT_FOUND.
    const slot = await repo().getSlot(slotId);
    if (slot && slot.startTs.getTime() <= Date.now()) {
      return { outcome: 'SLOT_NOT_FOUND' };
    }
    const bookingId = uuidv4();
    const expiresAt = new Date(Date.now() + pickupHeldTtlMs());
    const outcome = await repo().reserve({ slotId, sessionId, bookingId, expiresAt });
    return { outcome, bookingId: outcome === 'OK' ? bookingId : undefined };
  }

  release(bookingId: string, sessionId: string) {
    return repo().release({ bookingId, sessionId });
  }

  link(bookingId: string, orderId: string, sessionId: string) {
    return repo().link({ bookingId, orderId, sessionId });
  }

  /** Customer view: keeps the calendar topped up and hides slots that already started. */
  async getAvailability(day: string) {
    await this.ensureUpcomingSlotsThrottled();
    const now = Date.now();
    return (await repo().getAvailability(day)).filter((s) => s.startTs.getTime() > now);
  }

  getMerchantPlan() {
    return repo().getMerchantPlan();
  }

  createSlot(input: Omit<PickupSlotRow, 'reservedCount' | 'version' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const now = new Date();
    return repo().createSlot({ ...input, reservedCount: 0, version: 0, createdAt: now, updatedAt: now });
  }

  reconcile() {
    return repo().reconcile();
  }

  private lastEnsureAt = 0;

  /**
   * Rolling calendar: makes sure the next `daysAhead` business days have the standard
   * slots. Idempotent (slot ids are stable per day + time and createSlot never overwrites),
   * so it is safe on every boot, on every instance, and repeatedly at runtime. Set
   * PICKUP_AUTOSEED=false to manage slots entirely by hand (POST /api/pickup/slots).
   */
  async ensureUpcomingSlots(daysAhead = 7): Promise<number> {
    if (process.env.PICKUP_AUTOSEED === 'false') return 0;
    const tz = businessTz();
    const times = [
      { h: 9, m: 0 },
      { h: 12, m: 0 },
      { h: 15, m: 0 },
      { h: 18, m: 0 },
    ];
    let created = 0;
    const seen = new Set<string>();
    for (let d = 0; d < daysAhead; d++) {
      const day = businessDay(Date.now() + d * 86400000, tz);
      if (seen.has(day)) continue; // DST days can repeat a date at the boundary
      seen.add(day);
      for (const t of times) {
        const start = zonedWallTimeToUtc(day, t.h, t.m, tz);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        await this.createSlot({ id: `slot-${day}-${t.h}${t.m}`, day, startTs: start, endTs: end, capacity: 3 });
        created++;
      }
    }
    return created;
  }

  private async ensureUpcomingSlotsThrottled(): Promise<void> {
    if (Date.now() - this.lastEnsureAt < 10 * 60 * 1000) return;
    this.lastEnsureAt = Date.now();
    try {
      await this.ensureUpcomingSlots();
    } catch (err: any) {
      this.lastEnsureAt = 0; // retry on the next request
      console.warn(`Pickup slot top-up failed: ${err?.message ?? err}`);
    }
  }

  /** @deprecated kept for callers/tests: now delegates to the rolling top-up. */
  async seedDefaultSlotsIfEmpty(): Promise<number> {
    return this.ensureUpcomingSlots();
  }

  /** Test isolation only. */
  reset(): void {
    this.lastEnsureAt = 0;
    if (repo() === memoryRepo) {
      (memoryRepo as unknown as { slots: Map<string, PickupSlotRow> }).slots.clear();
      (memoryRepo as unknown as { bookings: Map<string, PickupBookingRow> }).bookings.clear();
    }
  }
}

export const pickupService = new PickupService();

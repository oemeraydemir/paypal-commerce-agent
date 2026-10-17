import { randomUUID } from 'crypto';
import { DailySpendReservation } from './domain';
import { getRepos, writeQueue } from '../persistence/registry';
import { ReservationRow } from '../persistence/types';

interface DailySpend {
  day: string;
  amountMinor: number;
}

// Lifecycle of a reservation. Settled records are kept (for a bounded time) so
// confirm/cancel are idempotent and a late gateway event can still be applied.
export type ReservationState = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export type ConfirmOutcome =
  | 'CONFIRMED'
  | 'ALREADY_CONFIRMED'
  // The reservation had been released (cancelled/expired) but PayPal later
  // proved the money WAS captured: the spend is recorded anyway.
  | 'CONFIRMED_AFTER_RELEASE';
export type ReleaseOutcome =
  | 'RELEASED'
  | 'ALREADY_RELEASED'
  // Confirmed spend is never un-spent by a cancel/expire call.
  | 'ALREADY_CONFIRMED';

interface ReservationRecord {
  reservation: DailySpendReservation;
  state: ReservationState;
  settledAt?: number;
}

const SETTLED_RETENTION_MS = 48 * 60 * 60 * 1000;

export class DailySpendTracker {
  private readonly records = new Map<string, ReservationRecord>();
  private readonly confirmedSpend = new Map<string, DailySpend>();
  // Reservation ids whose last durable write failed after retries.
  private readonly dirty = new Set<string>();

  // ---- durability (write-through; a no-op when no repository is attached) ----
  private toRow(id: string): ReservationRow | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    return {
      id,
      userId: record.reservation.userId,
      amountMinor: record.reservation.amountMinor,
      state: record.state,
      createdAt: record.reservation.createdAt,
      settledAt: record.settledAt !== undefined ? new Date(record.settledAt) : undefined,
    };
  }

  private async saveRow(id: string): Promise<void> {
    const repos = getRepos();
    const row = this.toRow(id);
    if (!repos || !row) return;
    await repos.reservations.save(row);
    this.dirty.delete(id);
  }

  private persist(id: string): void {
    if (!getRepos()) return;
    this.dirty.add(id);
    writeQueue.enqueue(`reservation:${id}`, () => this.saveRow(id)).catch(() => undefined);
  }

  /** Re-saves reservations whose earlier write failed. */
  async retryDirty(): Promise<number> {
    const ids = [...this.dirty];
    for (const id of ids) {
      await writeQueue.enqueue(`reservation-retry:${id}`, () => this.saveRow(id), { retries: 0 });
    }
    return ids.length;
  }

  /**
   * Restores reservations after a restart. The confirmed daily spend of today is
   * rebuilt from CONFIRMED rows settled today, so the daily limit survives restarts.
   */
  async hydrate(): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    const rows = await repos.reservations.loadActive(SETTLED_RETENTION_MS);
    const today = this.getCurrentDay();
    for (const row of rows) {
      this.records.set(row.id, {
        reservation: {
          id: row.id,
          userId: row.userId,
          amountMinor: row.amountMinor,
          createdAt: row.createdAt,
        },
        state: row.state,
        settledAt: row.settledAt?.getTime(),
      });
      if (row.state === 'CONFIRMED' && row.settledAt && row.settledAt.toISOString().slice(0, 10) === today) {
        const previous = this.confirmedSpend.get(row.userId);
        this.confirmedSpend.set(row.userId, {
          day: today,
          amountMinor: (previous?.day === today ? previous.amountMinor : 0) + row.amountMinor,
        });
      }
    }
    return rows.length;
  }

  getSpentToday(userId: string): number {
    const spend = this.confirmedSpend.get(userId);
    return spend?.day === this.getCurrentDay() ? spend.amountMinor : 0;
  }

  getPendingReservations(userId: string): number {
    let total = 0;
    for (const record of this.records.values()) {
      if (record.state === 'PENDING' && record.reservation.userId === userId) {
        total += record.reservation.amountMinor;
        if (!Number.isSafeInteger(total)) {
          throw new RangeError('Pending reservation total exceeds safe integer range.');
        }
      }
    }
    return total;
  }

  // Snapshot of all still-pending reservations (used by the reconciler).
  listPendingReservations(): DailySpendReservation[] {
    return [...this.records.values()]
      .filter((record) => record.state === 'PENDING')
      .map((record) => ({
        ...record.reservation,
        createdAt: new Date(record.reservation.createdAt),
      }));
  }

  getReservationState(reservationId: string): ReservationState | undefined {
    return this.records.get(reservationId)?.state;
  }

  tryReserve(
    userId: string,
    amountMinor: number,
    dailyLimitMinor: number
  ): DailySpendReservation | null {
    this.assertMinorAmount(amountMinor, 'amountMinor');
    this.assertMinorAmount(dailyLimitMinor, 'dailyLimitMinor');
    if (!userId.trim()) {
      throw new TypeError('userId must not be empty.');
    }
    this.pruneSettled();

    const projectedSpend =
      this.getSpentToday(userId) +
      this.getPendingReservations(userId) +
      amountMinor;
    if (
      !Number.isSafeInteger(projectedSpend) ||
      projectedSpend > dailyLimitMinor
    ) {
      return null;
    }

    let id = randomUUID();
    while (this.records.has(id)) {
      id = randomUUID();
    }

    const reservation: DailySpendReservation = {
      id,
      userId,
      amountMinor,
      createdAt: new Date(),
    };
    this.records.set(id, { reservation, state: 'PENDING' });
    this.persist(id);
    return { ...reservation, createdAt: new Date(reservation.createdAt) };
  }

  // Idempotent: confirming twice never double-counts the spend.
  confirmReservation(reservationId: string): ConfirmOutcome {
    const record = this.getRecord(reservationId);
    if (record.state === 'CONFIRMED') {
      return 'ALREADY_CONFIRMED';
    }

    const wasReleased = record.state !== 'PENDING';
    const today = this.getCurrentDay();
    const previousSpend = this.confirmedSpend.get(record.reservation.userId);
    const amountMinor =
      (previousSpend?.day === today ? previousSpend.amountMinor : 0) +
      record.reservation.amountMinor;
    if (!Number.isSafeInteger(amountMinor)) {
      throw new RangeError('Confirmed daily spend exceeds safe integer range.');
    }
    record.state = 'CONFIRMED';
    record.settledAt = Date.now();
    this.confirmedSpend.set(record.reservation.userId, { day: today, amountMinor });
    this.persist(reservationId);
    return wasReleased ? 'CONFIRMED_AFTER_RELEASE' : 'CONFIRMED';
  }

  // Releases a pending reservation after a DEFINITIVE failure/cancellation.
  // Idempotent; never touches already-confirmed spend.
  cancelReservation(reservationId: string): ReleaseOutcome {
    return this.release(reservationId, 'CANCELLED');
  }

  // Releases a pending reservation because its TTL elapsed AND the gateway
  // state was checked by the caller. Same semantics as cancel, distinct state.
  expireReservation(reservationId: string): ReleaseOutcome {
    return this.release(reservationId, 'EXPIRED');
  }

  private release(
    reservationId: string,
    target: 'CANCELLED' | 'EXPIRED'
  ): ReleaseOutcome {
    const record = this.getRecord(reservationId);
    if (record.state === 'CONFIRMED') {
      return 'ALREADY_CONFIRMED';
    }
    if (record.state !== 'PENDING') {
      return 'ALREADY_RELEASED';
    }
    record.state = target;
    record.settledAt = Date.now();
    this.persist(reservationId);
    return 'RELEASED';
  }

  private getRecord(reservationId: string): ReservationRecord {
    const record = this.records.get(reservationId);
    if (!record) {
      throw new Error(`Daily spend reservation ${reservationId} does not exist.`);
    }
    return record;
  }

  private pruneSettled(): void {
    const cutoff = Date.now() - SETTLED_RETENTION_MS;
    for (const [id, record] of this.records.entries()) {
      if (record.state !== 'PENDING' && (record.settledAt ?? 0) < cutoff) {
        this.records.delete(id);
      }
    }
  }

  private assertMinorAmount(amount: number, name: string): void {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer.`);
    }
  }

  private getCurrentDay(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // S10 (test isolation): clears all reservations and confirmed spend.
  reset(): void {
    this.records.clear();
    this.confirmedSpend.clear();
    this.dirty.clear();
  }
}

// S10: shared singleton used by the advisory (prepare_cart) context builder and
// the authoritative (/orders/create + /capture) enforcement points.
export const dailySpendTracker = new DailySpendTracker();

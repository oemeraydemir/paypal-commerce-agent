import { randomUUID } from 'crypto';
import { DailySpendReservation } from './domain';

interface DailySpend {
  day: string;
  amountMinor: number;
}

export class DailySpendTracker {
  private readonly reservations = new Map<string, DailySpendReservation>();
  private readonly confirmedSpend = new Map<string, DailySpend>();

  getSpentToday(userId: string): number {
    const spend = this.confirmedSpend.get(userId);
    return spend?.day === this.getCurrentDay() ? spend.amountMinor : 0;
  }

  getPendingReservations(userId: string): number {
    let total = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.userId === userId) {
        total += reservation.amountMinor;
        if (!Number.isSafeInteger(total)) {
          throw new RangeError('Pending reservation total exceeds safe integer range.');
        }
      }
    }
    return total;
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
    while (this.reservations.has(id)) {
      id = randomUUID();
    }

    const reservation: DailySpendReservation = {
      id,
      userId,
      amountMinor,
      createdAt: new Date(),
    };
    this.reservations.set(id, reservation);
    return { ...reservation, createdAt: new Date(reservation.createdAt) };
  }

  confirmReservation(reservationId: string): void {
    const reservation = this.getReservation(reservationId);

    const today = this.getCurrentDay();
    const previousSpend = this.confirmedSpend.get(reservation.userId);
    const amountMinor =
      (previousSpend?.day === today ? previousSpend.amountMinor : 0) +
      reservation.amountMinor;
    if (!Number.isSafeInteger(amountMinor)) {
      throw new RangeError('Confirmed daily spend exceeds safe integer range.');
    }
    this.reservations.delete(reservationId);
    this.confirmedSpend.set(reservation.userId, { day: today, amountMinor });
  }

  cancelReservation(reservationId: string): void {
    this.getReservation(reservationId);
    this.reservations.delete(reservationId);
  }

  private getReservation(reservationId: string): DailySpendReservation {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new Error(`Daily spend reservation ${reservationId} does not exist.`);
    }
    return reservation;
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
    this.reservations.clear();
    this.confirmedSpend.clear();
  }
}

// S10: shared singleton used by the advisory (prepare_cart) context builder and
// the authoritative (/orders/create + /capture) enforcement points.
export const dailySpendTracker = new DailySpendTracker();
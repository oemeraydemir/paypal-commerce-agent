// Pickup domain types. The booking status machine is intentionally minimal and
// server-owned: the client can never set it.
export type PickupBookingStatus = 'HELD' | 'CONFIRMED' | 'RELEASED';

export const HELD_TTL_MS_DEFAULT = 30 * 60 * 1000; // 30 minutes before an UNLINKED HELD booking is treated as abandoned

export function pickupHeldTtlMs(): number {
  const fromEnv = Number(process.env.PICKUP_HELD_TTL_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : HELD_TTL_MS_DEFAULT;
}

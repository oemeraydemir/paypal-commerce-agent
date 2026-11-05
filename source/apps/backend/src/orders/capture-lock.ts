// In-process guard for capture calls that are currently talking to PayPal.
// Prevents two concurrent capture requests for the same order, and lets the
// reservation reconciler skip orders whose capture is mid-flight.
// (Single-instance only, like the rest of the in-memory prototype state.)
const inFlight = new Set<string>();

export const captureLock = {
  acquire(orderId: string): boolean {
    if (inFlight.has(orderId)) return false;
    inFlight.add(orderId);
    return true;
  },
  release(orderId: string): void {
    inFlight.delete(orderId);
  },
  isHeld(orderId: string): boolean {
    return inFlight.has(orderId);
  },
  reset(): void {
    inFlight.clear();
  },
};

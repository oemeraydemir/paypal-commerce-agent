import { env } from '../config/environment';
import { paypalClient } from '../paypal/client';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import { Order, OrderStatus } from './domain';
import { OrderService } from './service';
import { captureLock } from './capture-lock';

// Single place that moves an order AND its daily-spend reservation together,
// so webhooks, the capture route, the cancel route and the reconciler can never
// disagree. Every function here is idempotent.
//
// Principles:
//  * PayPal is the source of truth for money. Spend is confirmed only on
//    evidence of a COMPLETED capture; a reservation is released only on a
//    definitive failure, an explicit cancel, or after TTL *and* a PayPal
//    lookup that shows nothing was captured.
//  * Ambiguous information (network error, unknown status, PENDING capture) is
//    never treated as failure: the reservation is kept and re-checked later.

const orderService = OrderService.getInstance();

function confirmIfTracked(reservationId?: string): void {
  if (!reservationId) return;
  if (dailySpendTracker.getReservationState(reservationId) === undefined) {
    console.warn(`Reservation ${reservationId} is not tracked (state lost?); skipping confirm`);
    return;
  }
  dailySpendTracker.confirmReservation(reservationId);
}

function releaseIfTracked(reservationId: string | undefined, how: 'cancel' | 'expire'): void {
  if (!reservationId) return;
  if (dailySpendTracker.getReservationState(reservationId) === undefined) return;
  if (how === 'expire') dailySpendTracker.expireReservation(reservationId);
  else dailySpendTracker.cancelReservation(reservationId);
}

/** PayPal says the money was captured: order -> PAID, reservation -> spent. */
export function markOrderPaid(order: Order, captureId?: string): Order {
  const updated = orderService.reconcileLateCapture(order.id, captureId) ?? order;
  confirmIfTracked(order.reservationId);
  return updated;
}

/** Definitive payment failure: release the reservation, fail a pending order. */
export function markOrderPaymentFailed(order: Order): void {
  const current = orderService.getById(order.id) ?? order;
  if (current.status === OrderStatus.PAYMENT_PENDING) {
    orderService.updateStatus(current.id, OrderStatus.PAYMENT_FAILED);
  }
  // A no-op for confirmed spend: a DENIED event can never "un-spend" a PAID order.
  releaseIfTracked(current.reservationId, 'cancel');
}

/** Buyer/system cancelled before any capture: release + cancel (if still pending). */
export function cancelUncapturedOrder(order: Order, how: 'cancel' | 'expire'): void {
  const current = orderService.getById(order.id) ?? order;
  if (current.status === OrderStatus.PAYMENT_PENDING) {
    orderService.updateStatus(current.id, OrderStatus.ORDER_CANCELLED);
  }
  releaseIfTracked(current.reservationId, how);
}

export type PayPalOrderState =
  | 'COMPLETED' // capture COMPLETED: money moved
  | 'DECLINED' // capture DECLINED/FAILED: definitive failure
  | 'CAPTURE_PENDING' // capture PENDING: undecided, wait for webhook
  | 'IN_PROGRESS' // APPROVED / PAYER_ACTION_REQUIRED: buyer is mid-flow
  | 'NOT_APPROVED' // CREATED / SAVED / VOIDED: buyer never approved
  | 'UNKNOWN'; // anything we cannot classify with evidence

export interface PayPalOrderClassification {
  state: PayPalOrderState;
  captureId?: string;
  rawStatus?: string;
}

// Accepts the SDK's camelCase result as well as raw snake_case JSON.
export function classifyPayPalOrder(result: any): PayPalOrderClassification {
  const rawStatus: string | undefined = result?.status;
  const units = result?.purchaseUnits ?? result?.purchase_units;
  const capture = units?.[0]?.payments?.captures?.[0];
  const captureStatus: string | undefined = capture?.status;
  const captureId: string | undefined = capture?.id;

  switch (rawStatus) {
    case 'COMPLETED':
      if (
        captureStatus === 'COMPLETED' ||
        captureStatus === 'REFUNDED' ||
        captureStatus === 'PARTIALLY_REFUNDED'
      ) {
        return { state: 'COMPLETED', captureId, rawStatus };
      }
      if (captureStatus === 'DECLINED' || captureStatus === 'FAILED') {
        return { state: 'DECLINED', captureId, rawStatus };
      }
      if (captureStatus === 'PENDING') {
        return { state: 'CAPTURE_PENDING', captureId, rawStatus };
      }
      // COMPLETED order without readable capture evidence: do not guess.
      return { state: 'UNKNOWN', rawStatus };
    case 'APPROVED':
    case 'PAYER_ACTION_REQUIRED':
      return { state: 'IN_PROGRESS', rawStatus };
    case 'CREATED':
    case 'SAVED':
    case 'VOIDED':
      return { state: 'NOT_APPROVED', rawStatus };
    default:
      return { state: 'UNKNOWN', rawStatus };
  }
}

/**
 * Looks the order up at PayPal and applies a definitive COMPLETED / DECLINED
 * result to our state. Throws if the lookup itself fails (ambiguous: callers
 * must keep the reservation). Returns the classification for the caller.
 */
export async function settleFromPayPal(order: Order): Promise<PayPalOrderClassification> {
  if (!order.paypalOrderId) {
    return { state: 'UNKNOWN' };
  }
  const result = await paypalClient.getOrder(order.paypalOrderId);
  const classification = classifyPayPalOrder(result);

  if (classification.state === 'COMPLETED') {
    markOrderPaid(order, classification.captureId);
  } else if (classification.state === 'DECLINED') {
    markOrderPaymentFailed(order);
  }
  return classification;
}

export interface ReconcileSummary {
  examined: number;
  confirmed: number;
  released: number;
  kept: number;
  errors: number;
}

export interface ReconcileOptions {
  ttlMs?: number;
  maxAgeMs?: number;
  now?: number;
}

/**
 * Reservation expiry + reconciliation. For every reservation older than the
 * TTL:
 *  - no order / order never reached PayPal -> nothing can have been paid: expire.
 *  - otherwise ask PayPal for the real state:
 *      COMPLETED          -> confirm spend, mark PAID.
 *      DECLINED           -> release, mark failed.
 *      NOT_APPROVED       -> buyer never approved: expire + cancel the order
 *                            (our capture route then refuses it, so it can no
 *                            longer be paid).
 *      IN_PROGRESS        -> keep (buyer approved/mid-flow) until MAX_AGE.
 *      CAPTURE_PENDING    -> keep; the webhook settles it.
 *      UNKNOWN / lookup error -> keep and retry on the next sweep.
 */
export async function reconcileExpiredReservations(
  options: ReconcileOptions = {}
): Promise<ReconcileSummary> {
  const ttlMs = options.ttlMs ?? env.RESERVATION_TTL_MS;
  const maxAgeMs = options.maxAgeMs ?? env.RESERVATION_MAX_AGE_MS;
  const now = options.now ?? Date.now();
  const summary: ReconcileSummary = { examined: 0, confirmed: 0, released: 0, kept: 0, errors: 0 };

  for (const reservation of dailySpendTracker.listPendingReservations()) {
    const ageMs = now - reservation.createdAt.getTime();
    if (ageMs < ttlMs) continue;
    summary.examined++;

    const order = orderService.getByReservationId(reservation.id);

    // Never race a capture that is talking to PayPal right now.
    if (order && captureLock.isHeld(order.id)) {
      summary.kept++;
      continue;
    }

    // Orphan reservation or an order that never got a PayPal order id:
    // there is nothing at PayPal that could be captured.
    if (!order || !order.paypalOrderId) {
      dailySpendTracker.expireReservation(reservation.id);
      if (order && order.status === OrderStatus.PAYMENT_PENDING) {
        orderService.updateStatus(order.id, OrderStatus.ORDER_CANCELLED);
      }
      summary.released++;
      continue;
    }

    let classification: PayPalOrderClassification;
    try {
      classification = await settleFromPayPal(order);
    } catch (err: any) {
      console.warn(`Reservation reconcile: PayPal lookup failed for order ${order.id}: ${err?.message ?? err}`);
      summary.errors++;
      summary.kept++;
      continue;
    }

    // State may have changed while we awaited PayPal: re-check synchronously.
    const current = orderService.getById(order.id) ?? order;
    if (dailySpendTracker.getReservationState(reservation.id) !== 'PENDING') {
      // Settled while we awaited PayPal. Only count what THIS run did
      // (COMPLETED/DECLINED were applied by settleFromPayPal above); anything
      // else was settled by another actor and must not be counted or touched
      // again (so overlapping sweeps never double-release).
      if (classification.state === 'COMPLETED') summary.confirmed++;
      else if (classification.state === 'DECLINED') summary.released++;
      else summary.kept++;
      continue;
    }
    if (captureLock.isHeld(current.id) || current.status === OrderStatus.PAID) {
      summary.kept++;
      continue;
    }

    switch (classification.state) {
      case 'NOT_APPROVED':
        cancelUncapturedOrder(current, 'expire');
        summary.released++;
        break;
      case 'IN_PROGRESS':
        if (ageMs >= maxAgeMs) {
          cancelUncapturedOrder(current, 'expire');
          summary.released++;
        } else {
          summary.kept++;
        }
        break;
      default:
        // CAPTURE_PENDING / UNKNOWN (COMPLETED/DECLINED were settled above).
        summary.kept++;
    }
  }
  return summary;
}

let sweeping = false;

/** Starts the periodic sweep. Called from server.ts only (never from tests). */
export function startReservationSweeper(
  intervalMs: number = env.RESERVATION_SWEEP_INTERVAL_MS
): NodeJS.Timeout {
  const timer = setInterval(async () => {
    if (sweeping) return; // no overlapping sweeps
    sweeping = true;
    try {
      const summary = await reconcileExpiredReservations();
      if (summary.examined > 0) {
        console.log(`Reservation sweep: ${JSON.stringify(summary)}`);
      }
    } catch (err: any) {
      console.error(`Reservation sweep failed: ${err?.message ?? err}`);
    } finally {
      sweeping = false;
    }
  }, intervalMs);
  timer.unref();
  return timer;
}

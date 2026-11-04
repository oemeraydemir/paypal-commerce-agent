import { AppError } from '../middleware/error-handler';

/**
 * Stage 3: Checkout Rescue — typed, documented error schema.
 *
 * A checkout can fail in a handful of ways. Every user-facing failure carries a
 * `details` object conforming to this schema so the web app and the Flutter app
 * can render the SAME guidance (retry eligibility, wait time, recovery steps)
 * without hard-coding per-path strings.
 *
 * Contract (all clients MUST honour these):
 *  - `retryable: true`  -> the failure is transient; the buyer may retry after
 *                           `retryAfterSeconds` (default 30). NEVER auto-retry.
 *  - `retryable: false` -> the failure is definitive; retrying is pointless
 *                           until the buyer changes something (approve in PayPal,
 *                           choose another method, fix the cart).
 *  - `cartSaved: true`   -> the cart and order state are intact; nothing is lost.
 *  - `paypalIssue`       -> an opaque, non-invented PayPal error category. It is
 *                           only ever set from a verified PayPal error mapping —
 *                           we never invent decline reasons.
 */
export interface CheckoutRescueDetails {
  /** Stable machine-readable code shared by all clients. */
  code: 'PAYPAL_BUSY' | 'CAPTURE_RECONCILIATION_REQUIRED' | 'ORDER_NOT_APPROVED';
  /** Whether a retry is ever useful. */
  retryable: boolean;
  /** Seconds to wait before a retry is sensible (only meaningful when retryable). */
  retryAfterSeconds?: number;
  /** Human guidance on what to do next. */
  suggestion?: string;
  alternativePayment?: string;
  /** Reassurance that the cart/order is not lost. */
  cartSaved?: boolean;
  /** Verified PayPal error category; never invented. */
  paypalIssue?: string;
}

/**
 * Builds a Checkout Rescue error with a stable shape. The message is safe for
 * the shopper; `details` carries the structured guidance.
 */
export function checkoutRescueError(
  status: number,
  message: string,
  details: CheckoutRescueDetails
): AppError {
  return new AppError(status, message, details);
}

/** Transient upstream failure: tell the buyer to wait and that the cart is safe. */
export function paypalBusyError(
  paypalIssue: string,
  message = 'PayPal is busy right now. Please wait about 30 seconds and try again.',
  waitSeconds = 30
): AppError {
  return checkoutRescueError(502, message, {
    code: 'PAYPAL_BUSY',
    paypalIssue,
    retryable: true,
    retryAfterSeconds: waitSeconds,
    suggestion: `Wait about ${waitSeconds} seconds, then retry. Your cart is saved.`,
    alternativePayment: 'You can also try a card or another payment method.',
    cartSaved: true,
  });
}

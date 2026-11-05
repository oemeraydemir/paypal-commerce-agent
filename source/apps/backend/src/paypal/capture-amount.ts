// Amount / currency binding for a PayPal capture — defence in depth.
//
// The order total and the currency are server-owned (authoritative pricing in
// src/routes/orders.ts), so a client can never ask PayPal for a different
// amount. This module closes the remaining gap: it checks the amount PayPal
// *actually captured* against the order the money is supposed to belong to.
//
// Three independent paths end in "the order is PAID", and every one of them goes
// through validateCompletedCapture() before goods are released:
//   1. the synchronous capture response      (src/routes/orders.ts)
//   2. the PayPal order lookup / settlement  (src/orders/payment-lifecycle.ts)
//   3. a signed PAYMENT.CAPTURE.COMPLETED webhook (src/routes/webhooks.ts)
//
// Rules: integer minor units (never floats); the evidence is the CAPTURE's own amount, never the
// purchase unit's order amount (that is only the intent and always equals the total); a missing or
// unparseable value means "cannot be verified", which is NOT the same as "matches".

import type { Order } from '../orders/domain';

/** The `amount` object of a PayPal capture (camelCase SDK result or raw JSON). */
export interface CapturedAmount {
  value?: unknown;
  currency_code?: unknown;
}

/**
 * Returns the ONE capture resource in a payload, or undefined when it is absent or ambiguous.
 * A webhook carries the capture itself as `resource`; an order / capture response carries it at
 * purchase_units[0].payments.captures[0]. This merchant creates one purchase unit and expects one
 * capture, so any other shape is not guessed at.
 */
export function extractCaptureResource(paypalResult: any): any | undefined {
  if (paypalResult?.amount && typeof paypalResult.amount === 'object') return paypalResult;
  const units = paypalResult?.purchaseUnits ?? paypalResult?.purchase_units;
  if (!Array.isArray(units) || units.length !== 1) return undefined;
  const captures = units[0]?.payments?.captures;
  if (!Array.isArray(captures) || captures.length !== 1) return undefined;
  return captures[0];
}

/** Extracts only the actual capture's amount, never the purchase-unit intent. */
export function extractCapturedAmount(paypalResult: any): CapturedAmount | undefined {
  const amount = extractCaptureResource(paypalResult)?.amount;
  if (!amount || typeof amount !== 'object') return undefined;
  return { value: amount.value, currency_code: amount.currency_code ?? amount.currencyCode };
}

/**
 * Integer comparison of a PayPal decimal amount against a total in minor units.
 * Returns false when the value cannot be parsed, is negative, or the currency differs.
 * Decimal text is parsed without floating point; extra fractional digits are accepted only when
 * they are zero (13.000), never when they would change the minor-unit amount (13.001).
 */
export function amountMatches(
  totalMinor: number,
  reportedValue: unknown,
  expectedCurrency: string,
  reportedCurrency: unknown
): boolean {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) return false;
  if (typeof reportedCurrency !== 'string' || reportedCurrency !== expectedCurrency) return false;
  if (typeof reportedValue !== 'string' && typeof reportedValue !== 'number') return false;
  const raw = typeof reportedValue === 'string' ? reportedValue.trim() : String(reportedValue);
  const parts = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!parts) return false;
  const fractional = parts[2] ?? '';
  if (fractional.length > 2 && /[1-9]/.test(fractional.slice(2))) return false;
  const minor = Number(parts[1]) * 100 + Number((fractional + '00').slice(0, 2));
  return Number.isSafeInteger(minor) && minor === totalMinor;
}

export type CapturedAmountVerdict =
  | 'match' // verified equal
  | 'mismatch' // verified different: hold for review
  | 'unknown'; // no usable evidence: cannot verify either way (also held)

/**
 * Compares what PayPal captured against the server-owned order.
 * 'unknown' means the payload carried no capture amount/currency, so nothing could be checked.
 */
export function checkCapturedAmount(order: Order, paypalResult: any): CapturedAmountVerdict {
  const captured = extractCapturedAmount(paypalResult);
  if (!captured || captured.value === undefined || captured.currency_code === undefined) {
    return 'unknown';
  }
  return amountMatches(order.totalMinor, captured.value, order.currency, captured.currency_code)
    ? 'match'
    : 'mismatch';
}

export interface SettlementGateOptions {
  /**
   * A PayPal order LOOKUP of an already-refunded payment still shows the original capture (status
   * REFUNDED / PARTIALLY_REFUNDED) with its original amount. Only lookups may accept that; a fresh
   * capture response and a PAYMENT.CAPTURE.COMPLETED webhook must say COMPLETED.
   */
  allowRefunded?: boolean;
}

/**
 * The single settlement gate shared by the capture response, the PayPal order lookup and the signed
 * webhook. Only one unambiguous capture that is COMPLETED, with a complete amount and currency
 * exactly equal to the server-owned order, yields 'match' (the only verdict that may mark PAID).
 */
export function validateCompletedCapture(
  order: Order,
  paypalResult: any,
  options: SettlementGateOptions = {}
): CapturedAmountVerdict {
  const capture = extractCaptureResource(paypalResult);
  if (!capture) return 'unknown';
  const status = capture.status;
  const okStatus =
    status === 'COMPLETED' ||
    (options.allowRefunded === true && (status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED'));
  if (!okStatus) return 'unknown';
  return checkCapturedAmount(order, capture);
}

/** Human-readable rendering of a captured amount, safe to log (no credentials). */
export function describeCapturedAmount(captured: CapturedAmount | undefined): string {
  if (!captured) return 'no amount in capture';
  return `${String(captured.value)} ${String(captured.currency_code)}`;
}

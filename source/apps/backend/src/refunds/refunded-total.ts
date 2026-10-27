import { paypalClient } from '../paypal/client';

/**
 * How much of a capture has already been refunded at PayPal, in minor units — or null when PayPal's
 * answers do not establish it (callers must then NOT send another refund).
 *
 * The PayPal v2 GET capture response has no "total refunded" field of its own (the old code read
 * seller_payable_breakdown.total_refunded_amount, which only the refund-creation response carries).
 * What the API does give us, in order of preference:
 *   1. a total_refunded_amount, if a response carries one (kept for that shape);
 *   2. the capture status: COMPLETED = never refunded (0), REFUNDED = fully refunded (capture amount);
 *   3. the order's payments.refunds[] list (PARTIALLY_REFUNDED), summed.
 */

type Money = { currencyCode?: string; currency_code?: string; value?: string } | undefined;

const toMinor = (m: Money, currency: string): number | null => {
  const code = m?.currencyCode ?? m?.currency_code;
  if (!m || m.value === undefined || code !== currency) return null;
  const n = Math.round(parseFloat(m.value) * 100);
  return Number.isFinite(n) ? n : null;
};

export function refundedMinorFromCapture(capture: any, currency: string): number | null {
  const legacy = toMinor(
    capture?.sellerPayableBreakdown?.totalRefundedAmount ?? capture?.seller_payable_breakdown?.total_refunded_amount,
    currency
  );
  if (legacy !== null) return legacy;

  const status = String(capture?.status ?? '').toUpperCase();
  if (status === 'COMPLETED') return 0;
  if (status === 'REFUNDED') return toMinor(capture?.amount, currency);
  return null;
}

export function refundedMinorFromOrder(order: any, currency: string): number | null {
  const units: any[] = order?.purchaseUnits ?? order?.purchase_units ?? [];
  if (!Array.isArray(units) || units.length === 0) return null;
  let sum = 0;
  let sawPayments = false;
  for (const unit of units) {
    const payments = unit?.payments;
    if (!payments) continue;
    sawPayments = true;
    for (const refund of payments.refunds ?? []) {
      const status = String(refund?.status ?? '').toUpperCase();
      if (status !== 'COMPLETED' && status !== 'PENDING') continue; // FAILED/CANCELLED moved no money
      const minor = toMinor(refund.amount, currency);
      if (minor === null) return null; // a refund we cannot read means we cannot be sure
      sum += minor;
    }
  }
  return sawPayments ? sum : null;
}

export async function resolveRefundedMinor(
  capture: any,
  currency: string,
  paypalOrderId: string | undefined
): Promise<number | null> {
  const fromCapture = refundedMinorFromCapture(capture, currency);
  if (fromCapture !== null) return fromCapture;
  if (!paypalOrderId) return null;
  try {
    return refundedMinorFromOrder(await paypalClient.getOrder(paypalOrderId), currency);
  } catch {
    return null;
  }
}

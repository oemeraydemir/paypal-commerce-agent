// Faz 5: what happens to PAID shares when a bill's payment deadline passes.
//
// Principles (they follow from the legal/consumer checklist and the existing refund pipeline):
//   - Closing a bill NEVER moves money. This module only creates PROPOSED refunds; a person at the
//     cafe approves or rejects each one (/api/refunds/:id/approve|reject). Rejecting = "keep this
//     share's order running", so the cafe decides based on what it has already prepared.
//   - Only shares that are really captured at PayPal (order PAID/ORDER_CONFIRMED + capture id) are
//     candidates. PAYMENT_PENDING / unknown PayPal outcomes are never refund candidates.
//   - One refund decision per share order: if ANY refund record already exists for the order
//     (open, refunded or rejected) nothing new is proposed. RefundService.propose additionally
//     refuses a second open refund and caps the amount at what is still refundable.
//   - A bill that ended up fully paid (e.g. a late capture) is not refunded.
//   - Each share is its own order/capture, so one participant's refund never touches the others.

import { OrderStatus } from '../orders/domain';
import { OrderService } from '../orders/service';
import { RefundError, refundService } from '../refunds/service';
import { BillCloseReason, BillGroup, BillStatus } from './domain';
import { BillService, deriveBillStatus } from './service';

export type ExpiryRefundOutcome =
  | 'PROPOSED'
  | 'SKIPPED_NOT_PAID'
  | 'SKIPPED_NOT_CAPTURED'
  | 'SKIPPED_ALREADY_HANDLED'
  | 'FAILED';

export interface ExpiryRefundResult {
  shareId: string;
  orderId: string;
  outcome: ExpiryRefundOutcome;
  refundId?: string;
  detail?: string;
}

export async function proposeRefundsForExpiredBill(group: BillGroup): Promise<ExpiryRefundResult[]> {
  if (group.closeReason !== BillCloseReason.DEADLINE_EXPIRED) return [];
  const billService = BillService.getInstance();
  // Everyone paid after all (late capture): nothing to refund.
  if (deriveBillStatus(billService.effectiveShares(group)) === BillStatus.SETTLED) return [];

  const orders = OrderService.getInstance();
  const results: ExpiryRefundResult[] = [];

  for (const share of group.shares) {
    if (!share.orderId) continue; // never started paying: nothing was charged
    const order = orders.getById(share.orderId);
    if (!order) continue;
    const base = { shareId: share.id, orderId: order.id };

    const paid = order.status === OrderStatus.PAID || order.status === OrderStatus.ORDER_CONFIRMED;
    if (!paid) {
      // PAYMENT_PENDING, failed, cancelled: unclear or no money. Never an automatic candidate.
      results.push({ ...base, outcome: 'SKIPPED_NOT_PAID', detail: `order is ${order.status}` });
      continue;
    }
    if (!order.paypalCaptureId) {
      results.push({ ...base, outcome: 'SKIPPED_NOT_CAPTURED' });
      continue;
    }
    if (refundService.listForOrder(order.id).length > 0) {
      results.push({ ...base, outcome: 'SKIPPED_ALREADY_HANDLED' });
      continue;
    }

    try {
      const record = refundService.propose({
        orderId: order.id,
        reason: `Bill ${group.id} payment deadline expired`,
        proposedBy: 'SYSTEM',
      });
      try {
        await refundService.saveNow(record.id); // acknowledge only what is stored
      } catch {
        refundService.discard(record.id); // moved no money; the next sweep retries
        results.push({ ...base, outcome: 'FAILED', detail: 'storage unavailable' });
        continue;
      }
      results.push({ ...base, outcome: 'PROPOSED', refundId: record.id });
    } catch (err) {
      if (err instanceof RefundError && err.status === 409) {
        results.push({ ...base, outcome: 'SKIPPED_ALREADY_HANDLED', detail: err.message });
      } else {
        results.push({ ...base, outcome: 'FAILED', detail: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return results;
}

/** Closes every overdue bill (records why) and proposes refunds for their paid shares. Idempotent. */
export async function processExpiredBills(now: Date = new Date()): Promise<number> {
  const billService = BillService.getInstance();
  let proposed = 0;
  for (const group of billService.list()) {
    billService.closeIfExpired(group, now);
    if (group.closeReason === BillCloseReason.DEADLINE_EXPIRED) {
      const results = await proposeRefundsForExpiredBill(group);
      proposed += results.filter((r) => r.outcome === 'PROPOSED').length;
    }
  }
  return proposed;
}

export function startBillExpirySweeper(intervalMs = 60_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    processExpiredBills().catch((err) => console.error(`BILL_EXPIRY_SWEEP_FAILED error=${err?.message ?? err}`));
  }, intervalMs);
  timer.unref();
  return timer;
}

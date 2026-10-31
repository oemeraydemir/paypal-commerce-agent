import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { AppError } from '../middleware/error-handler';
import { SlidingWindowLimiter } from '../middleware/rate-limit';
import { OrderService } from '../orders/service';
import { RefundError, RefundRequestRecord, RefundStatus, refundService } from '../refunds/service';

// Customer-side refund REQUESTS. A shopper can ask for a refund of their own order (or, for a
// split bill, their own share's order) and watch its status. Requesting moves no money: it
// creates a PROPOSED refund that only an authenticated merchant approval can act on.
const router = Router();
const orderService = OrderService.getInstance();
const limiter = new SlidingWindowLimiter(10, 60_000);

export function resetRefundRequestRouteState(): void {
  limiter.reset();
}

export const CUSTOMER_REASONS = ['wrong_item', 'not_as_described', 'duplicate_charge', 'changed_mind', 'other'] as const;
type CustomerReason = (typeof CUSTOMER_REASONS)[number];

type CustomerStatus = 'UNDER_REVIEW' | 'BEING_PROCESSED' | 'REFUNDED' | 'DECLINED';
const STATUS_MAP: Record<RefundStatus, CustomerStatus> = {
  PROPOSED: 'UNDER_REVIEW',
  PROCESSING: 'BEING_PROCESSED',
  REFUNDED: 'REFUNDED',
  REJECTED: 'DECLINED',
};

// Customer-safe view: no internal errors, no PayPal ids, no proposer internals.
function view(r: RefundRequestRecord) {
  return {
    id: r.id,
    status: STATUS_MAP[r.status],
    amountMinor: r.amountMinor,
    currency: r.currency,
    requestedAt: r.createdAt,
    decidedAt: r.decidedAt ?? null,
  };
}

function ownOrder(orderId: string, sessionId: string) {
  const order = orderService.getById(orderId);
  // Another session's order is indistinguishable from a missing one.
  if (!order || order.sessionId !== sessionId) throw new AppError(404, 'Order not found');
  return order;
}

router.post('/orders/:orderId/refund-request', requireSession, async (req, res, next) => {
  try {
    const { sessionId } = req.session!;
    const verdict = limiter.hit(sessionId);
    if (!verdict.allowed) throw new AppError(429, 'Too many refund requests; try again shortly.');
    const order = ownOrder(req.params.orderId, sessionId);

    const code = req.body?.reason;
    if (typeof code !== 'string' || !(CUSTOMER_REASONS as readonly string[]).includes(code)) {
      throw new AppError(400, `reason must be one of: ${CUSTOMER_REASONS.join(', ')}`);
    }
    const noteRaw = req.body?.note;
    if (noteRaw !== undefined && typeof noteRaw !== 'string') throw new AppError(400, 'note must be text');
    const note = (noteRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const reason = `Customer (${code as CustomerReason})${note ? ': ' + note : ''}`;

    let amountMinor: number | undefined;
    if (req.body?.amountMinor !== undefined) {
      amountMinor = Number(req.body.amountMinor);
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new AppError(400, 'amountMinor must be a positive integer.');
    }
    let record: RefundRequestRecord;
    try {
      record = refundService.propose({ orderId: order.id, amountMinor, reason, proposedBy: 'CUSTOMER' });
    } catch (err) {
      throw err instanceof RefundError ? new AppError(err.status, err.message) : err;
    }
    // Acknowledge only what is stored.
    try {
      await refundService.saveNow(record.id);
    } catch {
      refundService.discard(record.id);
      throw new AppError(503, 'Storage unavailable; your request was not saved. Please retry.');
    }
    res.status(201).json(view(record));
  } catch (err) {
    next(err);
  }
});

router.get('/orders/:orderId/refund-status', requireSession, (req, res, next) => {
  try {
    const order = ownOrder(req.params.orderId, req.session!.sessionId);
    res.set('Cache-Control', 'no-store');
    res.json({
      orderId: order.id,
      refundableMinor: Math.max(0, order.totalMinor - refundService.refundedMinor(order.id)),
      currency: order.currency,
      refunds: refundService.listForOrder(order.id).map(view),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

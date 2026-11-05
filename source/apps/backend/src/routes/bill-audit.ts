import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { AppError } from '../middleware/error-handler';
import { OrderService } from '../orders/service';
import { refundService } from '../refunds/service';
import { BillService } from '../bills/service';

// Faz 5: audit view of one bill for its participants. Shows why/when the bill closed, every
// share's payment state and the refund trail (proposal -> cafe decision -> PayPal result).
// Privacy: refund reasons are shown only to the share's own participant. Others (including the
// bill owner) see only status and amount of someone else's refund.
const router = Router();
const billService = BillService.getInstance();
const orderService = OrderService.getInstance();

router.get('/bills/:id/audit', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const group = billService.getById(req.params.id);
    if (!group || !billService.isParticipant(group, userId)) throw new AppError(404, 'Bill not found');
    billService.closeIfExpired(group);

    const shares = billService.effectiveShares(group).map((s) => {
      const mine = s.participantUserId === userId;
      const order = s.orderId ? orderService.getById(s.orderId) : undefined;
      const refunds = s.orderId ? refundService.listForOrder(s.orderId) : [];
      return {
        id: s.id,
        mine,
        status: s.status,
        amountMinor: s.amountMinor,
        ...(order ? { orderStatus: order.status, captured: Boolean(order.paypalCaptureId) } : {}),
        refunds: refunds.map((r) => ({
          id: r.id,
          status: r.status,
          amountMinor: r.amountMinor,
          createdAt: r.createdAt,
          ...(r.decidedAt ? { decidedAt: r.decidedAt } : {}),
          ...(mine
            ? { proposedBy: r.proposedBy, reason: r.reason, paypalRefundStatus: r.paypalRefundStatus }
            : {}),
        })),
      };
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      billId: group.id,
      status: group.status,
      createdAt: group.createdAt.toISOString(),
      ...(group.expiresAt ? { expiresAt: group.expiresAt.toISOString() } : {}),
      ...(group.closedAt ? { closedAt: group.closedAt.toISOString() } : {}),
      ...(group.closeReason ? { closeReason: group.closeReason } : {}),
      shares,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { OrderService } from '../orders/service';
import { AppError } from '../middleware/error-handler';
import { buildEvidencePackage, verifyEvidencePackage } from '../evidence/service';

const router = Router();
const orderService = OrderService.getInstance();

// Stage 3: Dispute Evidence Package. The shopper fetches THEIR OWN order's
// evidence; an auditor can verify any package without a session.
router.get('/orders/:orderId/evidence', requireSession, (req, res, next) => {
  try {
    const order = orderService.getById(req.params.orderId);
    // Another session's order is indistinguishable from a missing one.
    if (!order || order.sessionId !== req.session!.sessionId) {
      throw new AppError(404, 'Order not found');
    }
    const pkg = buildEvidencePackage(order.id);
    if (!pkg) throw new AppError(404, 'Order not found');
    res.set('Cache-Control', 'no-store');
    res.json(pkg);
  } catch (err) {
    next(err);
  }
});

// Anyone can verify a package; it is self-contained and signed.
router.post('/evidence/verify', (req, res, next) => {
  try {
    res.json(verifyEvidencePackage(req.body ?? {}));
  } catch (err) {
    next(err);
  }
});

export default router;

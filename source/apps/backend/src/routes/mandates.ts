import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { OrderService } from '../orders/service';
import { AppError } from '../middleware/error-handler';
import { MandateConfigError, publicKeyDocument, signCartMandate, verifyCartMandate } from '../mandate/mandate-service';

const router = Router();
const orderService = OrderService.getInstance();

function mapConfigError(err: unknown): unknown {
  return err instanceof MandateConfigError ? new AppError(503, 'Cart Mandate signing is misconfigured') : err;
}

// The shopper's own signed record of what was proposed and who held payment authority.
router.get('/orders/:orderId/mandate', requireSession, (req, res, next) => {
  try {
    const order = orderService.getById(req.params.orderId);
    // Another session's order is indistinguishable from a missing one.
    if (!order || order.sessionId !== req.session!.sessionId) {
      throw new AppError(404, 'Order not found');
    }
    res.json(signCartMandate(order));
  } catch (err) {
    next(mapConfigError(err));
  }
});

// Anyone (a merchant, an auditor, another agent) can check a mandate: it needs no session.
router.post('/mandates/verify', (req, res, next) => {
  try {
    res.json(verifyCartMandate(req.body ?? {}, (id) => orderService.getById(id)));
  } catch (err) {
    next(mapConfigError(err));
  }
});

// Public keys (active + previous). Private material is never exposed.
export const wellKnownMandateKeys = Router();
wellKnownMandateKeys.get('/.well-known/mandate-keys.json', (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(publicKeyDocument());
  } catch (err) {
    next(mapConfigError(err));
  }
});

export default router;

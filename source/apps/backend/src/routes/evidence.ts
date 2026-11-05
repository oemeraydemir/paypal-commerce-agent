import type { RequestHandler } from 'express';
import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { keyMatches } from '../middleware/merchant-key';
import { OrderService } from '../orders/service';
import { AppError } from '../middleware/error-handler';
import { ipRateLimit } from '../middleware/rate-limit';
import { buildEvidencePackage, verifyEvidencePackage } from '../evidence/service';

const router = Router();
const orderService = OrderService.getInstance();

// Stage 3: Dispute Evidence Package. The shopper fetches THEIR OWN order's
// evidence; an auditor can verify any package without a session.
const shopperEvidence: RequestHandler = (req, res, next) => {
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
};

// Anyone can verify a package; it is self-contained and signed.
router.post('/evidence/verify', ipRateLimit(60), (req, res, next) => {
  try {
    res.json(verifyEvidencePackage(req.body ?? {}));
  } catch (err) {
    next(err);
  }
});

// Merchant view: evidence for any order (requires the ops key). The merchant is
// the counterparty in a dispute, so it may read the full signed package.
const merchantEvidence: RequestHandler = (req, res, next) => {
  try {
    const order = orderService.getById(req.params.orderId);
    if (!order) throw new AppError(404, 'Order not found');
    const pkg = buildEvidencePackage(order.id);
    if (!pkg) throw new AppError(404, 'Order not found');
    res.set('Cache-Control', 'no-store');
    res.json(pkg);
  } catch (err) {
    next(err);
  }
};

// One route, two audiences: the owning shopper (session) or the merchant (ops key). Registering the same
// path twice made the merchant handler unreachable, because a failed requireSession ends the request.
router.get('/orders/:orderId/evidence', (req, res, next) => {
  requireSession(req, res, (sessionErr?: unknown) => {
    if (!sessionErr) return shopperEvidence(req, res, next);
    // Merchant access ALWAYS needs the ops key, even when DASHBOARD_PUBLIC=true: a full signed evidence
    // package is not part of the minimised public demo view.
    const expected = process.env.OPS_COPILOT_KEY;
    if (expected && expected.length >= 16 && keyMatches(req.get('x-ops-key'), expected)) return merchantEvidence(req, res, next);
    next(sessionErr);
  });
});

// Human-readable text export of the dispute defense (shopper-authorized).
router.get('/orders/:orderId/evidence/export', requireSession, (req, res, next) => {
  try {
    const order = orderService.getById(req.params.orderId);
    if (!order || order.sessionId !== req.session!.sessionId) {
      throw new AppError(404, 'Order not found');
    }
    const pkg = buildEvidencePackage(order.id);
    if (!pkg) throw new AppError(404, 'Order not found');
    const lines = [
      pkg.disputeDefense.narrative,
      '',
      'Evidence provenance:',
      ...pkg.evidenceItems.map((it) => `- [${it.source === 'record' ? 'verified record' : 'AI narrative'}] ${it.label}: ${it.detail}`),
      '',
      `Package version: ${pkg.version}`,
      `Sha-256 digest: ${pkg.integrity.digest}`,
      `Signature kid: ${pkg.integrity.kid}`,
    ];
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

export default router;

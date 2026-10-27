import { Router, Request } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { AppError } from '../middleware/error-handler';
import { SlidingWindowLimiter } from '../middleware/rate-limit';
import { env } from '../config/environment';
import { RefundError, refundService } from '../refunds/service';

// Merchant refund queue. Every route needs the merchant key (the same OPS_COPILOT_KEY the dashboard's
// Ops Copilot uses; 16+ chars). Approving is the ONLY code path that calls PayPal's refund API.
const router = Router();
const limiter = new SlidingWindowLimiter(30, 60_000);

export function resetRefundRouteState(): void {
  limiter.reset();
}

function keyMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function authorize(req: Request): void {
  const expected = process.env.OPS_COPILOT_KEY;
  if (!expected || expected.length < 16) {
    throw new AppError(503, 'Refund queue is disabled: set OPS_COPILOT_KEY (16+ characters).');
  }
  const verdict = limiter.hit(req.ip ?? 'unknown'); // counted before auth so key guessing is throttled
  if (!verdict.allowed) throw new AppError(429, 'Too many refund requests; try again shortly.');
  if (!keyMatches(req.get('x-ops-key'), expected)) throw new AppError(401, 'A valid X-Ops-Key header is required.');
}

function translate(err: unknown): unknown {
  return err instanceof RefundError ? new AppError(err.status, err.message) : err;
}

router.get('/refunds', (req, res, next) => {
  try {
    authorize(req);
    res.json({ sandbox: true, paypalEnabled: env.isPayPalEnabled(), refunds: refundService.list() });
  } catch (err) {
    next(translate(err));
  }
});

router.post('/refunds/propose', async (req, res, next) => {
  try {
    authorize(req);
    const { orderId, amountMinor, reason } = req.body ?? {};
    if (typeof orderId !== 'string' || !orderId) throw new AppError(400, 'orderId is required.');
    const record = refundService.propose({
      orderId,
      amountMinor: amountMinor === undefined ? undefined : Number(amountMinor),
      reason: typeof reason === 'string' ? reason : '',
      proposedBy: 'MERCHANT',
    });
    // Acknowledge only what is stored; an unstored proposal is withdrawn (it moved no money).
    try {
      await refundService.saveNow(record.id);
    } catch {
      refundService.discard(record.id);
      throw new AppError(503, 'Storage unavailable; the refund proposal was not saved. Please retry.');
    }
    res.status(201).json(record);
  } catch (err) {
    next(translate(err));
  }
});

router.post('/refunds/:id/approve', async (req, res, next) => {
  try {
    authorize(req);
    if (!env.isPayPalEnabled()) throw new AppError(503, 'PayPal sandbox is not configured.');
    const record = await refundService.approve(req.params.id);
    res.status(record.status === 'REFUNDED' ? 200 : record.status === 'PROCESSING' ? 202 : 502).json(record);
  } catch (err) {
    next(translate(err));
  }
});

router.post('/refunds/:id/reject', async (req, res, next) => {
  try {
    authorize(req);
    const rejected = await refundService.reject(req.params.id);
    res.json(rejected);
  } catch (err) {
    next(translate(err));
  }
});

export default router;

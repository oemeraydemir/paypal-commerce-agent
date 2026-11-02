import { Router, Request } from 'express';
import { AppError } from '../middleware/error-handler';
import { env } from '../config/environment';
import { authorizeRefundMerchant } from './refunds';
import { DisputeError, disputeService } from '../disputes/service';
import { DisputeCaseRow } from '../persistence/types';

const router = Router();
const translate = (err: unknown) => err instanceof DisputeError ? new AppError(err.status, err.message) : err;
const authorize = (req: Request) => authorizeRefundMerchant(req);
const view = (row: DisputeCaseRow) => ({
  id: row.id, orderId: row.orderId, paypalDisputeId: row.paypalDisputeId, status: row.status,
  paypalStatus: row.paypalStatus, lifecycleStage: row.lifecycleStage, requestedEvidenceType: row.requestedEvidenceType,
  sellerResponseDueAt: row.sellerResponseDueAt, evidenceType: row.evidenceType, evidenceDigest: row.evidenceDigest,
  createdAt: row.createdAt, updatedAt: row.updatedAt, submittedAt: row.submittedAt, resolvedAt: row.resolvedAt,
});

router.get('/disputes', async (req, res, next) => {
  try { authorize(req); res.set('Cache-Control', 'no-store'); res.json({ disputes: disputeService.list().map(view) }); }
  catch (err) { next(translate(err)); }
});

router.post('/disputes', async (req, res, next) => {
  try {
    authorize(req);
    if (!env.isPayPalEnabled()) throw new AppError(503, 'PayPal is not configured.');
    const { orderId, paypalDisputeId } = req.body ?? {};
    if (typeof orderId !== 'string' || typeof paypalDisputeId !== 'string') throw new AppError(400, 'orderId and paypalDisputeId are required.');
    res.status(201).json(view(await disputeService.create(orderId, paypalDisputeId, 'MERCHANT_API')));
  } catch (err) { next(translate(err)); }
});

router.post('/disputes/:id/refresh', async (req, res, next) => {
  try {
    authorize(req);
    if (!env.isPayPalEnabled()) throw new AppError(503, 'PayPal is not configured.');
    res.json(view(await disputeService.refresh(req.params.id, 'MERCHANT_API')));
  } catch (err) { next(translate(err)); }
});

router.post('/disputes/:id/evidence/prepare', async (req, res, next) => {
  try { authorize(req); res.json(view(await disputeService.prepare(req.params.id, 'MERCHANT_API'))); }
  catch (err) { next(translate(err)); }
});

router.post('/disputes/:id/evidence/submit', async (req, res, next) => {
  try {
    authorize(req);
    if (!env.isPayPalEnabled()) throw new AppError(503, 'PayPal is not configured.');
    const { evidenceType, notes } = req.body ?? {};
    if (typeof evidenceType !== 'string' || (notes !== undefined && typeof notes !== 'string')) throw new AppError(400, 'evidenceType and optional notes are required.');
    res.json(view(await disputeService.submit(req.params.id, { evidenceType, notes }, 'MERCHANT_API')));
  } catch (err) { next(translate(err)); }
});

router.get('/disputes/:id/evidence/export', async (req, res, next) => {
  try {
    authorize(req);
    res.set('Cache-Control', 'no-store');
    res.json(await disputeService.exportEvidence(req.params.id));
  } catch (err) { next(translate(err)); }
});

export default router;

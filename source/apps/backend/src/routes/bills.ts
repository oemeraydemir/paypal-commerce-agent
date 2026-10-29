// Split Bill routes — P1 (read-only group).
//
// P1 only creates a bill from a server-priced cart, mints/verifies signed invite
// tokens, joins, and reads group state/progress. There is deliberately NO
// payment, capture, or settlement endpoint here: nothing in this module can move
// money (that lands in P2, which reuses the existing order/capture pipeline per
// share).
//
// Authorization mirrors the app's "another session's order is a 404" rule:
// - invite requires the OWNER session;
// - read requires a bound participant or the owner;
// - a non-participant/non-owner sees 404 (indistinguishable from missing).

import { Router } from 'express';
import { createHash } from 'crypto';
import { requireSession } from '../middleware/session-auth';
import { AppError } from '../middleware/error-handler';
import { currentBusiness } from '../config/business-config';
import { validateOrderItems } from '../orders/validation';
import { CatalogService } from '../catalog/service';
import { BillService } from '../bills/service';
import { deriveBillProgress, deriveBillStatus } from '../bills/service';
import { formatMoney } from '../utils/money';
import {
  BillGroup,
  BillShare,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
} from '../bills/domain';

const router = Router();
const billService = BillService.getInstance();
const catalogService = new CatalogService();

function participantHash(userId: string): string {
  return createHash('sha256').update(`bill-participant:${userId}`).digest('hex').slice(0, 12);
}

function serializeShare(share: BillShare, currency: string, locale: string) {
  return {
    id: share.id,
    status: share.status,
    participantBound: Boolean(share.participantUserId),
    // Masked so participants never expose each other's raw user ids.
    ...(share.participantUserId ? { participantHash: participantHash(share.participantUserId) } : {}),
    amountMinor: share.amountMinor,
    amountFormatted: formatMoney(share.amountMinor, currency, locale),
    ...(share.paidAt ? { paidAt: share.paidAt.toISOString() } : {}),
  };
}

function serializeGroup(group: BillGroup) {
  const locale = currentBusiness.locale;
  return {
    id: group.id,
    status: deriveBillStatus(group.shares),
    strategy: group.strategy,
    merchantId: group.merchantId,
    currency: group.currency,
    totalMinor: group.totalMinor,
    totalFormatted: formatMoney(group.totalMinor, group.currency, locale),
    items: group.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor,
      lineTotalMinor: i.lineTotalMinor,
    })),
    shares: group.shares.map((s) => serializeShare(s, group.currency, locale)),
    progress: deriveBillProgress(group.shares),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

// Create a group from a server-priced cart. `participantCount` includes the owner.
router.post('/bills', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const { items, participantCount } = req.body ?? {};
    const validated = validateOrderItems(items, catalogService); // throws AppError 400
    if (
      !Number.isInteger(participantCount) ||
      participantCount < MIN_PARTICIPANTS ||
      participantCount > MAX_PARTICIPANTS
    ) {
      throw new AppError(
        400,
        `participantCount must be an integer between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}`
      );
    }
    const group = billService.createGroup({
      createdByUserId: userId,
      items: validated,
      participantCount,
      currency: currentBusiness.currency,
      merchantId: currentBusiness.businessId,
    });
    res.status(201).json(serializeGroup(group));
  } catch (err) {
    next(err);
  }
});

// Mint a signed, single-use invite token (owner only).
router.post('/bills/:id/invite', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const group = billService.getById(req.params.id);
    // Non-owner is indistinguishable from a missing bill.
    if (!group || group.createdByUserId !== userId) {
      throw new AppError(404, 'Bill not found');
    }
    const { token, ttlSeconds } = billService.mintInvite(group.id);
    res.json({ token, ttlSeconds, joinUrl: `/join#t=${encodeURIComponent(token)}` });
  } catch (err) {
    next(err);
  }
});

// Join via a signed invite token; binds the caller to the next open share.
router.post('/bills/join', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const token = req.body?.token;
    if (typeof token !== 'string' || !token) {
      throw new AppError(400, 'token is required');
    }
    const { group, shareId } = billService.joinWithToken(token, userId);
    res.json({ shareId, bill: serializeGroup(group) });
  } catch (err) {
    next(err);
  }
});

// Read group state + progress (owner or a bound participant only).
router.get('/bills/:id', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const group = billService.getById(req.params.id);
    if (!group || !billService.isParticipant(group, userId)) {
      throw new AppError(404, 'Bill not found');
    }
    res.json(serializeGroup(group));
  } catch (err) {
    next(err);
  }
});

export default router;

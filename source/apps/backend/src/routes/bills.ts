// Split Bill routes — P1 (read-only group) + P2 (per-share payment).
//
// P1: create a bill from a server-priced cart, mint/verify signed invite
// tokens, join, and read group state/progress.
//
// P2: each share is paid as a NORMAL PayPal order owned by that participant's
// session, using the exact same order/capture pipeline as `/orders/create`.
// This route only CREATES the share's order and starts the PayPal checkout; the
// capture itself reuses the existing, already-audited `POST /orders/:orderId/capture`
// route (locks, reconciliation, webhooks, reservations all apply unchanged). A
// share's effective status is derived from its underlying order, so once a
// capture completes the bill reflects it automatically.
//
// Authorization is server-side only (requireSession userId); IDs from request
// bodies never grant identity. Non-owner / non-participant is indistinguishable
// from a missing bill (404).

import { Router } from 'express';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { requireSession } from '../middleware/session-auth';
import { AppError } from '../middleware/error-handler';
import { currentBusiness } from '../config/business-config';
import { env } from '../config/environment';
import { paypalClient } from '../paypal/client';
import { validateOrderItems } from '../orders/validation';
import { CatalogService } from '../catalog/service';
import { OrderService } from '../orders/service';
import { OrderOrigin, OrderStatus } from '../orders/domain';
import { BillService, deriveBillProgress, deriveBillStatus } from '../bills/service';
import { buildEvidencePackage } from '../evidence/service';
import { formatMoney } from '../utils/money';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import { policyService } from '../policy/service';
import { policyStorage } from '../policy/storage';
import { getRepos } from '../persistence/registry';
import { buildEvaluationOrder, buildPolicyContext, buildPolicyOutcome } from '../policy/context-builder';
import {
  BillGroup,
  BillShare,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  ShareStatus,
} from '../bills/domain';

const router = Router();
const billService = BillService.getInstance();
const catalogService = new CatalogService();
const orderService = OrderService.getInstance();

function participantHash(userId: string): string {
  return createHash('sha256').update(`bill-participant:${userId}`).digest('hex').slice(0, 12);
}

/** Rolls a share's order back to a non-payable state and releases its reservation. */
function abandonOrder(orderId: string, reservationId?: string): void {
  if (reservationId) dailySpendTracker.cancelReservation(reservationId);
  orderService.updateStatus(orderId, OrderStatus.ORDER_CANCELLED);
}

/** P2: create the PayPal order for a share and durably record it before returning the approve link. */
async function startSharePayPalCheckout(
  order: ReturnType<OrderService['create']>,
  reservationId: string | undefined,
  idempotencyKey: string
): Promise<any> {
  const totalValue = (order.totalMinor / 100).toFixed(2);
  let paypalOrder;
  try {
    paypalOrder = await paypalClient.createOrder(
      {
        intent: 'CAPTURE',
        purchaseUnits: [
          {
            referenceId: order.id,
            description: `${currentBusiness.name} Split Bill share`,
            amount: {
              currencyCode: order.currency,
              value: totalValue,
              breakdown: { itemTotal: { currencyCode: order.currency, value: totalValue } },
            },
            items: order.items.map((item) => ({
              name: item.name,
              quantity: String(item.quantity),
              unitAmount: {
                currencyCode: order.currency,
                value: (item.unitPriceMinor / 100).toFixed(2),
              },
              category: 'PHYSICAL_GOODS',
            })),
          },
        ],
        applicationContext: {
          brandName: currentBusiness.name,
          landingPage: 'NO_PREFERENCE',
          userAction: 'PAY_NOW',
          returnUrl: env.paypal!.PAYPAL_RETURN_URL,
          cancelUrl: env.paypal!.PAYPAL_CANCEL_URL,
        },
      },
      idempotencyKey
    );
  } catch (err: any) {
    abandonOrder(order.id, reservationId);
    const upstreamStatus = (err as any)?.statusCode;
    if (!(err instanceof AppError) && typeof upstreamStatus === 'number' && (upstreamStatus === 401 || upstreamStatus === 403)) {
      throw new AppError(502, 'PayPal rejected the merchant credentials.', { code: 'PAYPAL_UPSTREAM_ERROR', upstreamStatus });
    }
    throw new AppError(502, 'PayPal could not be reached. Your share is saved; please retry shortly.', {
      code: 'PAYPAL_BUSY',
      retryable: true,
      retryAfterSeconds: 30,
      suggestion: 'Wait about 30 seconds, then retry.',
    });
  }

  orderService.setPayPalOrderId(order.id, paypalOrder.id);
  try {
    await orderService.saveNow(order.id);
  } catch {
    abandonOrder(order.id, reservationId);
    throw new AppError(503, 'Storage unavailable; checkout was not started. Please retry.');
  }
  return paypalOrder;
}

function serializeShare(share: BillShare, currency: string, locale: string) {
  const order = share.orderId ? orderService.getById(share.orderId) : undefined;
  const isPaid = share.status === ShareStatus.PAID;
  return {
    id: share.id,
    status: share.status,
    participantBound: Boolean(share.participantUserId),
    // Masked so participants never expose each other's raw user ids.
    ...(share.participantUserId ? { participantHash: participantHash(share.participantUserId) } : {}),
    amountMinor: share.amountMinor,
    amountFormatted: formatMoney(share.amountMinor, currency, locale),
    ...(share.orderId ? { orderId: share.orderId } : {}),
    ...(isPaid && order?.paypalCaptureId ? { paypalCaptureId: order.paypalCaptureId } : {}),
    ...(isPaid ? { paidAt: (order?.updatedAt ?? new Date()).toISOString() } : {}),
  };
}

function serializeGroup(group: BillGroup) {
  const locale = currentBusiness.locale;
  const shares = billService.effectiveShares(group);
  return {
    id: group.id,
    status: deriveBillStatus(shares),
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
    shares: shares.map((s) => serializeShare(s, group.currency, locale)),
    progress: deriveBillProgress(shares),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

// ---- P1: group lifecycle ----------------------------------------------------

router.post('/bills', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const { items, participantCount } = req.body ?? {};
    const validated = validateOrderItems(items, catalogService); // throws AppError 400
    if (!Number.isInteger(participantCount) || participantCount < MIN_PARTICIPANTS || participantCount > MAX_PARTICIPANTS) {
      throw new AppError(400, `participantCount must be an integer between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}`);
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

router.post('/bills/:id/invite', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const group = billService.getById(req.params.id);
    if (!group || group.createdByUserId !== userId) throw new AppError(404, 'Bill not found');
    const { token, ttlSeconds } = billService.mintInvite(group.id);
    res.json({ token, ttlSeconds, joinUrl: `/join#t=${encodeURIComponent(token)}` });
  } catch (err) {
    next(err);
  }
});

router.post('/bills/join', requireSession, async (req, res, next) => {
  try {
    const { userId } = req.session!;
    const token = req.body?.token;
    if (typeof token !== 'string' || !token) throw new AppError(400, 'token is required');
    const { group, shareId } = await billService.joinWithToken(token, userId);
    res.json({ shareId, bill: serializeGroup(group) });
  } catch (err) {
    next(err);
  }
});

router.get('/bills/:id', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const group = billService.getById(req.params.id);
    if (!group || !billService.isParticipant(group, userId)) throw new AppError(404, 'Bill not found');
    res.json(serializeGroup(group));
  } catch (err) {
    next(err);
  }
});

// ---- P2: per-share payment -------------------------------------------------
//
// ⚠️  PERSISTENCE LIMITATION — P2 IS PROTOTYPE-ONLY.
//   Group/share/invite-nonce state lives IN MEMORY, per process instance:
//     - a restart loses all groups and invite nonces (old tokens fail closed);
//     - across multiple instances the atomic per-share claim (set `share.orderId`
//       synchronously before any await) and the single-use nonce reservation are
//       ONLY process-local — they are NOT shared/atomic across instances.
//   The per-share ORDER (after `/pay`) goes through the normal durable order
//   pipeline, but the group/claim state does not. Do NOT treat P2 as production
//   for multi-instance deployments until the group + nonce state is moved to a
//   durable, atomically-reserved store (e.g. Postgres unique constraint / row
//   lock) and that is explicitly reviewed and approved.

// Create the (normal) PayPal order for a share. Capture is performed via the
// existing audited route `POST /orders/:orderId/capture`, which already handles
// locks, reconciliation, webhooks and reservations.
router.post('/bills/:id/shares/:shareId/pay', requireSession, async (req, res, next) => {
  try {
    if (!env.isPayPalEnabled()) throw new AppError(503, 'PayPal not configured');
    const { userId, sessionId } = req.session!;
    const group = billService.getById(req.params.id);
    if (!group || !billService.isParticipant(group, userId)) throw new AppError(404, 'Bill not found');
    const share = group.shares.find((s) => s.id === req.params.shareId);
    // Only the participant who owns this share may pay it.
    if (!share || share.participantUserId !== userId) throw new AppError(404, 'Share not found');

    const effective = billService.effectiveShares(group).find((s) => s.id === share.id)!;
    if (effective.status === ShareStatus.PAID) throw new AppError(409, 'Share already paid');
    if (effective.status === ShareStatus.FAILED) {
      throw new AppError(409, 'Share payment previously failed; create a new bill or share');
    }

    // Idempotent resume: if an order already exists for this share, hand back the
    // same checkout instead of creating a second order / PayPal order.
    if (share.orderId) {
      const existing = orderService.getById(share.orderId);
      if (existing) {
        if (existing.status === OrderStatus.PAID) throw new AppError(409, 'Share already paid');
        if (existing.status === OrderStatus.PAYMENT_PENDING && existing.paypalOrderId) {
          let approvalUrl: string | undefined;
          try {
            const remote: any = await paypalClient.getOrder(existing.paypalOrderId);
            approvalUrl = remote?.links?.find((l: any) => l.rel === 'approve')?.href;
          } catch {
            /* link unavailable: capture can still proceed by order id */
          }
          return res.json({
            shareId: share.id,
            orderId: existing.id,
            paypalOrderId: existing.paypalOrderId,
            status: existing.status,
            totalMinor: existing.totalMinor,
            currency: existing.currency,
            approvalUrl,
          });
        }
        if (existing.status === OrderStatus.PAYMENT_FAILED || existing.status === OrderStatus.ORDER_CANCELLED) {
          throw new AppError(409, 'Share payment previously failed; create a new bill or share');
        }
        // The order exists but its checkout has not started yet — a sibling request
        // is mid-flight (between order creation and PayPal create). A concurrent
        // duplicate MUST NOT create a second order: conflict.
        throw new AppError(409, 'Payment already in progress for this share');
      }
    }

    // Authoritative policy evaluation + daily-spend reservation for the share.
    const policy = policyStorage.getOrCreatePolicy(userId);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const ordersLastHour = orderService
      .getAll()
      .filter((o) => o.sessionId === sessionId && o.createdAt.getTime() >= oneHourAgo).length;
    const origin = OrderOrigin.HUMAN;
    // Policy evaluates the share against the REAL bill contents (already-validated
    // catalog products), so merchant/category/dietary protections apply to the
    // underlying goods — not to a synthetic placeholder. The authoritative amount
    // remains the server-computed share total.
    const evalItems = group.items;
    // The order/checkout carries a single share-sized line so order.totalMinor is
    // exactly this share (orderService.create derives the total from the items).
    const orderItems = [
      {
        productId: `split-share-${share.id}`,
        name: `Split bill share (${group.id})`,
        quantity: 1,
        unitPriceMinor: share.amountMinor,
        lineTotalMinor: share.amountMinor,
      },
    ];
    const total = share.amountMinor;

    const evaluation = policyService.evaluatePurchase(
      buildEvaluationOrder(sessionId, evalItems, total, group.currency, origin),
      policy,
      buildPolicyContext(userId, currentBusiness.businessId, dailySpendTracker, { ordersLastHour })
    );
    if (evaluation.decision === 'BLOCK') {
      const outcome = buildPolicyOutcome(evaluation);
      return res.status(403).json({
        error: 'Purchase blocked by policy',
        policyDecision: outcome.decision,
        violations: outcome.violations,
        reason: outcome.reason,
        suggestion: outcome.suggestion,
      });
    }

    const reservation = dailySpendTracker.tryReserve(userId, total, policy.dailySpendLimitMinor);
    if (!reservation) {
      throw new AppError(403, 'Purchase blocked by policy', { reason: 'Cart exceeds daily spend limit' });
    }

    // ---- Atomic per-share claim barrier (claim-before-order) ----
    // The share→order binding is decided by the DB, not by in-process state:
    //   - with a durable store: generate the order id FIRST, win the per-share
    //     claim mutex with it, THEN create an order that REUSES the same id. A
    //     concurrent duplicate for this share loses the claim and must not create
    //     a second order/PayPal order (multi-instance safe).
    //   - without a durable store (dev/test): keep the original single-instance
    //     in-memory behavior where `share.orderId` is bound synchronously.
    const repos = getRepos();
    const policyLimits = {
      maxPerPurchaseMinor: policy.maxPerPurchaseMinor,
      dailySpendLimitMinor: policy.dailySpendLimitMinor,
      confirmationThresholdMinor: policy.confirmationThresholdMinor,
      enabled: policy.enabled,
      validUntil: policy.validUntil ? policy.validUntil.toISOString() : null,
    };

    if (repos) {
      const orderId = uuidv4();
      const claimed = await repos.bills.claimShareForPayment(share.id, orderId);
      if (!claimed) {
        dailySpendTracker.cancelReservation(reservation.id);
        throw new AppError(409, 'Payment already in progress for this share');
      }
      const order = orderService.create(sessionId, orderItems, group.currency, origin, `bill-pay-${share.id}`, undefined, orderId);
      orderService.setReservationId(order.id, reservation.id);
      order.policyAppliedLimits = policyLimits;
      share.orderId = orderId;
      group.updatedAt = new Date();
      try {
        await orderService.saveNow(order.id);
      } catch (err: any) {
        // Storage failed after the claim won: release the claim so the share is
        // retryable, and roll back the reservation.
        await repos.bills.releaseClaim(share.id, orderId).catch(() => undefined);
        share.orderId = undefined;
        abandonOrder(order.id, reservation.id);
        console.error(`BILL_ORDER_PERSIST_FAILED order=${order.id} error=${err?.message ?? err}`);
        throw new AppError(503, 'Storage unavailable; order was not created. Please retry.');
      }
      try {
        policyStorage.recordEvent({
          userId,
          sessionId,
          cartId: `bill_${group.id}`,
          orderId: order.id,
          agent: 'server',
          amountMinor: total,
          currency: group.currency,
          evaluation,
          policy,
        });
      } catch {
        /* non-fatal: order + claim are already durable */
      }
      try {
        const paypalOrder = await startSharePayPalCheckout(order, reservation.id, `bill-pay-${share.id}`);
        res.status(201).json({
          shareId: share.id,
          orderId: order.id,
          paypalOrderId: paypalOrder.id,
          status: order.status,
          totalMinor: order.totalMinor,
          currency: order.currency,
          approvalUrl: paypalOrder.links?.find((l: any) => l.rel === 'approve')?.href,
        });
      } catch (err) {
        // PayPal/checkout failed: the order is cancelled inside startSharePayPalCheckout;
        // release the claim so the share stays retryable, then rethrow.
        await repos.bills.releaseClaim(share.id, orderId).catch(() => undefined);
        share.orderId = undefined;
        throw err;
      }
    } else {
      const order = orderService.create(sessionId, orderItems, group.currency, origin, `bill-pay-${share.id}`);
      orderService.setReservationId(order.id, reservation.id);
      order.policyAppliedLimits = policyLimits;
      share.orderId = order.id;
      group.updatedAt = new Date();
      try {
        await orderService.saveNow(order.id);
      } catch (err: any) {
        abandonOrder(order.id, reservation.id);
        console.error(`BILL_ORDER_PERSIST_FAILED order=${order.id} error=${err?.message ?? err}`);
        throw new AppError(503, 'Storage unavailable; order was not created. Please retry.');
      }
      policyStorage.recordEvent({
        userId,
        sessionId,
        cartId: `bill_${group.id}`,
        orderId: order.id,
        agent: 'server',
        amountMinor: total,
        currency: group.currency,
        evaluation,
        policy,
      });
      const paypalOrder = await startSharePayPalCheckout(order, reservation.id, `bill-pay-${share.id}`);
      res.status(201).json({
        shareId: share.id,
        orderId: order.id,
        paypalOrderId: paypalOrder.id,
        status: order.status,
        totalMinor: order.totalMinor,
        currency: order.currency,
        approvalUrl: paypalOrder.links?.find((l: any) => l.rel === 'approve')?.href,
      });
    }
  } catch (err) {
    next(err);
  }
});

// Per-share dispute evidence package (reuses the existing signed evidence assembler).
router.get('/bills/:id/shares/:shareId/evidence', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const group = billService.getById(req.params.id);
    if (!group || !billService.isParticipant(group, userId)) throw new AppError(404, 'Bill not found');
    const share = group.shares.find((s) => s.id === req.params.shareId);
    if (!share || (share.participantUserId !== userId && group.createdByUserId !== userId)) {
      throw new AppError(404, 'Share not found');
    }
    if (!share.orderId) throw new AppError(404, 'Share has no order yet');
    const pkg = buildEvidencePackage(share.orderId);
    if (!pkg) throw new AppError(404, 'Share not found');
    res.set('Cache-Control', 'no-store');
    res.json(pkg);
  } catch (err) {
    next(err);
  }
});

export default router;

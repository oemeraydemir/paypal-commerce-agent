// Split Bill routes — P1 (read-only group) + P2 (per-share payment).
import { sessionRateLimit } from '../middleware/rate-limit';
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
import { Order, OrderOrigin, OrderStatus } from '../orders/domain';
import { classifyPayPalOrder, cancelUncapturedOrder } from '../orders/payment-lifecycle';
import { BillService, deriveBillProgress, deriveBillStatus } from '../bills/service';
import { buildEvidencePackage } from '../evidence/service';
import { formatMoney } from '../utils/money';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import { policyService } from '../policy/service';
import { requireAllergenAcknowledgement } from '../policy/allergen-ack';
import { policyStorage } from '../policy/storage';
import { getRepos } from '../persistence/registry';
import { buildEvaluationOrder, buildPolicyContext, buildPolicyOutcome } from '../policy/context-builder';
import { sessionStore } from '../session';
import { evaluateWellbeing } from '../wellbeing/service';
import {
  BillGroup,
  BillShare,
  BillStatus,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  ShareStatus,
} from '../bills/domain';

// Bill writes are cheap to script and each one allocates server state: cap them per session and per IP.
const billWriteLimiter = sessionRateLimit(30, 120);
const router = Router();
const billService = BillService.getInstance();
const catalogService = new CatalogService();
const orderService = OrderService.getInstance();

function participantHash(userId: string): string {
  return createHash('sha256').update(`bill-participant:${userId}`).digest('hex').slice(0, 12);
}

function billMandateError(reason: string): AppError {
  const renewal = reason === 'BILL_MANDATE_RENEWAL_REQUIRED' || reason === 'MANDATE_CHANGED' || reason === 'ALLOWANCE_EXPIRED';
  return new AppError(renewal ? 409 : 403,
    renewal
      ? 'The bill owner must explicitly renew spending permission for the full cart before participants can pay.'
      : reason === 'MAX_PURCHASE_EXCEEDED'
        ? 'The share exceeds the participant’s authorized purchase limit.'
        : reason === 'DAILY_LIMIT_EXCEEDED'
          ? 'The share exceeds the participant’s remaining daily allowance.'
          : 'The participant’s spending permission does not authorize this payment.',
    { code: renewal ? 'BILL_MANDATE_RENEWAL_REQUIRED' : reason, reason });
}

/** Rolls a share's order back to a non-payable state and releases its reservation. */
function abandonOrder(orderId: string, reservationId?: string): void {
  if (reservationId) dailySpendTracker.cancelReservation(reservationId);
  orderService.updateStatus(orderId, OrderStatus.ORDER_CANCELLED);
}

/**
 * Evidence check BEFORE an owner discards started split-bill checkouts.
 *
 * A started checkout has NOT moved money: the buyer may have opened (or even
 * approved) a PayPal order, but nothing was captured. PayPal is the source of
 * truth, so we ask it directly. Only `NOT_APPROVED`, `IN_PROGRESS` (approved,
 * no capture) and `DECLINED` (definitive failure) are safe to abandon. A
 * captured, pending, mismatched or unclassifiable order — and any lookup that
 * fails — fails CLOSED: the bill stays open and nothing is cancelled.
 */
async function verifiedStartedCheckouts(group: BillGroup): Promise<Array<{ share: BillShare; order: Order }>> {
  const started: Array<{ share: BillShare; order: Order }> = [];
  for (const share of group.shares) {
    if (!share.orderId) continue;
    const order = orderService.getById(share.orderId);
    if (!order) continue;
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.ORDER_CONFIRMED) {
      throw new AppError(409, 'A share has already been paid; the bill cannot be cancelled. A refund must be approved by the café.', {
        code: 'BILL_HAS_PAYMENTS',
      });
    }
    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      throw new AppError(409, 'A started checkout changed state; the bill was not cancelled. Refresh and try again.', {
        code: 'CHECKOUT_CHANGED',
      });
    }
    if (order.paypalOrderId) {
      let remote: any;
      try {
        remote = await paypalClient.getOrder(order.paypalOrderId);
      } catch {
        throw new AppError(503, 'The started PayPal checkout could not be verified; nothing was cancelled. Please retry shortly.', {
          code: 'PAYPAL_STATUS_UNVERIFIED', retryable: true,
        });
      }
      const state = classifyPayPalOrder(remote).state;
      if (state !== 'NOT_APPROVED' && state !== 'IN_PROGRESS' && state !== 'DECLINED') {
        throw new AppError(409, `PayPal shows this checkout as ${state}; the bill was not cancelled.`, {
          code: 'PAYMENT_STATUS_UNVERIFIED', paypalState: state,
        });
      }
    }
    started.push({ share, order });
  }
  return started;
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

function serializeShare(share: BillShare, currency: string, locale: string, viewerId?: string) {
  const order = share.orderId ? orderService.getById(share.orderId) : undefined;
  const isPaid = share.status === ShareStatus.PAID;
  return {
    id: share.id,
    status: share.status,
    participantBound: Boolean(share.participantUserId),
    // True only for the caller's own share (the viewer id comes from the session, never the client).
    mine: Boolean(viewerId && share.participantUserId === viewerId),
    // Masked so participants never expose each other's raw user ids.
    ...(share.participantUserId ? { participantHash: participantHash(share.participantUserId) } : {}),
    amountMinor: share.amountMinor,
    amountFormatted: formatMoney(share.amountMinor, currency, locale),
    ...(share.orderId ? { orderId: share.orderId } : {}),
    ...(isPaid && order?.paypalCaptureId ? { paypalCaptureId: order.paypalCaptureId } : {}),
    ...(isPaid ? { paidAt: (order?.updatedAt ?? new Date()).toISOString() } : {}),
  };
}

function serializeGroup(group: BillGroup, viewerId?: string) {
  const locale = currentBusiness.locale;
  const shares = billService.effectiveShares(group);
  return {
    id: group.id,
    status: group.status === BillStatus.CANCELLED ? BillStatus.CANCELLED : deriveBillStatus(shares),
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
    isOwner: Boolean(viewerId && group.createdByUserId === viewerId),
    shares: shares.map((s) => serializeShare(s, group.currency, locale, viewerId)),
    progress: deriveBillProgress(shares),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

// ---- P1: group lifecycle ----------------------------------------------------

router.post('/bills', requireSession, billWriteLimiter, async (req, res, next) => {
  try {
    const { userId, sessionId } = req.session!;
    const { items, participantCount } = req.body ?? {};
    const validated = validateOrderItems(items, catalogService); // throws AppError 400
    const wellbeingPreferences = sessionStore.getWellbeingPreferences(req.session!.sessionId);
    if (!wellbeingPreferences) throw new AppError(428, 'Save your wellbeing preferences before creating a Split Bill', { code: 'WELLBEING_PROFILE_REQUIRED' });
    const wellbeing = evaluateWellbeing(validated, wellbeingPreferences, catalogService);
    if (!wellbeing.allowed) {
      const total = validated.reduce((sum, item) => sum + item.lineTotalMinor, 0);
      const policy = await policyStorage.getAuthoritativePolicy(userId);
      policyStorage.recordEvent({ userId, sessionId: req.session!.sessionId, cartId: createHash('sha256').update(JSON.stringify(validated)).digest('hex').slice(0, 16), agent: 'server', amountMinor: total, currency: currentBusiness.currency, evaluation: { decision: 'BLOCK', violations: [], guardDataVersion: wellbeing.productDataVersion, wellbeingDecision: { status: wellbeing.status, productDataVersion: wellbeing.productDataVersion, items: wellbeing.items } }, policy });
      return res.status(403).json({ error: 'Cart blocked by Wellbeing Guard', code: 'WELLBEING_GUARD_BLOCKED', wellbeing });
    }
    if (!Number.isInteger(participantCount) || participantCount < MIN_PARTICIPANTS || participantCount > MAX_PARTICIPANTS) {
      throw new AppError(400, `participantCount must be an integer between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}`);
    }
    // Splitting must not become a way around the spending policy: the WHOLE cart is
    // evaluated exactly like a normal checkout (no daily-spend reservation here; each
    // share reserves its own amount when it is paid). Only BLOCK stops creation.
    const wholeTotal = validated.reduce((sum, i) => sum + i.lineTotalMinor, 0);
    const policy = await policyStorage.getAuthoritativePolicy(userId);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const ordersLastHour = orderService
      .getAll()
      .filter((o) => o.sessionId === sessionId && o.createdAt.getTime() >= oneHourAgo).length;
    const wholeCart = policyService.evaluatePurchase(
      buildEvaluationOrder(sessionId, validated, wholeTotal, currentBusiness.currency, OrderOrigin.HUMAN),
      policy,
      buildPolicyContext(userId, currentBusiness.businessId, dailySpendTracker, { ordersLastHour })
    );
    if (wholeCart.decision === 'BLOCK') {
      const outcome = buildPolicyOutcome(wholeCart);
      return res.status(403).json({
        error: 'Purchase blocked by policy',
        policyDecision: outcome.decision,
        violations: outcome.violations,
        reason: outcome.reason,
        suggestion: outcome.suggestion,
      });
    }

    // Wellbeing Guard: a split-bill cart with an unverified-allergen concern must be
    // explicitly acknowledged by the shopper before the bill group is created.
    // (No-op unless there is an unverified concern.)
    requireAllergenAcknowledgement(wholeCart, req.body);

    const group = billService.createGroup({
      createdByUserId: userId,
      items: validated,
      participantCount,
      currency: currentBusiness.currency,
      merchantId: currentBusiness.businessId,
      persist: !getRepos(),
    });
    const repos = getRepos();
    if (repos) {
      const reserved = await repos.bills.createGroupWithMandateReservation({
        group,
        mandateRevision: policyStorage.getRevision(userId),
        sessionId,
        expiresAt: policy.validUntil,
        reservationId: uuidv4(),
      });
      if (!reserved.ok) {
        billService.forgetUncommittedGroup(group.id);
        throw new AppError(reserved.reason === 'MANDATE_CHANGED' || reserved.reason === 'ALLOWANCE_EXPIRED' ? 409 : 403,
          reserved.reason === 'ALLOWANCE_EXPIRED'
            ? 'Spending permission expired; review and authorize it again.'
            : reserved.reason === 'MANDATE_CHANGED'
              ? 'Spending permission changed; reload and confirm again.'
              : reserved.reason === 'MAX_PURCHASE_EXCEEDED'
                ? 'The full Split Bill cart exceeds the authorized purchase limit.'
                : reserved.reason === 'MERCHANT_NOT_ALLOWED'
                  ? 'This merchant is outside the authorized spending scope.'
                  : reserved.reason === 'CURRENCY_MISMATCH'
                    ? 'This cart currency is outside the authorized spending scope.'
                    : 'The full Split Bill cart exceeds the remaining daily spending allowance.',
          { code: reserved.reason });
      }
    }
    policyStorage.recordEvent({ userId, sessionId, cartId: `bill_${group.id}`, agent: 'server', amountMinor: wholeTotal, currency: currentBusiness.currency, evaluation: { decision: 'AUTO_ALLOW', violations: [], guardDataVersion: wellbeing.productDataVersion, wellbeingDecision: { status: wellbeing.status, productDataVersion: wellbeing.productDataVersion, items: wellbeing.items } }, policy });
    res.status(201).json(serializeGroup(group, userId));
  } catch (err) {
    next(err);
  }
});

router.post('/bills/:id/invite', requireSession, billWriteLimiter, (req, res, next) => {
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

router.post('/bills/:id/cancel', requireSession, billWriteLimiter, async (req, res, next) => {
  try {
    const { userId } = req.session!;
    const repos = getRepos();
    const current = billService.getById(req.params.id);
    if (!current || current.createdByUserId !== userId) throw new AppError(404, 'Bill not found');
    if (current.status === BillStatus.CANCELLED) {
      return res.json(serializeGroup(current, userId));
    }

    // Opt-in, explicit owner decision. Without this flag the original guard
    // stands: a bill with a live checkout is never cancelled implicitly.
    if (req.body?.abandonUncaptured === true) {
      const started = await verifiedStartedCheckouts(current);
      if (repos) {
        const result = await repos.bills.abandonStartedCheckoutsAndCancel(
          req.params.id, userId, started.map((s) => s.order.id)
        );
        if (!result.ok) {
          const notFound = result.reason === 'BILL_NOT_FOUND' || result.reason === 'NOT_OWNER';
          throw new AppError(notFound ? 404 : 409, `The bill was not cancelled (${result.reason}). Refresh and try again.`, {
            code: result.reason,
          });
        }
        // Reconcile the in-memory read model with the durable decision: cancel
        // the local orders (which releases their daily-spend reservations) and
        // unbind the shares so a stale capture can never be offered again.
        const released = new Set(result.abandoned.map((a) => a.orderId));
        for (const { share, order } of started) {
          if (!released.has(order.id)) continue;
          cancelUncapturedOrder(order, 'cancel');
          share.orderId = undefined;
        }
        const group = billService.applyPersistedCancellation(req.params.id, userId);
        return res.json(serializeGroup(group, userId));
      }
      for (const { share, order } of started) {
        cancelUncapturedOrder(order, 'cancel');
        share.orderId = undefined;
      }
      return res.json(serializeGroup(billService.cancel(req.params.id, userId), userId));
    }

    if (repos) {
      const closed = await repos.bills.cancelGroupAndCloseMandate(req.params.id, userId);
      if (!closed) throw new AppError(409, 'Bill has a payment in progress or cannot be cancelled.');
    }
    const group = repos
      ? billService.applyPersistedCancellation(req.params.id, userId)
      : billService.cancel(req.params.id, userId);
    res.json(serializeGroup(group, userId));
  } catch (err) {
    next(err);
  }
});

// Explicit owner confirmation re-establishes the full-cart spending permission
// after a mandate revision/expiry. This is separate from each participant's
// PayPal payment authorization.
router.post('/bills/:id/mandate/renew', requireSession, billWriteLimiter, async (req, res, next) => {
  try {
    const { userId, sessionId } = req.session!;
    const group = billService.getById(req.params.id);
    if (!group || group.createdByUserId !== userId) throw new AppError(404, 'Bill not found');
    const confirmedTotalMinor = req.body?.confirmedTotalMinor;
    if (!Number.isSafeInteger(confirmedTotalMinor) || confirmedTotalMinor !== group.totalMinor) {
      throw new AppError(400, 'confirmedTotalMinor must equal the complete current bill total.', {
        code: 'FULL_CART_CONFIRMATION_REQUIRED', totalMinor: group.totalMinor,
      });
    }
    const repos = getRepos();
    if (!repos) throw new AppError(503, 'Durable spending permission storage is unavailable.');
    const policy = await policyStorage.getAuthoritativePolicy(userId);
    const result = await repos.bills.renewMandateReservation({
      billId: group.id, ownerUserId: userId, confirmedTotalMinor,
      mandateRevision: policyStorage.getRevision(userId), expiresAt: policy.validUntil,
      reservationId: uuidv4(), sessionId, eventId: uuidv4(),
    });
    if (!result.ok) throw new AppError(result.reason === 'MANDATE_CHANGED' || result.reason === 'ALLOWANCE_EXPIRED' ? 409 : 403,
      'The full Split Bill amount is not authorized under the current spending mandate. Review the mandate and confirm again.',
      { code: result.reason });
    res.json({
      billId: group.id, reservationId: result.reservation.id,
      authorizedAmountMinor: result.reservation.amountMinor,
      currency: result.reservation.currency, mandateRevision: result.reservation.mandateRevision,
      status: result.reservation.status,
      paymentAuthorization: 'SEPARATE_PER_PARTICIPANT',
    });
  } catch (err) { next(err); }
});

router.post('/bills/join', requireSession, billWriteLimiter, async (req, res, next) => {
  try {
    const { userId } = req.session!;
    const token = req.body?.token;
    if (typeof token !== 'string' || !token) throw new AppError(400, 'token is required');
    const { group, shareId } = await billService.joinWithToken(token, userId);
    res.json({ shareId, bill: serializeGroup(group, userId) });
  } catch (err) {
    next(err);
  }
});

router.get('/bills/:id', requireSession, (req, res, next) => {
  try {
    const { userId } = req.session!;
    const group = billService.getById(req.params.id);
    if (!group || !billService.isParticipant(group, userId)) throw new AppError(404, 'Bill not found');
    res.json(serializeGroup(group, userId));
  } catch (err) {
    next(err);
  }
});

// ---- P2: per-share payment -------------------------------------------------
//
// Durability: group/share/nonce state is persisted to PostgreSQL when a
// DATABASE_URL is configured, and the share→order claim is decided by the database
// (`claimShareForPayment`), so it is safe across restarts and multiple instances.
// Without a database the claim is in-process only (local dev / tests).

// Create the (normal) PayPal order for a share. Capture is performed via the
// existing audited route `POST /orders/:orderId/capture`, which already handles
// locks, reconciliation, webhooks and reservations.
router.post('/bills/:id/shares/:shareId/pay', requireSession, billWriteLimiter, async (req, res, next) => {
  try {
    if (!env.isPayPalEnabled()) throw new AppError(503, 'PayPal not configured');
    const { userId, sessionId } = req.session!;
    const group = billService.getById(req.params.id);
    if (!group || !billService.isParticipant(group, userId)) throw new AppError(404, 'Bill not found');
    const share = group.shares.find((s) => s.id === req.params.shareId);
    // Only the participant who owns this share may pay it.
    if (!share || share.participantUserId !== userId) throw new AppError(404, 'Share not found');

    if (group.status === BillStatus.CANCELLED) throw new AppError(409, 'Bill was cancelled');
    const effective = billService.effectiveShares(group).find((s) => s.id === share.id)!;
    if (effective.status === ShareStatus.PAID) throw new AppError(409, 'Share already paid');
    if (effective.status === ShareStatus.FAILED) {
      throw new AppError(409, 'Share payment previously failed; create a new bill or share');
    }

    const repos = getRepos();
    let billMandateReservationId: string | undefined;
    if (repos) {
      const mandate = await repos.bills.validateMandateReservation({
        billId: group.id, ownerUserId: group.createdByUserId, totalMinor: group.totalMinor,
        currency: group.currency, merchantId: group.merchantId,
      });
      if (!mandate.ok) throw billMandateError(mandate.reason);
      billMandateReservationId = mandate.reservation.id;
    } else {
      const ownerPolicy = await policyStorage.getAuthoritativePolicy(group.createdByUserId);
      const ownerEvaluation = policyService.evaluatePurchase(
        buildEvaluationOrder(sessionId, group.items, group.totalMinor, group.currency, OrderOrigin.HUMAN),
        ownerPolicy,
        buildPolicyContext(group.createdByUserId, group.merchantId, dailySpendTracker)
      );
      if (ownerEvaluation.decision === 'BLOCK') {
        throw new AppError(409, 'The bill owner must renew permission for the full cart.', { code: 'BILL_MANDATE_RENEWAL_REQUIRED' });
      }
    }

    const wellbeingPreferences = sessionStore.getWellbeingPreferences(sessionId);
    if (!wellbeingPreferences) throw new AppError(428, 'Save your wellbeing preferences before paying a Split Bill share', { code: 'WELLBEING_PROFILE_REQUIRED' });
    const wellbeing = evaluateWellbeing(group.items, wellbeingPreferences, catalogService);
    if (!wellbeing.allowed) {
      const blockedPolicy = policyStorage.getOrCreatePolicy(userId);
      policyStorage.recordEvent({ userId, sessionId, cartId: `bill_${group.id}`, agent: 'server', amountMinor: share.amountMinor, currency: group.currency, evaluation: { decision: 'BLOCK', violations: [], guardDataVersion: wellbeing.productDataVersion, wellbeingDecision: { status: wellbeing.status, productDataVersion: wellbeing.productDataVersion, items: wellbeing.items } }, policy: blockedPolicy });
      return res.status(403).json({ error: 'Cart blocked by Wellbeing Guard', code: 'WELLBEING_GUARD_BLOCKED', wellbeing });
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
    const policy = await policyStorage.getAuthoritativePolicy(userId);
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

    const reserved = await dailySpendTracker.reserveWithinMandate({
      userId, amountMinor: total, currency: group.currency, merchantId: group.merchantId,
      mandateRevision: policyStorage.getRevision(userId), dailySpendLimitMinor: policy.dailySpendLimitMinor,
      billMandateReservationId,
    });
    if (!reserved.ok) throw billMandateError(reserved.reason);
    const reservation = reserved.reservation;

    // ---- Atomic per-share claim barrier (claim-before-order) ----
    // The share→order binding is decided by the DB, not by in-process state:
    //   - with a durable store: generate the order id FIRST, win the per-share
    //     claim mutex with it, THEN create an order that REUSES the same id. A
    //     concurrent duplicate for this share loses the claim and must not create
    //     a second order/PayPal order (multi-instance safe).
    //   - without a durable store (dev/test): keep the original single-instance
    //     in-memory behavior where `share.orderId` is bound synchronously.
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
      evaluation: { ...evaluation, guardDataVersion: wellbeing.productDataVersion, wellbeingDecision: { status: wellbeing.status, productDataVersion: wellbeing.productDataVersion, items: wellbeing.items } },
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
        evaluation: { ...evaluation, guardDataVersion: wellbeing.productDataVersion, wellbeingDecision: { status: wellbeing.status, productDataVersion: wellbeing.productDataVersion, items: wellbeing.items } },
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

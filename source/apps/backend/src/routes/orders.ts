import { getRepos } from '../persistence/registry';
import { requireDashboardAccess } from '../middleware/merchant-key';
import { refundService } from '../refunds/service';
import { sessionRateLimit } from '../middleware/rate-limit';

// 30 order/capture calls per minute per session, 120 per IP: far above a human, below a script.
const checkoutLimiter = sessionRateLimit(30, 120);
// A capture normally takes seconds; a claim older than this is treated as left by a crashed instance.
const CAPTURE_CLAIM_TTL_MS = 120_000;
import { Router } from 'express';
import { paypalClient } from '../paypal/client';
import { describeCapturedAmount, extractCapturedAmount, validateCompletedCapture } from '../paypal/capture-amount';
import { OrderService, createRequestFingerprint } from '../orders/service';
import { validateOrderItems } from '../orders/validation';
import { CatalogService } from '../catalog/service';
import { AppError } from '../middleware/error-handler';
import { extractPayPalIssue } from '../paypal/errors';
import { env } from '../config/environment';
import { idempotency } from '../middleware/idempotency';
import { currentBusiness } from '../config/business-config';
import { emitAutomationEvent } from '../automation/emitter';
import { OrderOrigin, OrderStatus, createCartId } from '../orders/domain';
import { formatMoney } from '../utils/money';
import {
  consumeAIPreparedSession,
  peekAIPreparedSession,
} from '../ai/session-tracker';
import { createHash } from 'crypto';
import { requireSession } from '../middleware/session-auth';
import { publicSessionRef } from '../session';
import { policyService } from '../policy/service';
import { policyStorage } from '../policy/storage';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import {
  buildEvaluationOrder,
  buildPolicyContext,
  buildPolicyOutcome,
} from '../policy/context-builder';
import { PolicyEvaluation } from '../policy/domain';
import { captureLock } from '../orders/capture-lock';
import {
  markOrderPaid,
  markOrderPaymentFailed,
  cancelUncapturedOrder,
  settleFromPayPal,
} from '../orders/payment-lifecycle';

const router = Router();
const orderService = OrderService.getInstance();
const catalogService = new CatalogService();

// Rolls an order back to a non-payable state and releases its reservation.
function abandonOrder(orderId: string, reservationId?: string): void {
  if (reservationId) dailySpendTracker.cancelReservation(reservationId);
  orderService.updateStatus(orderId, OrderStatus.ORDER_CANCELLED);
}

/**
 * Creates the PayPal order for an already-persisted order and durably records the
 * PayPal order id BEFORE the approval link is handed out. If that write fails the
 * link is never shown (the PayPal order stays unapproved and harmless), so a
 * payment can never exist that this service cannot find again after a restart.
 */
async function startPayPalCheckout(
  order: ReturnType<OrderService['create']>,
  reservationId: string | undefined,
  idempotencyKey: string | undefined
): Promise<any> {
  const totalValue = (order.totalMinor / 100).toFixed(2);
  let paypalOrder;
  try {
    // FIX #1: dual-layer idempotency — reuse the same key as PayPal-Request-Id.
    paypalOrder = await paypalClient.createOrder(
      {
        intent: 'CAPTURE',
        purchaseUnits: [
          {
            referenceId: order.id,
            description: `${currentBusiness.name} Order`,
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
      idempotencyKey || `create-${order.id}`
    );
  } catch (err) {
    // S10 (R14): PayPal create failure is definitive for order creation —
    // release the reservation to prevent leakage and roll the order back to a
    // non-payable state. The 5xx is NOT cached by the idempotency layer so a
    // retry re-executes cleanly (capacity was released).
    abandonOrder(order.id, reservationId);
    // Never leak PayPal's own HTTP status to our client: a PayPal 401 (bad merchant
    // credentials) would otherwise look like an expired SESSION to the app, which then
    // re-authenticates and retries pointlessly. Upstream failures are reported as 502.
    const upstreamStatus = (err as any)?.statusCode;
    if (!(err instanceof AppError) && typeof upstreamStatus === 'number') {
      if (upstreamStatus === 401 || upstreamStatus === 403) {
        throw new AppError(
          502,
          'PayPal rejected the merchant credentials. Check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.',
          { code: 'PAYPAL_UPSTREAM_ERROR', upstreamStatus }
        );
      }
      // Priority 2 (Checkout Rescue): an upstream 5xx/timeout is usually transient.
      // Say so plainly, tell the buyer how long to wait, and reassure them their
      // cart is safe. We NEVER auto-retry: the buyer stays in control.
      throw new AppError(
        502,
        'PayPal is busy right now. Please wait about 30 seconds and try again.',
        {
          code: 'PAYPAL_BUSY',
          upstreamStatus,
          retryable: true,
          retryAfterSeconds: 30,
          suggestion: 'Wait about 30 seconds, then retry. Your cart is saved.',
          alternativePayment: 'You can also try a card or another payment method.',
          cartSaved: true,
        }
      );
    }
    throw err;
  }

  orderService.setPayPalOrderId(order.id, paypalOrder.id);
  try {
    await orderService.saveNow(order.id);
  } catch (err: any) {
    console.error(`ORDER_PERSIST_FAILED order=${order.id} paypalOrder=${paypalOrder.id} error=${err?.message ?? err}`);
    abandonOrder(order.id, reservationId);
    throw new AppError(503, 'Storage unavailable; checkout was not started. Please retry.');
  }
  return paypalOrder;
}

function createResponse(order: ReturnType<OrderService['create']>, paypalOrderId: string | undefined, approvalUrl?: string) {
  return {
    orderId: order.id,
    paypalOrderId,
    status: order.status,
    origin: order.origin,
    totalMinor: order.totalMinor,
    totalFormatted: formatMoney(order.totalMinor, order.currency, currentBusiness.locale),
    currency: order.currency,
    approvalUrl,
  };
}

router.post('/orders/create', requireSession, checkoutLimiter, idempotency, async (req, res, next) => {
  try {
    // sessionId/userId come from the authenticated session, never from the body.
    const { sessionId, userId } = req.session!;
    const { items } = req.body;
    const clientKey = req.headers['idempotency-key'] as string | undefined;
    // Session-scoped (and length-bounded) key: also used as PayPal-Request-Id so
    // two sessions can never be deduplicated into each other's PayPal order.
    const idempotencyKey = clientKey
      ? createHash('sha256').update(`${sessionId}:${clientKey}`).digest('hex')
      : undefined;

    if (!Array.isArray(items)) {
      throw new AppError(400, 'items array required');
    }

    // FIX #9 + #12: authoritative pricing, currency + quantity validation.
    const validatedItems = validateOrderItems(items, catalogService);

    // Input is validated first, so a malformed request is a 400 whether or not PayPal is configured.
    if (!env.isPayPalEnabled()) {
      throw new AppError(503, 'PayPal not configured');
    }
    const calculatedTotal = validatedItems.reduce(
      (sum, item) => sum + item.lineTotalMinor,
      0
    );

    // Retry of a request we already started (same session + Idempotency-Key), e.g. the
    // client timed out, or the process restarted after the order row was written but
    // before the response was cached. NEVER create a second order / PayPal order for it.
    if (idempotencyKey) {
      const existing = orderService.findReusableByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (
          existing.requestFingerprint &&
          existing.requestFingerprint !== createRequestFingerprint(req.body)
        ) {
          throw new AppError(409, 'Idempotency-Key reused with different request body', {
            code: 'IDEMPOTENCY_KEY_REUSE',
          });
        }
        if (existing.paypalOrderId) {
          // PayPal order already exists: hand back the same checkout (re-read its link).
          let approvalUrl: string | undefined;
          if (existing.status === OrderStatus.PAYMENT_PENDING) {
            try {
              const remote: any = await paypalClient.getOrder(existing.paypalOrderId);
              approvalUrl = remote?.links?.find((l: any) => l.rel === 'approve')?.href;
            } catch {
              /* link unavailable: the client can still capture/cancel by order id */
            }
          }
          // Idempotent replay: byte-identical body and status to the original
          // creation (201 Created, per openapi.json and the Postman collection).
          return res.status(201).json(createResponse(existing, existing.paypalOrderId, approvalUrl));
        }
        // Order row exists but PayPal was never reached: resume from there.
        const resumePolicy = policyStorage.getOrCreatePolicy(userId);
        let reservationId = existing.reservationId;
        if (!reservationId || dailySpendTracker.getReservationState(reservationId) !== 'PENDING') {
          const fresh = dailySpendTracker.tryReserve(
            userId,
            existing.totalMinor,
            resumePolicy.dailySpendLimitMinor
          );
          if (!fresh) {
            orderService.updateStatus(existing.id, OrderStatus.ORDER_CANCELLED);
            throw new AppError(403, 'Purchase blocked by policy', {
              reason: 'Cart exceeds daily spend limit',
            });
          }
          reservationId = fresh.id;
          orderService.setReservationId(existing.id, reservationId);
          try {
            await orderService.saveNow(existing.id);
          } catch {
            abandonOrder(existing.id, reservationId);
            throw new AppError(503, 'Storage unavailable; order was not resumed. Please retry.');
          }
        }
        const resumed = await startPayPalCheckout(existing, reservationId, idempotencyKey);
        const link = resumed.links?.find((l: any) => l.rel === 'approve');
        return res.status(201).json(createResponse(existing, resumed.id, link?.href));
      }
    }

    // FIX #7 + FIX-04 (verification finding PP18): the server decides the origin.
    // The client never sends it. A session whose cart was prepared by the storefront
    // AI chat is AI_ASSISTED; one prepared by an external agent over MCP is AI_AGENT.
    // Peek (do not consume) here so a BLOCKed request leaves the marker intact
    // and is not mis-attributed as HUMAN on retry (B5).
    const aiPrepared = peekAIPreparedSession(sessionId);
    const origin = aiPrepared ? OrderOrigin[aiPrepared] : OrderOrigin.HUMAN;

    // S10 (R2/R6): deterministic cart correlation shared by advisory and
    // authoritative PolicyEvents (sessionId + item selection).
    const cartId = createCartId(sessionId, validatedItems);
    // Per-user policy + per-user daily budget: isolated from every other session.
    const policy = policyStorage.getOrCreatePolicy(userId);

    // S10 (R9/R10): AUTHORITATIVE policy evaluation on an in-memory snapshot
    // BEFORE the order is persisted or PayPal is contacted. The client's
    // policyDecision/violations/origin/reservationId are NEVER trusted.
    //
    // Priority 4: feed the order-frequency rule with this session's orders in the
    // trailing hour (the order being created now is not persisted yet).
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const ordersLastHour = orderService
      .getAll()
      .filter((o) => o.sessionId === sessionId && o.createdAt.getTime() >= oneHourAgo)
      .length;
    const evaluation = policyService.evaluatePurchase(
      buildEvaluationOrder(
        sessionId,
        validatedItems,
        calculatedTotal,
        currentBusiness.currency,
        origin
      ),
      policy,
      buildPolicyContext(userId, currentBusiness.businessId, dailySpendTracker, {
        ordersLastHour,
      })
    );

    if (evaluation.decision === 'BLOCK') {
      // S10 (R6): authoritative event with no order yet (orderId undefined).
      policyStorage.recordEvent({
        userId,
        sessionId,
        cartId,
        orderId: undefined,
        agent: 'server',
        amountMinor: calculatedTotal,
        currency: currentBusiness.currency,
        evaluation,
        policy,
      });
      const outcome = buildPolicyOutcome(evaluation);
      void emitAutomationEvent('order.policy_blocked', {
        cartId,
        totalMinor: calculatedTotal,
        currency: currentBusiness.currency,
        origin,
        decision: outcome.decision,
        reason: outcome.reason,
      });
      return res.status(403).json({
        error: 'Purchase blocked by policy',
        policyDecision: outcome.decision,
        violations: outcome.violations,
        reason: outcome.reason,
        suggestion: outcome.suggestion,
      });
    }

    // B5: only consume the AI-prepared marker once we are actually proceeding
    // past the authoritative BLOCK decision. A BLOCKed request leaves the marker
    // intact, so a retry is still attributed AI_AGENT (and not silently HUMAN).
    consumeAIPreparedSession(sessionId);

    // S10 (R12): reserve spend against the daily limit BEFORE PayPal. A failure
    // here is a policy enforcement failure (R20) and creates no PayPal order.
    const reservation = dailySpendTracker.tryReserve(
      userId,
      calculatedTotal,
      policy.dailySpendLimitMinor
    );
    if (!reservation) {
      // R20: record an authoritative BLOCK so the dashboard stays truthful.
      const denyEvaluation: PolicyEvaluation = {
        decision: 'BLOCK',
        violations: [
          {
            type: 'DAILY_LIMIT_EXCEEDED',
            rule: 'dailySpendLimitMinor',
            expected: policy.dailySpendLimitMinor,
            actual: calculatedTotal,
            message: `Cart total ${calculatedTotal} exceeds remaining daily budget.`,
          },
        ],
      };
      policyStorage.recordEvent({
        userId,
        sessionId,
        cartId,
        orderId: undefined,
        agent: 'server',
        amountMinor: calculatedTotal,
        currency: currentBusiness.currency,
        evaluation: denyEvaluation,
        policy,
      });
      return res.status(403).json({
        error: 'Purchase blocked by policy',
        policyDecision: 'BLOCK',
        violations: [
          {
            type: 'DAILY_LIMIT_EXCEEDED',
            message: `Cart total ${calculatedTotal} exceeds remaining daily budget.`,
          },
        ],
        reason: 'Cart exceeds daily spend limit',
        suggestion: 'Reduce your cart total or wait for the daily budget to reset.',
      });
    }

    const order = orderService.create(
      sessionId,
      validatedItems,
      currentBusiness.currency,
      origin,
      idempotencyKey,
      createRequestFingerprint(req.body)
    );
    // S10 (R13): server-owned reservation correlation on the typed domain field.
    orderService.setReservationId(order.id, reservation.id);

    // Stage 2: record the allowance that was actually enforced, so the signed
    // Cart Mandate can evidence it. Server-set; never read from the client.
    order.policyAppliedLimits = {
      maxPerPurchaseMinor: policy.maxPerPurchaseMinor,
      dailySpendLimitMinor: policy.dailySpendLimitMinor,
      confirmationThresholdMinor: policy.confirmationThresholdMinor,
      enabled: policy.enabled,
      validUntil: policy.validUntil ? policy.validUntil.toISOString() : null,
    };

    // WRITE-AHEAD: the order (and, queued before it, its reservation) must be durable
    // BEFORE PayPal is contacted. If storage is down nothing was sent to PayPal.
    try {
      await orderService.saveNow(order.id);
    } catch (err: any) {
      console.error(`ORDER_PERSIST_FAILED order=${order.id} error=${err?.message ?? err}`);
      abandonOrder(order.id, reservation.id);
      throw new AppError(503, 'Storage unavailable; order was not created. Please retry.');
    }

    // S10: authoritative ALLOW event correlated to the persisted order.
    policyStorage.recordEvent({
      userId,
      sessionId,
      cartId,
      orderId: order.id,
      agent: 'server',
      amountMinor: order.totalMinor,
      currency: order.currency,
      evaluation,
      policy,
    });

    // FIX #10: item-total invariant. The stored total must match the sum of lines.
    if (calculatedTotal !== order.totalMinor) {
      throw new AppError(500, 'Internal error: total mismatch', {
        calculated: calculatedTotal,
        stored: order.totalMinor,
      });
    }

    const paypalOrder = await startPayPalCheckout(order, reservation.id, idempotencyKey);
    const approvalLink = paypalOrder.links?.find((link: any) => link.rel === 'approve');

    // 201 Created: the documented contract in openapi.json and the Postman collection.
    res.status(201).json(createResponse(order, paypalOrder.id, approvalLink?.href));
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:orderId/capture', requireSession, checkoutLimiter, async (req, res, next) => {
  const { orderId } = req.params;
  let lockHeld = false;
  let dbClaimHeld = false;
  try {
    if (!env.isPayPalEnabled()) {
      throw new AppError(503, 'PayPal not configured');
    }

    const order = orderService.getById(orderId);

    // Ownership: another session's order is indistinguishable from a missing one.
    if (!order || order.sessionId !== req.session!.sessionId) {
      throw new AppError(404, 'Order not found');
    }

    if (!order.paypalOrderId) {
      throw new AppError(400, 'Order has no PayPal order ID');
    }

    // Idempotent retry: a webhook (or an earlier capture) already settled it.
    if (order.status === OrderStatus.PAID) {
      throw new AppError(409, 'Order already captured');
    }

    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      throw new AppError(400, `Order status is ${order.status}, cannot capture`);
    }

    // One capture talking to PayPal at a time per order; also keeps the
    // reservation reconciler away from an order whose capture is mid-flight.
    if (!captureLock.acquire(orderId)) {
      throw new AppError(409, 'Capture already in progress');
    }
    lockHeld = true;

    // Cross-instance guard: the same claim, but in PostgreSQL, so a second application instance cannot
    // run a capture for this order at the same time. A database error fails closed (nothing is sent to
    // PayPal). Without a database only the in-process lock applies (single-instance deployment).
    const repos = getRepos();
    if (repos) {
      let claimed = false;
      try {
        claimed = await repos.captureClaims.tryClaim(orderId, CAPTURE_CLAIM_TTL_MS);
      } catch (err: any) {
        console.error(`CAPTURE_CLAIM_FAILED order=${orderId} error=${err?.message ?? err}`);
        throw new AppError(503, 'Storage unavailable; the payment was not attempted. Please retry.');
      }
      if (!claimed) throw new AppError(409, 'Capture already in progress');
      dbClaimHeld = true;
    }

    // A previous attempt may have reached PayPal even if this process lost the response. Reconcile first and
    // never start a second capture on an ambiguous outcome: only a lookup that proves "APPROVED, no capture
    // yet" (see classifyPayPalOrder) allows a retry, and the retry reuses this order's stable PayPal-Request-Id.
    if (order.captureStartedAt) {
      let previous;
      try {
        previous = await settleFromPayPal(order);
      } catch (err: any) {
        console.warn(`CAPTURE_RECONCILIATION_LOOKUP_FAILED order=${order.id} error=${err?.message ?? err}`);
        throw new AppError(
          502,
          'The previous capture outcome could not be verified; no new capture was attempted.',
          { paypalIssue: 'CAPTURE_RECONCILIATION_REQUIRED', retryable: true }
        );
      }
      if (previous.state === 'COMPLETED') {
        try {
          await orderService.saveNow(order.id);
        } catch (err: any) {
          console.error(`ORDER_PERSIST_FAILED_AFTER_CAPTURE order=${order.id} error=${err?.message ?? err}`);
        }
        const settled = orderService.getById(order.id) ?? order;
        res.json({
          orderId: order.id,
          status: settled.status,
          paypalCaptureId: settled.paypalCaptureId ?? previous.captureId,
          paypalStatus: previous.rawStatus,
        });
        return;
      }
      if (previous.state === 'DECLINED') {
        try {
          await orderService.saveNow(order.id);
        } catch (err: any) {
          console.error(`ORDER_PERSIST_FAILED_AFTER_CAPTURE order=${order.id} error=${err?.message ?? err}`);
        }
        throw new AppError(402, 'Payment declined', { paypalIssue: 'CAPTURE_DECLINED' });
      }
      if (previous.state === 'IN_PROGRESS' && previous.rawStatus === 'APPROVED') {
        // PayPal confirmed there is no capture yet: fall through to the capture call below.
      } else if (previous.state === 'NOT_APPROVED' || previous.state === 'IN_PROGRESS') {
        throw new AppError(
          400,
          'Order not approved yet. Approve the payment in PayPal, then retry.',
          { paypalIssue: 'ORDER_NOT_APPROVED', retryable: true }
        );
      } else {
        const mismatch = previous.state === 'AMOUNT_MISMATCH';
        throw new AppError(
          502,
          mismatch
            ? 'Captured amount does not match the order; the payment is held for review.'
            : 'The previous capture is not verified; the payment remains held for review.',
          {
            paypalIssue: mismatch ? 'CAPTURE_AMOUNT_MISMATCH' : 'CAPTURE_RECONCILIATION_REQUIRED',
            retryable: true,
          }
        );
      }
    }

    // FIX #6: map PayPal errors to HTTP status codes.
    let capture: any;
    let definitiveFailure = false;
    let definitiveSuccess = false;
    let captureId = 'unknown';
    let paypalStatus: any;

    // WRITE-AHEAD: persist "a capture attempt is starting" BEFORE PayPal is contacted.
    // If the process dies after PayPal captured but before we record it, startup
    // reconciliation (reconcileAfterRestart) asks PayPal and finishes the job. The
    // status itself is NEVER taken from the client: only PayPal's response, a verified
    // webhook, or a PayPal lookup can move an order to PAID.
    orderService.markCaptureStarted(order.id);
    try {
      await orderService.saveNow(order.id);
    } catch (err: any) {
      console.error(`ORDER_PERSIST_FAILED order=${order.id} error=${err?.message ?? err}`);
      throw new AppError(503, 'Storage unavailable; the payment was not attempted. Please retry.');
    }

    try {
      capture = await paypalClient.captureOrder(
        order.paypalOrderId,
        // Stable per order: a retry of the SAME capture must carry the same PayPal-Request-Id so PayPal can
        // de-duplicate it (PayPal keeps a key for a limited time; the reconcile-first step above is what
        // protects against a second capture after that window).
        `capture-${orderId}`
      );
      captureId =
        capture?.purchaseUnits?.[0]?.payments?.captures?.[0]?.id || 'unknown';
      paypalStatus = capture?.status;
    } catch (err: any) {
      const paypalIssue = extractPayPalIssue(err);

      if (paypalIssue === 'ORDER_ALREADY_CAPTURED') {
        // A previous capture succeeded at PayPal but we never saw the result
        // (lost response / restart). Settle from PayPal's real state so the
        // order becomes PAID and the reservation is confirmed; best effort.
        let settled = false;
        try {
          const classification = await settleFromPayPal(order);
          settled = classification.state === 'COMPLETED';
        } catch {
          // Lookup failed: leave everything untouched; the webhook or the
          // reservation reconciler will settle it.
        }
        throw new AppError(409, 'Order already captured', { settled });
      }
      if (paypalIssue === 'INSTRUMENT_DECLINED') {
        // R15: a declined instrument is a definitive PayPal failure.
        definitiveFailure = true;
        paypalStatus = 'DECLINED';
      } else if (paypalIssue === 'ORDER_NOT_APPROVED') {
        // The buyer has not approved yet (e.g. the app captured too early).
        // This is RECOVERABLE: do not fail the order and do not touch the
        // reservation; the client may approve in PayPal and retry. If the buyer
        // never approves, the reservation TTL/reconciler cleans it up.
        throw new AppError(
          400,
          'Order not approved yet. Approve the payment in PayPal, then retry.',
          { paypalIssue: 'ORDER_NOT_APPROVED', retryable: true }
        );
      } else {
        // R15: ambiguous transport/network error — do NOT release the reservation,
        // because the capture may have succeeded remotely.
        // Priority 2 (Checkout Rescue): explain the wait honestly and keep the cart.
        throw new AppError(
          502,
          'PayPal could not be reached. Your cart is saved; please wait about 30 seconds and try again.',
          {
            paypalIssue,
            code: 'PAYPAL_BUSY',
            retryable: true,
            retryAfterSeconds: 30,
            suggestion: 'Wait about 30 seconds, then retry. Your cart is saved.',
            alternativePayment: 'You can also try a card or another payment method.',
            cartSaved: true,
          }
        );
      }
    }

    // Classify a returned (non-thrown) capture result.
    if (capture) {
      if (paypalStatus === 'COMPLETED') {
        // Defence in depth: the amount PayPal ACTUALLY captured must equal the
        // server-owned total in the server-owned currency, exactly like the
        // signed webhook path (src/routes/webhooks.ts). Money that moved for a
        // different amount must not release goods: the order is left
        // PAYMENT_PENDING (held for review, reservation untouched) and the
        // mismatch is logged loudly. 502 (not 200) because this is a synchronous
        // request whose outcome the merchant must see.
        let verdict = validateCompletedCapture(order, capture);
        if (verdict === 'unknown') {
          // The capture answer lacked complete evidence (status, amount or currency). Ask PayPal for the real
          // order state: the lookup applies the same gate and marks PAID only on an exact match.
          try {
            const looked = await settleFromPayPal(order);
            if (looked.state === 'COMPLETED') {
              verdict = 'match';
              if (looked.captureId) captureId = looked.captureId;
            } else if (looked.state === 'AMOUNT_MISMATCH') {
              verdict = 'mismatch';
            }
          } catch (err: any) {
            console.warn(`CAPTURE_EVIDENCE_LOOKUP_FAILED order=${order.id} error=${err?.message ?? err}`);
          }
        }
        if (verdict !== 'match') {
          const mismatch = verdict === 'mismatch';
          console.error(
            `${mismatch ? 'PAYMENT_AMOUNT_MISMATCH' : 'PAYMENT_CAPTURE_EVIDENCE_INCOMPLETE'} ` +
              `order=${order.id} paypalOrder=${order.paypalOrderId} ` +
              `expected=${(order.totalMinor / 100).toFixed(2)} ${order.currency} ` +
              `got=${describeCapturedAmount(extractCapturedAmount(capture))}`
          );
          throw new AppError(
            502,
            mismatch
              ? 'Captured amount does not match the order; the payment is held for review.'
              : 'Capture status, amount or currency could not be verified; the payment is held for review.',
            { paypalIssue: mismatch ? 'CAPTURE_AMOUNT_MISMATCH' : 'CAPTURE_EVIDENCE_INCOMPLETE' }
          );
        }
        definitiveSuccess = true;
      } else if (paypalStatus === 'DECLINED' || paypalStatus === 'FAILED') {
        definitiveFailure = true;
      }
      // PENDING or other returned statuses are ambiguous — leave the reservation.
    }

    orderService.setPayPalCaptureResult(order.id, captureId, paypalStatus);

    // S10 (R15/R16): tie the daily-spend reservation to the definitive capture
    // outcome. Success -> confirm (pending -> spent); definitive failure ->
    // cancel; ambiguous (network / pending) -> leave untouched. Both calls are
    // idempotent, so a webhook racing this response cannot double count.
    if (definitiveSuccess) {
      markOrderPaid(order, captureId !== 'unknown' ? captureId : undefined);
    } else if (definitiveFailure) {
      markOrderPaymentFailed(order);
    }

    // Money has moved (or been refused) at PayPal: record it durably. A failure here
    // must NOT turn into an error response; the in-memory state is already correct and
    // the dirty-retry + restart reconciliation will converge the database.
    try {
      await orderService.saveNow(order.id);
    } catch (err: any) {
      console.error(`ORDER_PERSIST_FAILED_AFTER_CAPTURE order=${order.id} error=${err?.message ?? err}`);
    }

    if (definitiveFailure) {
      const isDeclined = paypalStatus === 'DECLINED';
      throw new AppError(
        isDeclined ? 402 : 400,
        isDeclined ? 'Payment declined' : 'Payment failed'
      );
    }

    const settledOrder = orderService.getById(order.id) ?? order;
    res.json({
      orderId: order.id,
      status: settledOrder.status,
      paypalCaptureId: settledOrder.paypalCaptureId ?? captureId,
      paypalStatus,
    });
  } catch (err) {
    next(err);
  } finally {
    if (lockHeld) captureLock.release(orderId);
    if (dbClaimHeld) {
      // Best effort: a stale claim expires on its own after CAPTURE_CLAIM_TTL_MS.
      getRepos()?.captureClaims.release(orderId).catch(() => undefined);
    }
  }
});

// Explicit buyer/app cancellation of a not-yet-captured checkout. Releases the
// daily-spend reservation, but only after PayPal confirms nothing was captured.
// NOTE: like /capture this endpoint is not user-authenticated yet (Step 2).
router.post('/orders/:orderId/cancel', requireSession, async (req, res, next) => {
  const { orderId } = req.params;
  try {
    if (!env.isPayPalEnabled()) {
      throw new AppError(503, 'PayPal not configured');
    }
    const order = orderService.getById(orderId);
    if (!order || order.sessionId !== req.session!.sessionId) {
      throw new AppError(404, 'Order not found');
    }
    if (order.status === OrderStatus.PAID) {
      throw new AppError(409, 'Order already captured');
    }
    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      // Already failed/cancelled: idempotent success.
      return res.json({ orderId: order.id, status: order.status });
    }
    if (captureLock.isHeld(order.id)) {
      throw new AppError(409, 'Capture in progress; cannot cancel');
    }

    if (order.paypalOrderId) {
      let classification;
      try {
        classification = await settleFromPayPal(order);
      } catch {
        // Cannot prove nothing was captured: do not release.
        throw new AppError(502, 'Could not verify PayPal order state; try again');
      }
      if (classification.state === 'COMPLETED') {
        throw new AppError(409, 'Order already captured', { settled: true });
      }
      if (classification.state === 'DECLINED') {
        return res.json({
          orderId: order.id,
          status: (orderService.getById(order.id) ?? order).status,
        });
      }
      if (classification.state === 'CAPTURE_PENDING') {
        throw new AppError(409, 'Payment is pending at PayPal; cannot cancel');
      }
    }

    cancelUncapturedOrder(order, 'cancel');
    await orderService.saveNow(order.id).catch((err: any) =>
      console.error(`ORDER_PERSIST_FAILED order=${order.id} error=${err?.message ?? err}`)
    );
    res.json({ orderId: order.id, status: (orderService.getById(order.id) ?? order).status });
  } catch (err) {
    next(err);
  }
});

// Dashboard rows are private by default through requireDashboardAccess. The
// sanitized public demo is an explicit DASHBOARD_PUBLIC=true opt-in; never enable
// it for a deployment containing real customer data.
router.get('/orders/pending', requireSession, (req, res, next) => {
  try {
    const rawToken = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
    if (typeof rawToken !== 'string' || rawToken.length === 0 || rawToken.length > 256) {
      throw new AppError(400, 'token is required');
    }
    const { sessionId } = req.session!;
    const pending = orderService.getAll().find((order) =>
      order.sessionId === sessionId &&
      order.paypalOrderId === rawToken &&
      order.status === OrderStatus.PAYMENT_PENDING
    );
    if (!pending) throw new AppError(404, 'Pending order not found');
    res.json(createResponse(pending, rawToken));
  } catch (err) {
    next(err);
  }
});

router.get('/orders', requireDashboardAccess, (req, res, next) => {
  try {
    const VALID_ORIGINS = Object.values(OrderOrigin);
    const VALID_STATUSES = Object.values(OrderStatus);

    const rawOrigin = Array.isArray(req.query.origin) ? req.query.origin[0] : req.query.origin;
    const rawStatus = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;

    if (rawLimit !== undefined) {
      const parsed = Number(rawLimit);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        throw new AppError(400, 'limit must be an integer between 1 and 100');
      }
    }

    if (rawOrigin !== undefined && !VALID_ORIGINS.includes(rawOrigin as OrderOrigin)) {
      throw new AppError(400, `Invalid origin. Valid values: ${VALID_ORIGINS.join(', ')}`);
    }
    if (rawStatus !== undefined && !VALID_STATUSES.includes(rawStatus as OrderStatus)) {
      throw new AppError(400, `Invalid status. Valid values: ${VALID_STATUSES.join(', ')}`);
    }

    let filtered = orderService.getAll();
    if (rawOrigin) filtered = filtered.filter((order) => order.origin === rawOrigin);
    if (rawStatus) filtered = filtered.filter((order) => order.status === rawStatus);

    filtered.sort((a, b) => {
      const byCreated = b.createdAt.getTime() - a.createdAt.getTime();
      return byCreated !== 0 ? byCreated : b.id.localeCompare(a.id);
    });

    const limit = rawLimit !== undefined ? Number(rawLimit) : 100;
    const limited = filtered.slice(0, limit);

    const orders = limited.map((order) => ({
      id: order.id,
      // Public, read-only endpoint: only a non-reversible label, never the real id.
      sessionId: publicSessionRef(order.sessionId),
      status: order.status,
      origin: order.origin,
      totalMinor: order.totalMinor,
      totalFormatted: formatMoney(order.totalMinor, order.currency, currentBusiness.locale),
      currency: order.currency,
      itemCount: order.items.length,
      // Public, read-only endpoint: do NOT expose the real PayPal order/capture
      // identifiers (B1). They remain available on the authenticated create
      // response and server-side only.
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        lineTotalMinor: item.lineTotalMinor,
        lineTotalFormatted: formatMoney(item.lineTotalMinor, order.currency, currentBusiness.locale),
      })),
    }));

    res.json({ orders, total: filtered.length, returned: orders.length });
  } catch (err) {
    next(err);
  }
});

// Aggregate-only demo endpoint (no per-order rows); private when DASHBOARD_PUBLIC=false.
router.get('/orders/stats', requireDashboardAccess, (_req, res) => {
  res.json(orderService.getStats(
      (orderId) => refundService.refundedMinor(orderId),
      (orderId) => refundService.pendingMinor(orderId)
    ));
});

export default router;

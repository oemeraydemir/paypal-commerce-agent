import { Router } from 'express';
import { paypalClient } from '../paypal/client';
import { OrderService, createRequestFingerprint } from '../orders/service';
import { validateOrderItems } from '../orders/validation';
import { CatalogService } from '../catalog/service';
import { AppError } from '../middleware/error-handler';
import { env } from '../config/environment';
import { idempotency } from '../middleware/idempotency';
import { currentBusiness } from '../config/business-config';
import { OrderOrigin, OrderStatus, createCartId } from '../orders/domain';
import { formatMoney } from '../utils/money';
import { consumeAIPreparedSession } from '../ai/session-tracker';
import { getDemoUserId, defaultPolicy } from '../policy/default-policy';
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

router.post('/orders/create', idempotency, async (req, res, next) => {
  try {
    if (!env.isPayPalEnabled()) {
      throw new AppError(503, 'PayPal not configured');
    }

    const { sessionId, items } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!sessionId || !Array.isArray(items)) {
      throw new AppError(400, 'sessionId and items array required');
    }

    // FIX #9 + #12: authoritative pricing, currency + quantity validation.
    const validatedItems = validateOrderItems(items, catalogService);
    const calculatedTotal = validatedItems.reduce(
      (sum, item) => sum + item.lineTotalMinor,
      0
    );

    // FIX #7: server decides the origin. Client never sends it.
    // If this session has a previously prepared AI cart, attribute as AI_AGENT.
    const isAIPrepared = consumeAIPreparedSession(sessionId);
    const origin = isAIPrepared ? OrderOrigin.AI_AGENT : OrderOrigin.HUMAN;

    // S10 (R2/R6): deterministic cart correlation shared by advisory and
    // authoritative PolicyEvents (sessionId + item selection).
    const userId = getDemoUserId();
    const cartId = createCartId(sessionId, validatedItems);
    let policy = policyStorage.getPolicy(userId);
    if (!policy) {
      policy = defaultPolicy;
      policyStorage.setPolicy(defaultPolicy);
    }

    // S10 (R9/R10): AUTHORITATIVE policy evaluation on an in-memory snapshot
    // BEFORE the order is persisted or PayPal is contacted. The client's
    // policyDecision/violations/origin/reservationId are NEVER trusted.
    const evaluation = policyService.evaluatePurchase(
      buildEvaluationOrder(
        sessionId,
        validatedItems,
        calculatedTotal,
        currentBusiness.currency,
        origin
      ),
      policy,
      buildPolicyContext(userId, currentBusiness.businessId, dailySpendTracker)
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
      return res.status(403).json({
        error: 'Purchase blocked by policy',
        policyDecision: outcome.decision,
        violations: outcome.violations,
        reason: outcome.reason,
        suggestion: outcome.suggestion,
      });
    }

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
    order.reservationId = reservation.id;

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

    // Convert minor units → decimal string for PayPal.
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
              description: 'AI Café Order',
              amount: {
                currencyCode: order.currency,
                value: totalValue,
                breakdown: {
                  itemTotal: {
                    currencyCode: order.currency,
                    value: totalValue,
                  },
                },
              },
              items: validatedItems.map((item) => ({
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
      dailySpendTracker.cancelReservation(reservation.id);
      orderService.updateStatus(order.id, OrderStatus.ORDER_CANCELLED);
      throw err;
    }

    orderService.setPayPalOrderId(order.id, paypalOrder.id);

    const approvalLink = paypalOrder.links?.find((link: any) => link.rel === 'approve');

    res.json({
      orderId: order.id,
      paypalOrderId: paypalOrder.id,
      status: order.status,
      origin: order.origin,
      totalMinor: order.totalMinor,
      totalFormatted: formatMoney(order.totalMinor, order.currency, currentBusiness.locale),
      currency: order.currency,
      approvalUrl: approvalLink?.href,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/orders/:orderId/capture', async (req, res, next) => {
  const { orderId } = req.params;
  let lockHeld = false;
  try {
    if (!env.isPayPalEnabled()) {
      throw new AppError(503, 'PayPal not configured');
    }

    const order = orderService.getById(orderId);

    if (!order) {
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

    // FIX #6: map PayPal errors to HTTP status codes.
    let capture: any;
    let definitiveFailure = false;
    let definitiveSuccess = false;
    let captureId = 'unknown';
    let paypalStatus: any;

    try {
      capture = await paypalClient.captureOrder(
        order.paypalOrderId,
        `capture-${orderId}-${Date.now()}`
      );
      captureId =
        capture?.purchaseUnits?.[0]?.payments?.captures?.[0]?.id || 'unknown';
      paypalStatus = capture?.status;
    } catch (err: any) {
      const paypalIssue = err?.details?.[0]?.issue;

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
        throw new AppError(502, 'PayPal error', { paypalIssue });
      }
    }

    // Classify a returned (non-thrown) capture result.
    if (capture) {
      if (paypalStatus === 'COMPLETED') {
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
  }
});

// Explicit buyer/app cancellation of a not-yet-captured checkout. Releases the
// daily-spend reservation, but only after PayPal confirms nothing was captured.
// NOTE: like /capture this endpoint is not user-authenticated yet (Step 2).
router.post('/orders/:orderId/cancel', async (req, res, next) => {
  const { orderId } = req.params;
  try {
    if (!env.isPayPalEnabled()) {
      throw new AppError(503, 'PayPal not configured');
    }
    const order = orderService.getById(orderId);
    if (!order) {
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
    res.json({ orderId: order.id, status: (orderService.getById(order.id) ?? order).status });
  } catch (err) {
    next(err);
  }
});

router.get('/orders', (req, res, next) => {
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
      sessionId: order.sessionId,
      status: order.status,
      origin: order.origin,
      totalMinor: order.totalMinor,
      totalFormatted: formatMoney(order.totalMinor, order.currency, currentBusiness.locale),
      currency: order.currency,
      itemCount: order.items.length,
      paypalOrderId: order.paypalOrderId ?? null,
      paypalCaptureId: order.paypalCaptureId ?? null,
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

router.get('/orders/stats', (_req, res) => {
  res.json(orderService.getStats());
});

export default router;

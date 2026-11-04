import { sessionRateLimit } from '../middleware/rate-limit';
import { Router } from 'express';
import { CatalogService } from '../catalog/service';
import { currentBusiness } from '../config/business-config';
import { requireSession } from '../middleware/session-auth';
import { validateOrderItems } from '../orders/validation';
import { OrderOrigin } from '../orders/domain';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import { buildEvaluationOrder, buildPolicyContext, buildPolicyOutcome } from '../policy/context-builder';
import { PolicyViolationType } from '../policy/domain';
import { policyService } from '../policy/service';
import { policyStorage } from '../policy/storage';
import { shopperGuardStore } from '../policy/shopper-guard';
import { formatMoney } from '../utils/money';
import { buildTransactionPassport } from '../passport/builder';

// 120 previews per minute per session, 600 per IP.
const previewLimiter = sessionRateLimit(120, 600);

// POST /api/policy/preview
//
// Explains what the AUTHORITATIVE policy engine will decide for a cart, BEFORE any order or PayPal
// call exists. It runs the exact same code path as POST /api/orders/create (same validation, same
// PolicyService, same per-user policy and daily-spend state), so the preview can never disagree
// with the enforcement point. It is deliberately side-effect free: no order, no reservation, no
// PayPal call, no PolicyEvent (the dashboard audit trail only records real enforcement decisions).
// The preview is advisory UX; /orders/create re-evaluates and remains the only authority.
const router = Router();
const catalogService = new CatalogService();

type CheckStatus = 'pass' | 'confirm' | 'fail';
interface PolicyCheck {
  rule: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const money = (minor: number) => formatMoney(minor, currentBusiness.currency, currentBusiness.locale);

router.post('/policy/preview', requireSession, previewLimiter, (req, res, next) => {
  try {
    const { sessionId, userId } = req.session!;
    const policy = policyStorage.getOrCreatePolicy(userId);
    const spent = dailySpendTracker.getSpentToday(userId);
    const pending = dailySpendTracker.getPendingReservations(userId);

    const limits = {
      currency: currentBusiness.currency,
      maxPerPurchaseMinor: policy.maxPerPurchaseMinor,
      confirmationThresholdMinor: policy.confirmationThresholdMinor,
      dailySpendLimitMinor: policy.dailySpendLimitMinor,
      dailySpentMinor: spent,
      dailyPendingMinor: pending,
      dailyRemainingMinor: Math.max(0, policy.dailySpendLimitMinor - spent - pending),
      blockedDietaryAttributes: policy.blockedDietaryAttributes,
      policyEnabled: policy.enabled,
      validUntil: policy.validUntil ? policy.validUntil.toISOString() : null,
      updatedAt: policy.updatedAt.toISOString(),
      allowedMerchantIds: policy.allowedMerchantIds,
      blockedCategoryIds: policy.blockedCategoryIds,
    };

    const rawItems = req.body?.items;
    // An empty cart is a valid question ("what are my limits?"), not an error.
    if (Array.isArray(rawItems) && rawItems.length === 0) {
      res.json({ empty: true, decision: null, limits, enforcedBy: 'server' });
      return;
    }

    const items = validateOrderItems(rawItems, catalogService);
    const totalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);

    const evaluation = policyService.evaluatePurchase(
      buildEvaluationOrder(sessionId, items, totalMinor, currentBusiness.currency, OrderOrigin.HUMAN),
      policy,
      buildPolicyContext(userId, currentBusiness.businessId, dailySpendTracker)
    );
    const outcome = buildPolicyOutcome(evaluation);
    const has = (type: PolicyViolationType) => evaluation.violations.some((v) => v.type === type);
    const msg = (type: PolicyViolationType) => evaluation.violations.find((v) => v.type === type)?.message;

    const blockedAttrs = new Set(policy.blockedDietaryAttributes);
    const flagged = items
      .map((item) => catalogService.getById(item.productId))
      .filter((p) => p && p.dietary.some((d) => blockedAttrs.has(d)))
      .map((p) => p!.name);

    const checks: PolicyCheck[] = [
      {
        rule: 'maxPerPurchase',
        label: `Per-purchase limit ${money(policy.maxPerPurchaseMinor)}`,
        status: has('MAX_PURCHASE_EXCEEDED') ? 'fail' : 'pass',
        detail: has('MAX_PURCHASE_EXCEEDED')
          ? `${money(totalMinor)} is ${money(totalMinor - policy.maxPerPurchaseMinor)} over the limit.`
          : `${money(totalMinor)} of ${money(policy.maxPerPurchaseMinor)}.`,
      },
      {
        rule: 'confirmationThreshold',
        label: `Approval threshold ${money(policy.confirmationThresholdMinor)}`,
        status: has('CONFIRMATION_THRESHOLD_EXCEEDED') ? 'confirm' : 'pass',
        detail: has('CONFIRMATION_THRESHOLD_EXCEEDED')
          ? 'Above the threshold: you must explicitly approve this payment.'
          : 'Under the threshold: no extra confirmation needed.',
      },
      {
        rule: 'dailyBudget',
        label: `Daily budget ${money(policy.dailySpendLimitMinor)}`,
        status: has('DAILY_LIMIT_EXCEEDED') ? 'fail' : 'pass',
        detail: has('DAILY_LIMIT_EXCEEDED')
          ? (msg('DAILY_LIMIT_EXCEEDED') as string)
          : `${money(limits.dailyRemainingMinor)} remaining today before this cart.`,
      },
      {
        rule: 'blockedDietary',
        label: policy.blockedDietaryAttributes.length
          ? `Blocked: ${policy.blockedDietaryAttributes.join(', ')}`
          : 'No blocked product attributes',
        status: has('DIETARY_ATTRIBUTE_BLOCKED') ? 'fail' : 'pass',
        detail: has('DIETARY_ATTRIBUTE_BLOCKED')
          ? `${flagged.join(', ')} conflicts with your policy.`
          : 'No item conflicts with your policy.',
      },
      {
        rule: 'merchant',
        label: 'Approved merchant',
        status: has('MERCHANT_NOT_ALLOWED') ? 'fail' : 'pass',
        detail: has('MERCHANT_NOT_ALLOWED') ? (msg('MERCHANT_NOT_ALLOWED') as string) : `${currentBusiness.name} is on your allow-list.`,
      },
    ];

    // Wellbeing Guard row: only when the shopper has set a diet or allergen concern.
    const previewGuard = shopperGuardStore.get(userId);
    if (previewGuard) {
      const conflict = has('GUARD_ALLERGEN_CONFLICT') || has('GUARD_DIET_NOT_MET');
      const unverified = has('GUARD_ALLERGEN_UNVERIFIED');
      const parts: string[] = [];
      if (previewGuard.diets.length) parts.push(previewGuard.diets.join(' + '));
      if (previewGuard.allergens.length) parts.push(`avoid ${previewGuard.allergens.join(', ')}`);
      const details = evaluation.violations
        .filter((v) => v.type.startsWith('GUARD_'))
        .map((v) => v.message);
      checks.push({
        rule: 'wellbeingGuard',
        label: `Wellbeing Guard: ${parts.join(' · ')}`,
        status: conflict ? 'fail' : unverified ? 'confirm' : 'pass',
        ...(evaluation.guardDataVersion ? { dataVersion: evaluation.guardDataVersion } : {}),
        detail: details.length
          ? details.join(' ')
          : 'No conflict with the café-declared labels. Declarations are unverified.',
      });
    }

    res.json({
      empty: false,
      decision: outcome.decision,
      reason: outcome.reason,
      suggestion: outcome.suggestion,
      requiresExplicitApproval: outcome.requiresExplicitApproval,
      totalMinor,
      totalFormatted: money(totalMinor),
      remainingPerPurchaseMinor: policy.maxPerPurchaseMinor - totalMinor,
      currency: currentBusiness.currency,
      checks,
      violations: outcome.violations,
      limits,
      // Additive, derived-only explanation of this cart (see src/passport/builder.ts).
      passport: buildTransactionPassport({
        items,
        totalMinor,
        currency: currentBusiness.currency,
        decision: outcome.decision as 'AUTO_ALLOW' | 'REQUIRE_CONFIRMATION' | 'BLOCK',
        maxPerPurchaseMinor: policy.maxPerPurchaseMinor,
        confirmationThresholdMinor: policy.confirmationThresholdMinor,
        dailyRemainingMinor: limits.dailyRemainingMinor,
        checks,
        hasWellbeingGuard: !!previewGuard,
      }),
      enforcedBy: 'server',
    });
  } catch (err) {
    next(err);
  }
});

export default router;

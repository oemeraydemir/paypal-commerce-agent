import { CatalogService } from '../catalog/service';
import { Order } from '../orders/domain';
import {
  PolicyDecision,
  PolicyEvaluation,
  PolicyEvaluationContext,
  PolicyViolation,
  PurchasePolicy,
} from './domain';
import * as crypto from 'crypto';
import { productDataVersion } from './shopper-guard';
import type { GuardAllergen } from './shopper-guard';

// Human-readable money for violation messages (these reach the shopper and the dashboard).
// Never show raw minor units such as "1700".
const eur = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
};

export class PolicyService {
  constructor(private readonly catalogService: CatalogService) {}

  evaluatePurchase(
    order: Order,
    policy: PurchasePolicy,
    context: PolicyEvaluationContext
  ): PolicyEvaluation {
    const validUntil = policy.validUntil;
    const allowanceExpired = validUntil instanceof Date && validUntil.getTime() <= Date.now();
    if (!policy.enabled && !allowanceExpired) {
      return { decision: 'AUTO_ALLOW', violations: [] };
    }
    if (allowanceExpired) {
      return {
        decision: 'BLOCK',
        violations: [
          {
            type: 'ALLOWANCE_EXPIRED',
            rule: 'validUntil',
            expected: (validUntil as Date).toISOString(),
            actual: new Date().toISOString(),
            message: 'The spending allowance has expired; no purchases are allowed.',
          },
        ],
      };
    }

    const violations: PolicyViolation[] = [];

    if (policy.currency !== order.currency) {
      violations.push({
        type: 'CURRENCY_MISMATCH',
        rule: 'currency',
        expected: policy.currency,
        actual: order.currency,
        message: `Order currency ${order.currency} does not match policy currency ${policy.currency}.`,
      });
    }

    if (
      policy.allowedMerchantIds.length > 0 &&
      !policy.allowedMerchantIds.includes(context.merchantId)
    ) {
      violations.push({
        type: 'MERCHANT_NOT_ALLOWED',
        rule: 'allowedMerchantIds',
        expected: policy.allowedMerchantIds,
        actual: context.merchantId,
        message: `Merchant ${context.merchantId} is not allowed by this policy.`,
      });
    }

    if (order.totalMinor > policy.maxPerPurchaseMinor) {
      violations.push({
        type: 'MAX_PURCHASE_EXCEEDED',
        rule: 'maxPerPurchaseMinor',
        expected: policy.maxPerPurchaseMinor,
        actual: order.totalMinor,
        message: `Order total ${eur(order.totalMinor, order.currency)} exceeds the per-purchase limit ${eur(policy.maxPerPurchaseMinor, order.currency)}.`,
      });
    }

    const projectedDailySpendMinor =
      context.currentDailySpendMinor +
      context.pendingReservationsMinor +
      order.totalMinor;
    if (projectedDailySpendMinor > policy.dailySpendLimitMinor) {
      violations.push({
        type: 'DAILY_LIMIT_EXCEEDED',
        rule: 'dailySpendLimitMinor',
        expected: policy.dailySpendLimitMinor,
        actual: projectedDailySpendMinor,
        message: `Projected daily spend ${eur(projectedDailySpendMinor, order.currency)} exceeds the daily limit ${eur(policy.dailySpendLimitMinor, order.currency)}.`,
      });
    }

    const products = order.items.map((item) => {
      const product = this.catalogService.getById(item.productId);
      if (!product) {
        throw new Error(
          `Cannot evaluate purchase policy: product ${item.productId} is not available in the catalog.`
        );
      }
      return product;
    });

    for (const product of products) {
      if (policy.blockedCategoryIds.includes(product.category)) {
        violations.push({
          type: 'CATEGORY_BLOCKED',
          rule: 'blockedCategoryIds',
          expected: policy.blockedCategoryIds,
          actual: product.category,
          message: `Product ${product.id} belongs to blocked category ${product.category}.`,
        });
      }

    }

    // Priority 4: per-category budget for THIS cart (e.g. "alcohol max EUR 5").
    // Only the shopper's own cart is considered, so the limit is deterministic.
    if (policy.categorySpendLimits) {
      const spentByCategory = new Map<string, number>();
      order.items.forEach((item, index) => {
        const product = products[index];
        if (!product) return;
        spentByCategory.set(
          product.category,
          (spentByCategory.get(product.category) ?? 0) + item.lineTotalMinor
        );
      });
      for (const [category, limitMinor] of Object.entries(policy.categorySpendLimits)) {
        const spentMinor = spentByCategory.get(category) ?? 0;
        if (spentMinor > limitMinor) {
          violations.push({
            type: 'CATEGORY_SPEND_LIMIT_EXCEEDED',
            rule: `categorySpendLimits.${category}`,
            expected: limitMinor,
            actual: spentMinor,
            message: `Category ${category} subtotal ${eur(spentMinor, order.currency)} exceeds its limit ${eur(limitMinor, order.currency)}.`,
          });
        }
      }
    }

    for (const product of products) {
      const missingDietaryAttributes = policy.requiredDietaryAttributes.filter(
        (attribute) => !product.dietary.includes(attribute)
      );
      if (missingDietaryAttributes.length > 0) {
        violations.push({
          type: 'DIETARY_REQUIREMENT_NOT_MET',
          rule: 'requiredDietaryAttributes',
          expected: policy.requiredDietaryAttributes,
          actual: product.dietary,
          message: `Product ${product.id} is missing required dietary attributes: ${missingDietaryAttributes.join(', ')}.`,
        });
      }

    }

    for (const product of products) {
      const blockedDietaryAttributes = product.dietary.filter((attribute) =>
        policy.blockedDietaryAttributes.includes(attribute)
      );
      if (blockedDietaryAttributes.length > 0) {
        violations.push({
          type: 'DIETARY_ATTRIBUTE_BLOCKED',
          rule: 'blockedDietaryAttributes',
          expected: policy.blockedDietaryAttributes,
          actual: product.dietary,
          message: `Product ${product.id} contains blocked dietary attributes: ${blockedDietaryAttributes.join(', ')}.`,
        });
      }
    }

    // Wellbeing Guard (set by the shopper's own session, enforced here, never by the AI).
    //  - diet: every item must carry a matching catalog diet label (vegetarian accepts vegan);
    //  - allergens: an item whose DECLARED allergens include a concern is a hard conflict (blocked);
    //  - an item with NO allergen declaration (or any UNKNOWN status) is "unknown", never
    //    "allergen-free" -> the shopper must explicitly confirm (handled by the route via
    //    requireAllergenAcknowledgement). All allergen data is declared by the business and unverified.
    //  NOTE: Merged's catalog stores allergens on product.wellbeing.allergens (a Record keyed by
    //  allergen name), unlike the flat string[] assumed elsewhere, so we read it from there.
    const guard = context.shopperGuard;
    if (guard) {
      for (const product of products) {
        for (const diet of guard.diets?.length ? guard.diets : guard.diet ? [guard.diet] : []) {
          const labels = product.dietary;
          const ok =
            diet === 'vegetarian'
              ? labels.includes('vegetarian') || labels.includes('vegan')
              : labels.includes(diet);
          if (!ok) {
            violations.push({
              type: 'GUARD_DIET_NOT_MET',
              rule: 'shopperGuard.diet',
              expected: diet,
              actual: product.dietary,
              message: `${product.name} is not labelled ${diet} (your Wellbeing Guard diet).`,
            });
          }
        }
        if (guard.allergens.length > 0) {
          const declared = product.wellbeing?.allergens;
          const isUndeclared = !declared || Object.values(declared).some((a) => a.status === 'UNKNOWN');
          if (isUndeclared) {
            violations.push({
              type: 'GUARD_ALLERGEN_UNVERIFIED',
              rule: 'shopperGuard.allergens',
              expected: guard.allergens,
              actual: 'undeclared',
              message: `${product.name}: the café has not declared allergen information, so it cannot be checked against your concerns. Confirm only if you have verified it.`,
            });
          } else {
            const declaredNames = Object.keys(declared);
            const hits = declaredNames.filter((a) => guard.allergens.includes(a as GuardAllergen));
            if (hits.length > 0) {
              violations.push({
                type: 'GUARD_ALLERGEN_CONFLICT',
                rule: 'shopperGuard.allergens',
                expected: guard.allergens,
                actual: declaredNames,
                message: `${product.name} is declared by the café to contain: ${hits.join(', ')} (your Wellbeing Guard concern).`,
              });
            }
          }
        }
      }
    }

    if (order.totalMinor > policy.confirmationThresholdMinor) {
      violations.push({
        type: 'CONFIRMATION_THRESHOLD_EXCEEDED',
        rule: 'confirmationThresholdMinor',
        expected: policy.confirmationThresholdMinor,
        actual: order.totalMinor,
        message: `Order total ${eur(order.totalMinor, order.currency)} exceeds the confirmation threshold ${eur(policy.confirmationThresholdMinor, order.currency)}.`,
      });
    }

    // Priority 4: quiet-hours cap (e.g. "23:00-06:00 max EUR 10"). Evaluated in
    // UTC for determinism; a start hour greater than the end hour wraps midnight.
    if (policy.nightWindow) {
      const now = context.now ?? new Date();
      const hour = now.getUTCHours();
      const { startHour, endHour, maxMinor } = policy.nightWindow;
      const inWindow =
        startHour <= endHour
          ? hour >= startHour && hour < endHour
          : hour >= startHour || hour < endHour;
      if (inWindow && order.totalMinor > maxMinor) {
        violations.push({
          type: 'TIME_WINDOW_LIMIT_EXCEEDED',
          rule: 'nightWindow',
          expected: maxMinor,
          actual: order.totalMinor,
          message: `Cart total ${eur(order.totalMinor, order.currency)} exceeds the ${eur(maxMinor, order.currency)} quiet-hours limit (${startHour}:00-${endHour}:00 UTC).`,
        });
      }
    }

    // Priority 4: order-frequency limit (e.g. "max 3 orders per hour").
    if (
      typeof policy.maxOrdersPerHour === 'number' &&
      policy.maxOrdersPerHour > 0 &&
      typeof context.ordersLastHour === 'number' &&
      context.ordersLastHour >= policy.maxOrdersPerHour
    ) {
      violations.push({
        type: 'FREQUENCY_LIMIT_EXCEEDED',
        rule: 'maxOrdersPerHour',
        expected: policy.maxOrdersPerHour,
        actual: context.ordersLastHour,
        message: `Order frequency ${context.ordersLastHour}/hour exceeds the limit of ${policy.maxOrdersPerHour}/hour.`,
      });
    }

    // Priority 4: geo allow-list placeholder. Only enforced when the caller
    // supplies a buyer country (no geo-IP in the sandbox), so it never blocks
    // a normal demo checkout.
    if (policy.allowedCountries && policy.allowedCountries.length > 0) {
      const country = context.countryCode?.toUpperCase();
      if (country) {
        const allowed = policy.allowedCountries.map((c) => c.toUpperCase());
        if (!allowed.includes(country)) {
          violations.push({
            type: 'GEO_RESTRICTED',
            rule: 'allowedCountries',
            expected: policy.allowedCountries,
            actual: country,
            message: `Buyer country ${country} is not in the allowed list.`,
          });
        }
      }
    }

    const hasBlockingViolation = violations.some(
      (violation) =>
        violation.type !== 'CONFIRMATION_THRESHOLD_EXCEEDED' &&
        // An unverified allergen is a soft, confirmable concern (not a hard block);
        // the route enforces an explicit acknowledgement before the order is created.
        violation.type !== 'GUARD_ALLERGEN_UNVERIFIED'
    );

    // Compute a deterministic hash of the policy-relevant menu data that will be
    // persisted in the policy event (guardDataVersion). This lets us prove later
    // which exact product/label versions were in force when a decision was made.
    const policyItems = order.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    const hashInput = JSON.stringify({
      policyId: policy.id,
      userId: policy.userId,
      orderItems: policyItems,
      totalMinor: order.totalMinor,
      currency: order.currency,
    });
    const guardDataVersion = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 16);

    return {
      decision: hasBlockingViolation
        ? 'BLOCK'
        : violations.length > 0
          ? 'REQUIRE_CONFIRMATION'
          : 'AUTO_ALLOW',
      violations,
      // Audit: which product data (diet labels + declared allergens) the guard decided on.
      // When a Wellbeing Guard is active we hash the product data it actually evaluated.
      guardDataVersion: context.shopperGuard
        ? productDataVersion(
            products.map((p) => ({
              id: p.id,
              dietary: p.dietary,
              allergens: p.wellbeing?.allergens ? Object.keys(p.wellbeing.allergens) : undefined,
            }))
          )
        : guardDataVersion,
    };
  }
}

// S10: shared singleton. The PolicyService is deterministic and holds no
// global mutable state of its own (it is pure given inputs), so a single
// instance shared across the advisory and authoritative enforcement points is
// safe and keeps the catalog lookup consistent.
export const policyService = new PolicyService(new CatalogService());
import { CatalogService } from '../catalog/service';
import { Order } from '../orders/domain';
import {
  PolicyEvaluation,
  PolicyEvaluationContext,
  PolicyViolation,
  PurchasePolicy,
} from './domain';

export class PolicyService {
  constructor(private readonly catalogService: CatalogService) {}

  evaluatePurchase(
    order: Order,
    policy: PurchasePolicy,
    context: PolicyEvaluationContext
  ): PolicyEvaluation {
    if (!policy.enabled) {
      return { decision: 'AUTO_ALLOW', violations: [] };
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
        message: `Order total ${order.totalMinor} exceeds the per-purchase limit ${policy.maxPerPurchaseMinor}.`,
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
        message: `Projected daily spend ${projectedDailySpendMinor} exceeds the daily limit ${policy.dailySpendLimitMinor}.`,
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

    if (order.totalMinor > policy.confirmationThresholdMinor) {
      violations.push({
        type: 'CONFIRMATION_THRESHOLD_EXCEEDED',
        rule: 'confirmationThresholdMinor',
        expected: policy.confirmationThresholdMinor,
        actual: order.totalMinor,
        message: `Order total ${order.totalMinor} exceeds the confirmation threshold ${policy.confirmationThresholdMinor}.`,
      });
    }

    const hasBlockingViolation = violations.some(
      (violation) => violation.type !== 'CONFIRMATION_THRESHOLD_EXCEEDED'
    );

    return {
      decision: hasBlockingViolation
        ? 'BLOCK'
        : violations.length > 0
          ? 'REQUIRE_CONFIRMATION'
          : 'AUTO_ALLOW',
      violations,
    };
  }
}

// S10: shared singleton. The PolicyService is deterministic and holds no
// global mutable state of its own (it is pure given inputs), so a single
// instance shared across the advisory and authoritative enforcement points is
// safe and keeps the catalog lookup consistent.
export const policyService = new PolicyService(new CatalogService());
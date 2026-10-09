import { policyBlockReason } from './domain';
import { DailySpendTracker } from './daily-spend-tracker';
import {
  PolicyDecision,
  PolicyEvaluation,
  PolicyEvaluationContext,
  PolicyViolation,
  PurchasePolicy,
} from './domain';
import { Order, OrderItem, OrderOrigin, OrderStatus } from '../orders/domain';

// S10 (R4): builds the PolicyEvaluationContext the deterministic PolicyService
// needs. Reads ONLY mutable runtime state (the daily-spend tracker) and trusted
// configuration (merchant id). The PolicyService itself remains free of global
// state, environment variables, HTTP, PayPal and AI.
export function buildPolicyContext(
  userId: string,
  merchantId: string,
  tracker: DailySpendTracker
): PolicyEvaluationContext {
  return {
    merchantId,
    currentDailySpendMinor: tracker.getSpentToday(userId),
    pendingReservationsMinor: tracker.getPendingReservations(userId),
  };
}

// S10 (R10): the authoritative order is NOT persisted before policy evaluation.
// This builds the minimum validated in-memory snapshot the PolicyService needs.
export function buildEvaluationOrder(
  sessionId: string,
  items: OrderItem[],
  totalMinor: number,
  currency: string,
  origin: OrderOrigin
): Order {
  return {
    id: '',
    sessionId,
    status: OrderStatus.CART_READY,
    origin,
    items: items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.lineTotalMinor,
    })),
    totalMinor,
    currency,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// S10: the structured outcome projected back to the AI tool caller / client.
export interface PolicyOutcome {
  decision: PolicyDecision;
  violations: { type: PolicyViolation['type']; message: string }[];
  reason: string;
  requiresExplicitApproval: boolean;
  retrySuggested: boolean;
  suggestion: string;
}

export function buildPolicyOutcome(evaluation: PolicyEvaluation): PolicyOutcome {
  const violationTypes = evaluation.violations.map((v) => v.type);
  return {
    decision: evaluation.decision,
    violations: evaluation.violations.map((v) => ({
      type: v.type,
      message: v.message,
    })),
    reason: policyBlockReason(violationTypes, evaluation.decision),
    requiresExplicitApproval: evaluation.decision === 'REQUIRE_CONFIRMATION',
    retrySuggested: evaluation.decision === 'BLOCK',
    suggestion:
      evaluation.decision === 'BLOCK'
        ? 'Try a lower-cost alternative or adjust your policy'
        : 'Proceed to checkout for human approval',
  };
}

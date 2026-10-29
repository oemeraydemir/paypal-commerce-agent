export type PolicyDecision =
  | 'AUTO_ALLOW'
  | 'REQUIRE_CONFIRMATION'
  | 'BLOCK';

export type PolicyViolationType =
  | 'MAX_PURCHASE_EXCEEDED'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'MERCHANT_NOT_ALLOWED'
  | 'CATEGORY_BLOCKED'
  | 'DIETARY_REQUIREMENT_NOT_MET'
  | 'DIETARY_ATTRIBUTE_BLOCKED'
  | 'CONFIRMATION_THRESHOLD_EXCEEDED'
  | 'CURRENCY_MISMATCH'
  | 'ALLOWANCE_EXPIRED';

export type PolicyValue = string | number | string[] | number[];

export interface PolicyViolation {
  type: PolicyViolationType;
  rule: string;
  expected: PolicyValue;
  actual: PolicyValue;
  message: string;
}

export interface PurchasePolicy {
  id: string;
  userId: string;
  currency: string;
  maxPerPurchaseMinor: number;
  dailySpendLimitMinor: number;
  allowedMerchantIds: string[];
  blockedCategoryIds: string[];
  requiredDietaryAttributes: string[];
  blockedDietaryAttributes: string[];
  confirmationThresholdMinor: number;
  enabled: boolean;
  /** Optional scoped-allowance expiry. When set and in the past, the allowance
   *  is treated as expired and the purchase is blocked (ALLOWANCE_EXPIRED). */
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyEvaluationContext {
  merchantId: string;
  currentDailySpendMinor: number;
  pendingReservationsMinor: number;
}

export interface PolicyEvaluation {
  decision: PolicyDecision;
  violations: PolicyViolation[];
}

export interface PolicyEvent {
  id: string;
  timestamp: string;
  userId: string;
  sessionId?: string;
  cartId: string;
  orderId?: string;
  agent: string;
  amountMinor: number;
  currency: string;
  decision: PolicyDecision;
  violatedRules: PolicyViolation[];
  reason: string;
  policySnapshot: {
    maxPerPurchaseMinor: number;
    dailySpendLimitMinor: number;
    confirmationThresholdMinor: number;
  };
}

export interface DailySpendReservation {
  id: string;
  userId: string;
  amountMinor: number;
  createdAt: Date;
}

export interface PolicyStats {
  totalRequests: number;
  blocked: number;
  allowed: number;
  correlatedWithOrder: number;
}

// S10: deterministic, side-effect-free summary of a policy evaluation for both
// event logging and the API responses returned to the AI / client. Kept in the
// domain so the PolicyEngine stays free of presentation concerns.
export function policyBlockReason(
  violationTypes: PolicyViolationType[],
  decision: PolicyDecision
): string {
  if (violationTypes.includes('MAX_PURCHASE_EXCEEDED')) {
    return 'Cart exceeds maximum purchase limit';
  }
  if (violationTypes.includes('DAILY_LIMIT_EXCEEDED')) {
    return 'Cart exceeds daily spend limit';
  }
  if (violationTypes.includes('CURRENCY_MISMATCH')) {
    return 'Order currency does not match policy currency';
  }
  if (violationTypes.includes('MERCHANT_NOT_ALLOWED')) {
    return 'Merchant is not allowed by policy';
  }
  if (violationTypes.includes('CATEGORY_BLOCKED')) {
    return 'A product belongs to a blocked category';
  }
  if (violationTypes.includes('DIETARY_REQUIREMENT_NOT_MET')) {
    return 'A product does not meet required dietary attributes';
  }
  if (violationTypes.includes('DIETARY_ATTRIBUTE_BLOCKED')) {
    return 'A product contains a blocked dietary attribute';
  }
  if (violationTypes.includes('CONFIRMATION_THRESHOLD_EXCEEDED')) {
    return 'Cart exceeds confirmation threshold; explicit approval required';
  }
  if (violationTypes.includes('ALLOWANCE_EXPIRED')) {
    return 'The spending allowance has expired';
  }
  if (decision === 'BLOCK') {
    return 'Purchase blocked by policy';
  }
  return 'Policy check passed';
}

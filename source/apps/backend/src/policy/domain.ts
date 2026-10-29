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
  | 'ALLOWANCE_EXPIRED'
  // Priority 4: richer, risk-style rules (time window, per-category budget,
  // order frequency and geo restriction). All are OPTIONAL: they only fire when
  // the corresponding policy field is configured.
  | 'TIME_WINDOW_LIMIT_EXCEEDED'
  | 'CATEGORY_SPEND_LIMIT_EXCEEDED'
  | 'FREQUENCY_LIMIT_EXCEEDED'
  | 'GEO_RESTRICTED';

/**
 * A "quiet hours" / night-window cap, e.g. "between 23:00 and 06:00 the cart may
 * not exceed EUR 10". Hours are evaluated in UTC (deterministic across servers);
 * a start hour greater than the end hour wraps around midnight.
 */
export interface NightWindowRule {
  /** Inclusive start hour, 0-23. */
  startHour: number;
  /** Exclusive end hour, 0-23. */
  endHour: number;
  /** Maximum cart total allowed inside the window, in minor units. */
  maxMinor: number;
}

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

  // ---- Priority 4: optional risk-style rules -------------------------------
  /** Night/quiet-hours cap, e.g. { startHour: 23, endHour: 6, maxMinor: 1000 }. */
  nightWindow?: NightWindowRule;
  /** Per-category budget for THIS cart, keyed by product category id (minor units). */
  categorySpendLimits?: Record<string, number>;
  /** Max orders allowed in the trailing hour (0 or undefined = unlimited). */
  maxOrdersPerHour?: number;
  /** ISO-3166 alpha-2 allow-list. Placeholder: only enforced when a countryCode
   *  is supplied in the evaluation context (no real geo-IP in the sandbox). */
  allowedCountries?: string[];

  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyEvaluationContext {
  merchantId: string;
  currentDailySpendMinor: number;
  pendingReservationsMinor: number;
  /** Clock used for the night-window rule (injectable so tests are deterministic). */
  now?: Date;
  /** Orders already created by this shopper in the trailing hour (frequency rule). */
  ordersLastHour?: number;
  /** Buyer country (ISO-3166 alpha-2); only used by the geo placeholder rule. */
  countryCode?: string;
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
  if (violationTypes.includes('TIME_WINDOW_LIMIT_EXCEEDED')) {
    return 'Cart exceeds the limit allowed during quiet hours';
  }
  if (violationTypes.includes('CATEGORY_SPEND_LIMIT_EXCEEDED')) {
    return 'Cart exceeds a category spending limit';
  }
  if (violationTypes.includes('FREQUENCY_LIMIT_EXCEEDED')) {
    return 'Too many orders in a short period';
  }
  if (violationTypes.includes('GEO_RESTRICTED')) {
    return 'The buyer region is not allowed by policy';
  }
  if (decision === 'BLOCK') {
    return 'Purchase blocked by policy';
  }
  return 'Policy check passed';
}

export const CUSTOMER_REASON_CODES = ['wrong_item', 'not_as_described', 'duplicate_charge', 'changed_mind', 'other'] as const;

export interface RefundRecommendation {
  source: 'AI' | 'RULES_FALLBACK' | 'OPS_COPILOT';
  category: 'ITEM_QUALITY' | 'FULFILLMENT' | 'PAYMENT' | 'CUSTOMER_CHANGE' | 'OTHER';
  confidence: number;
  recommendation: 'MERCHANT_REVIEW' | 'VERIFY_TRANSACTION' | 'REQUEST_MORE_INFORMATION';
  rationale: string;
  /** Explicit guardrail: this recommendation is never a decision or instruction to move money. */
  binding: false;
}

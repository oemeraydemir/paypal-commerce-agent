import type { RefundRequestRecord } from './service';

// Rule-based refund triage. DETERMINISTIC and transparent on purpose: it helps the merchant sort a
// request in seconds, but it is an advisory label, never a decision. Only an authenticated merchant
// approval moves money (see refunds/service.ts), and the amount is always validated server-side.
// No model is involved, so there is nothing to hallucinate about a customer's reason.

export type RefundCategory =
  | 'ALLERGEN_OR_HEALTH'
  | 'WRONG_OR_MISSING_ITEM'
  | 'QUALITY'
  | 'DELAY_OR_NO_PICKUP'
  | 'DUPLICATE_CHARGE'
  | 'CHANGED_MIND'
  | 'OTHER';

export type RefundSuggestion = 'REVIEW_URGENTLY' | 'LIKELY_APPROVE' | 'REVIEW' | 'LIKELY_DECLINE_OR_PARTIAL';

export interface RefundTriage {
  method: 'rules';
  category: RefundCategory;
  suggestion: RefundSuggestion;
  rationale: string;
}

const RULES: Array<{ category: RefundCategory; re: RegExp; suggestion: RefundSuggestion; rationale: string }> = [
  {
    category: 'ALLERGEN_OR_HEALTH',
    re: /allerg|gluten|nuts?\b|peanut|dairy|lactose|sick|ill\b|reaction|alerji|hasta|zehir|intoleran/i,
    suggestion: 'REVIEW_URGENTLY',
    rationale: 'Mentions an allergen or health issue. Check the order\'s Wellbeing Guard decisions in the evidence package and respond first.',
  },
  {
    category: 'DUPLICATE_CHARGE',
    re: /twice|double|duplicate|charged (two|2)|iki kez|çift/i,
    suggestion: 'LIKELY_APPROVE',
    rationale: 'Reports a duplicate charge. Verify there is a single captured payment in PayPal before approving.',
  },
  {
    category: 'WRONG_OR_MISSING_ITEM',
    re: /wrong|missing|not what i ordered|incorrect|yanlış|eksik|gelmedi/i,
    suggestion: 'LIKELY_APPROVE',
    rationale: 'Reports a wrong or missing item. Compare with the pickup record before approving.',
  },
  {
    category: 'DELAY_OR_NO_PICKUP',
    re: /late|delay|waited|never (picked|got|received)|no pickup|geç|bekle/i,
    suggestion: 'REVIEW',
    rationale: 'Reports a delay or failed pickup. Check the pickup booking status.',
  },
  {
    category: 'QUALITY',
    re: /cold|stale|burnt|bad|taste|quality|soğuk|bayat|kötü/i,
    suggestion: 'REVIEW',
    rationale: 'Quality complaint. A partial refund is often proportionate.',
  },
  {
    category: 'CHANGED_MIND',
    re: /changed my mind|don'?t want|no longer|mistake|vazgeç|istemiyorum/i,
    suggestion: 'LIKELY_DECLINE_OR_PARTIAL',
    rationale: 'Change of mind after payment. Decide per your café policy.',
  },
];

export function triageRefund(record: Pick<RefundRequestRecord, 'reason'>): RefundTriage {
  const hit = RULES.find((r) => r.re.test(record.reason));
  if (hit) return { method: 'rules', category: hit.category, suggestion: hit.suggestion, rationale: hit.rationale };
  return {
    method: 'rules',
    category: 'OTHER',
    suggestion: 'REVIEW',
    rationale: 'No known pattern in the reason text. Review manually.',
  };
}

export type ResolutionStage =
  | 'AWAITING_MERCHANT'
  | 'NEEDS_REVIEW'
  | 'REFUND_AT_PAYPAL'
  | 'RESOLVED_REFUNDED'
  | 'RESOLVED_DECLINED';

/** Customer-facing lifecycle stage, derived from the stored status (nothing extra is persisted). */
export function resolutionStage(record: Pick<RefundRequestRecord, 'status' | 'lastError'>): ResolutionStage {
  switch (record.status) {
    case 'PROCESSING':
      return 'REFUND_AT_PAYPAL';
    case 'REFUNDED':
      return 'RESOLVED_REFUNDED';
    case 'REJECTED':
      return 'RESOLVED_DECLINED';
    default:
      return record.lastError ? 'NEEDS_REVIEW' : 'AWAITING_MERCHANT';
  }
}

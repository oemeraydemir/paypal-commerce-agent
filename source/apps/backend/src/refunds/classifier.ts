import { aiClient } from '../ai/client';
import { env } from '../config/environment';
import { CUSTOMER_REASON_CODES, RefundRecommendation } from './domain';

const CATEGORY_TEXT: Record<RefundRecommendation['category'], string> = {
  ITEM_QUALITY: 'The request describes a possible item quality or description issue.',
  FULFILLMENT: 'The request may concern an item or service not received as expected.',
  PAYMENT: 'The request may concern a duplicate or incorrect charge.',
  CUSTOMER_CHANGE: 'The request appears to reflect a change of preference.',
  OTHER: 'The request needs merchant review to understand the issue.',
};

function fallback(reasonCode: string): RefundRecommendation {
  const category: RefundRecommendation['category'] = reasonCode === 'wrong_item' || reasonCode === 'not_as_described'
    ? 'ITEM_QUALITY'
    : reasonCode === 'duplicate_charge' ? 'PAYMENT'
      : reasonCode === 'changed_mind' ? 'CUSTOMER_CHANGE' : 'OTHER';
  return {
    source: 'RULES_FALLBACK', category, confidence: 0.5,
    recommendation: category === 'PAYMENT' ? 'VERIFY_TRANSACTION' : 'MERCHANT_REVIEW',
    rationale: CATEGORY_TEXT[category], binding: false,
  };
}

/**
 * Classifies only the customer-selected reason and a short redacted note.
 * There are no tools and no payment/order identifiers in the model request.
 * The result is a non-binding merchant aid; it can never approve or execute a refund.
 */
export async function classifyRefundRequest(reasonCode: string, note: string): Promise<RefundRecommendation> {
  const safeNote = note
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted email]')
    .replace(/(?:\+?\d[\d ().-]{7,}\d)/g, '[redacted phone]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[redacted number]')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
  const safeCode = (CUSTOMER_REASON_CODES as readonly string[]).includes(reasonCode) ? reasonCode : 'other';
  if (!env.ai?.providers?.length) return fallback(safeCode);

  try {
    const completion = await aiClient.chat([
      { role: 'system', content: 'Classify a refund request for merchant review. This is advisory only. Do not decide legal entitlement, approve a refund, recommend money movement, or invent facts. Return only JSON with category (ITEM_QUALITY, FULFILLMENT, PAYMENT, CUSTOMER_CHANGE, OTHER), confidence (0..1), recommendation (MERCHANT_REVIEW or VERIFY_TRANSACTION or REQUEST_MORE_INFORMATION).' },
      { role: 'user', content: JSON.stringify({ reasonCode: safeCode, note: safeNote }) },
    ]);
    const content = completion.choices[0]?.message?.content;
    if (typeof content !== 'string') return fallback(safeCode);
    const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const categories: RefundRecommendation['category'][] = ['ITEM_QUALITY','FULFILLMENT','PAYMENT','CUSTOMER_CHANGE','OTHER'];
    const recommendations: RefundRecommendation['recommendation'][] = ['MERCHANT_REVIEW','VERIFY_TRANSACTION','REQUEST_MORE_INFORMATION'];
    if (!categories.includes(parsed.category) || !recommendations.includes(parsed.recommendation) ||
        typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence)) return fallback(safeCode);
    const category = parsed.category as RefundRecommendation['category'];
    return {
      source: 'AI', category, confidence: Math.max(0, Math.min(1, parsed.confidence)),
      recommendation: parsed.recommendation, rationale: CATEGORY_TEXT[category], binding: false,
    };
  } catch {
    return fallback(safeCode);
  }
}

import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { itemSchema, type Item } from "./item.js";
import { policyDecisionSchema, type PolicyDecision } from "./policy-decision.js";
import { violationSchema, type Violation } from "./violation.js";

/** The validated, server-priced cart prepared by the agent; null when none was prepared. */
export type PreparedCart = {
  /** The validated cart lines with authoritative pricing. */
  items?: Item[];
  /** Cart total in minor units. */
  totalMinor?: number;
  /** Formatted cart total. */
  totalFormatted?: string;
  /** ISO 4217 currency code. */
  currency?: string;
  /** Deterministic cart identifier. */
  cartId?: string;
  /** Human-readable summary. */
  message?: string;
  /** The authoritative policy decision for a cart. */
  policyDecision?: PolicyDecision;
  /** Any policy violations found. */
  policyViolations?: Violation[];
  /** True when human approval is required. */
  requiresExplicitApproval?: boolean;
  /** True when an alternative cart is suggested. */
  retrySuggested?: boolean;
  /** Outcome explanation. */
  reason?: string;
};

export const preparedCartSchema: Schema<PreparedCart> = s.object<PreparedCart>({
  items: s.optional(s.array(s.lazy(() => itemSchema))),
  totalMinor: s.optional(s.int()),
  totalFormatted: s.optional(s.string()),
  currency: s.optional(s.string()),
  cartId: s.optional(s.string()),
  message: s.optional(s.string()),
  policyDecision: s.optional(s.lazy(() => policyDecisionSchema)),
  policyViolations: s.optional(s.array(s.lazy(() => violationSchema))),
  requiresExplicitApproval: s.optional(s.boolean()),
  retrySuggested: s.optional(s.boolean()),
  reason: s.optional(s.string()),
});

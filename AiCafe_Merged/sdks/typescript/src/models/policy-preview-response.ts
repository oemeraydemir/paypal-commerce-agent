import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { decisionSchema, type Decision } from "./decision.js";
import { policyCheckSchema, type PolicyCheck } from "./policy-check.js";
import { policyLimitsSchema, type PolicyLimits } from "./policy-limits.js";
import { violationSchema, type Violation } from "./violation.js";

/** policy preview response. */
export type PolicyPreviewResponse = {
  /** empty (field). */
  empty?: boolean;
  /** final policy decision (field). */
  decision?: Decision | null;
  /** explanation for this outcome (field). */
  reason?: string | null;
  /** suggested next step for the shopper (field). */
  suggestion?: string | null;
  /** requires explicit approval (field). */
  requiresExplicitApproval?: boolean;
  /** total in minor currency units (field). */
  totalMinor?: number;
  /** total formatted (field). */
  totalFormatted?: string;
  /** ISO 4217 currency code (e.g. EUR) (field). */
  currency?: string;
  /** checks (field). */
  checks?: PolicyCheck[];
  /** Any policy violations that would be reported. */
  violations?: Violation[];
  /** policy limits. */
  limits?: PolicyLimits;
  /** enforced by (field). */
  enforcedBy?: string;
};

export const policyPreviewResponseSchema: Schema<PolicyPreviewResponse> = s.object<PolicyPreviewResponse>({
  empty: s.optional(s.boolean()),
  decision: s.optionalNullable(s.lazy(() => decisionSchema)),
  reason: s.optionalNullable(s.string()),
  suggestion: s.optionalNullable(s.string()),
  requiresExplicitApproval: s.optional(s.boolean()),
  totalMinor: s.optional(s.int()),
  totalFormatted: s.optional(s.string()),
  currency: s.optional(s.string()),
  checks: s.optional(s.array(s.lazy(() => policyCheckSchema))),
  violations: s.optional(s.array(s.lazy(() => violationSchema))),
  limits: s.optional(s.lazy(() => policyLimitsSchema)),
  enforcedBy: s.optional(s.string()),
});

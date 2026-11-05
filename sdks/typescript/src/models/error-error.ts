import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { policyDecision2Schema, type PolicyDecision2 } from "./policy-decision2.js";
import { violationSchema, type Violation } from "./violation.js";

/** error. */
export type ErrorError = {
  /** error (field). */
  error?: string;
  /** human-readable message (field). */
  message?: string;
  /** code (field). */
  code?: string;
  /** policy decision (field). */
  policyDecision?: PolicyDecision2;
  /** Any policy violations that would be reported. */
  violations?: Violation[];
  /** explanation for this outcome (field). */
  reason?: string;
  /** suggested next step for the shopper (field). */
  suggestion?: string;
};

export const errorErrorSchema: Schema<ErrorError> = s.object<ErrorError>({
  error: s.optional(s.string()),
  message: s.optional(s.string()),
  code: s.optional(s.string()),
  policyDecision: s.optional(s.lazy(() => policyDecision2Schema)),
  violations: s.optional(s.array(s.lazy(() => violationSchema))),
  reason: s.optional(s.string()),
  suggestion: s.optional(s.string()),
});

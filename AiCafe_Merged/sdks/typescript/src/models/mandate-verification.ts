import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { checksSchema, type Checks } from "./checks.js";

/** mandate verification. */
export type MandateVerification = {
  /** whether the verification passed (field). */
  valid?: boolean;
  /** checks. */
  checks?: Checks;
  /** explanation for this outcome (field). */
  reason?: string;
};

export const mandateVerificationSchema: Schema<MandateVerification> = s.object<MandateVerification>({
  valid: s.optional(s.boolean()),
  checks: s.optional(s.lazy(() => checksSchema)),
  reason: s.optional(s.string()),
});

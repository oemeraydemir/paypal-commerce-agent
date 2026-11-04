import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { statusSchema, type Status } from "./status.js";

/** policy check. */
export type PolicyCheck = {
  /** rule (field). */
  rule?: string;
  /** label (field). */
  label?: string;
  /** current status (field). */
  status?: Status;
  /** detail (field). */
  detail?: string;
};

export const policyCheckSchema: Schema<PolicyCheck> = s.object<PolicyCheck>({
  rule: s.optional(s.string()),
  label: s.optional(s.string()),
  status: s.optional(s.lazy(() => statusSchema)),
  detail: s.optional(s.string()),
});

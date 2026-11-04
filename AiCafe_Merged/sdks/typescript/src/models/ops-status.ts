import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** ops status. */
export type OpsStatus = {
  /** whether the capability is enabled (field). */
  enabled?: boolean;
  /** whether a provider key is required (field). */
  requiresKey?: boolean;
  /** whether the capability is read-only (field). */
  readOnly?: boolean;
  /** explanation for this outcome (field). */
  reason?: string;
  /** paypal tools (field). */
  paypalTools?: string[];
  /** internal tools (field). */
  internalTools?: string[];
};

export const opsStatusSchema: Schema<OpsStatus> = s.object<OpsStatus>({
  enabled: s.optional(s.boolean()),
  requiresKey: s.optional(s.boolean()),
  readOnly: s.optional(s.boolean()),
  reason: s.optional(s.string()),
  paypalTools: s.optional(s.array(s.string())),
  internalTools: s.optional(s.array(s.string())),
});

import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Per-rule check outcome. */
export const PolicyCheckStatus = {
  ValuePassDescriptionCheckPassed: '{"value":"PASS","description":"Check passed"}',
  ValueWarnDescriptionWarningProduced: '{"value":"WARN","description":"Warning produced"}',
  ValueBlockDescriptionCheckBlocked: '{"value":"BLOCK","description":"Check blocked"}',
} as const;
export type PolicyCheckStatus = (typeof PolicyCheckStatus)[keyof typeof PolicyCheckStatus] | (string & {});

export const policyCheckStatusSchema: EnumSchema<PolicyCheckStatus> =
  s.enumOf<PolicyCheckStatus>(PolicyCheckStatus);

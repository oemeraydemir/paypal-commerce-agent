import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** The authoritative policy decision for a cart. */
export const PolicyDecision = {
  ValueAutoAllowDescriptionAllowed: '{"value":"AUTO_ALLOW","description":"Allowed"}',
  ValueRequireConfirmationDescriptionApprovalRequired:
    '{"value":"REQUIRE_CONFIRMATION","description":"Approval required"}',
  ValueBlockDescriptionBlocked: '{"value":"BLOCK","description":"Blocked"}',
} as const;
export type PolicyDecision = (typeof PolicyDecision)[keyof typeof PolicyDecision] | (string & {});

export const policyDecisionSchema: EnumSchema<PolicyDecision> = s.enumOf<PolicyDecision>(PolicyDecision);

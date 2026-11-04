import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** policy decision (field). */
export const PolicyDecision2 = {
  ValueAutoAllowDescriptionEnumValueAutoAllow:
    '{"value":"AUTO_ALLOW","description":"Enum value AUTO_ALLOW."}',
  ValueRequireConfirmationDescriptionEnumValueRequireConfirmation:
    '{"value":"REQUIRE_CONFIRMATION","description":"Enum value REQUIRE_CONFIRMATION."}',
  ValueBlockDescriptionEnumValueBlock: '{"value":"BLOCK","description":"Enum value BLOCK."}',
} as const;
export type PolicyDecision2 = (typeof PolicyDecision2)[keyof typeof PolicyDecision2] | (string & {});

export const policyDecision2Schema: EnumSchema<PolicyDecision2> = s.enumOf<PolicyDecision2>(PolicyDecision2);

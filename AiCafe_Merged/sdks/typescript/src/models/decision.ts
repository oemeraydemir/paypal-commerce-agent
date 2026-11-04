import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** final policy decision (field). */
export const Decision = {
  ValueAutoAllowDescriptionEnumValueAutoAllow:
    '{"value":"AUTO_ALLOW","description":"Enum value AUTO_ALLOW."}',
  ValueRequireConfirmationDescriptionEnumValueRequireConfirmation:
    '{"value":"REQUIRE_CONFIRMATION","description":"Enum value REQUIRE_CONFIRMATION."}',
  ValueBlockDescriptionEnumValueBlock: '{"value":"BLOCK","description":"Enum value BLOCK."}',
} as const;
export type Decision = (typeof Decision)[keyof typeof Decision] | (string & {});

export const decisionSchema: EnumSchema<Decision> = s.enumOf<Decision>(Decision);

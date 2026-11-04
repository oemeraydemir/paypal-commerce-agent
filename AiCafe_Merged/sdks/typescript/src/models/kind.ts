import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Scope kind. */
export const Kind = {
  ValueShopperDescriptionEnumValueShopper: '{"value":"SHOPPER","description":"Enum value SHOPPER."}',
  ValueAgentProposedDescriptionEnumValueAgentProposed:
    '{"value":"AGENT_PROPOSED","description":"Enum value AGENT_PROPOSED."}',
  ValueAgentGrantedDescriptionEnumValueAgentGranted:
    '{"value":"AGENT_GRANTED","description":"Enum value AGENT_GRANTED."}',
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind] | (string & {});

export const kindSchema: EnumSchema<Kind> = s.enumOf<Kind>(Kind);

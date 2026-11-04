import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** proposed by (field). */
export const ProposedBy = {
  ValueOpsCopilotDescriptionEnumValueOpsCopilot:
    '{"value":"OPS_COPILOT","description":"Enum value OPS_COPILOT."}',
  ValueMerchantDescriptionEnumValueMerchant: '{"value":"MERCHANT","description":"Enum value MERCHANT."}',
} as const;
export type ProposedBy = (typeof ProposedBy)[keyof typeof ProposedBy] | (string & {});

export const proposedBySchema: EnumSchema<ProposedBy> = s.enumOf<ProposedBy>(ProposedBy);

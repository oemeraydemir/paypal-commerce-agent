import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** current status (field). */
export const Status1 = {
  ValueProposedDescriptionEnumValueProposed: '{"value":"PROPOSED","description":"Enum value PROPOSED."}',
  ValueProcessingDescriptionEnumValueProcessing:
    '{"value":"PROCESSING","description":"Enum value PROCESSING."}',
  ValueRefundedDescriptionEnumValueRefunded: '{"value":"REFUNDED","description":"Enum value REFUNDED."}',
  ValueRejectedDescriptionEnumValueRejected: '{"value":"REJECTED","description":"Enum value REJECTED."}',
} as const;
export type Status1 = (typeof Status1)[keyof typeof Status1] | (string & {});

export const status1Schema: EnumSchema<Status1> = s.enumOf<Status1>(Status1);

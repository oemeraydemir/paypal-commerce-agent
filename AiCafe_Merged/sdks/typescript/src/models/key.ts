import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** key (field). */
export const Key = {
  ValuePreparedDescriptionEnumValuePrepared: '{"value":"prepared","description":"Enum value prepared."}',
  ValuePricesDescriptionEnumValuePrices: '{"value":"prices","description":"Enum value prices."}',
  ValueLimitDescriptionEnumValueLimit: '{"value":"limit","description":"Enum value limit."}',
  ValueApprovalDescriptionEnumValueApproval: '{"value":"approval","description":"Enum value approval."}',
  ValuePaypalDescriptionEnumValuePaypal: '{"value":"paypal","description":"Enum value paypal."}',
  ValueVerifyDescriptionEnumValueVerify: '{"value":"verify","description":"Enum value verify."}',
} as const;
export type Key = (typeof Key)[keyof typeof Key] | (string & {});

export const keySchema: EnumSchema<Key> = s.enumOf<Key>(Key);

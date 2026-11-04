import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** limit set by (field). */
export const LimitSetBy = {
  ValueShopperPolicyDescriptionEnumValueShopperPolicy:
    '{"value":"shopper-policy","description":"Enum value shopper-policy."}',
} as const;
export type LimitSetBy = (typeof LimitSetBy)[keyof typeof LimitSetBy] | (string & {});

export const limitSetBySchema: EnumSchema<LimitSetBy> = s.enumOf<LimitSetBy>(LimitSetBy);

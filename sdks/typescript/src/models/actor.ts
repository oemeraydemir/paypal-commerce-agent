import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** actor (field). */
export const Actor = {
  ValueAiDescriptionEnumValueAi: '{"value":"ai","description":"Enum value ai."}',
  ValueServerDescriptionEnumValueServer: '{"value":"server","description":"Enum value server."}',
  ValueShopperDescriptionEnumValueShopper: '{"value":"shopper","description":"Enum value shopper."}',
  ValuePaypalDescriptionEnumValuePaypal: '{"value":"paypal","description":"Enum value paypal."}',
} as const;
export type Actor = (typeof Actor)[keyof typeof Actor] | (string & {});

export const actorSchema: EnumSchema<Actor> = s.enumOf<Actor>(Actor);

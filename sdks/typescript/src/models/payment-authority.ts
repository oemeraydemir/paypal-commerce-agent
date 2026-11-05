import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** payment authority (field). */
export const PaymentAuthority = {
  ValueShopperDescriptionEnumValueShopper: '{"value":"shopper","description":"Enum value shopper."}',
} as const;
export type PaymentAuthority = (typeof PaymentAuthority)[keyof typeof PaymentAuthority] | (string & {});

export const paymentAuthoritySchema: EnumSchema<PaymentAuthority> =
  s.enumOf<PaymentAuthority>(PaymentAuthority);

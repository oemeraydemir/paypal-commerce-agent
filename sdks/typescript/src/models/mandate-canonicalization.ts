import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Canonicalization scheme used before signing. */
export const MandateCanonicalization = {
  ValueJcsDescriptionJsonCanonicalizationRfc8785:
    '{"value":"jcs","description":"JSON Canonicalization (RFC 8785)"}',
} as const;
export type MandateCanonicalization =
  | (typeof MandateCanonicalization)[keyof typeof MandateCanonicalization]
  | (string & {});

export const mandateCanonicalizationSchema: EnumSchema<MandateCanonicalization> =
  s.enumOf<MandateCanonicalization>(MandateCanonicalization);

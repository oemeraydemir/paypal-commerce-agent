import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Signature algorithm. */
export const MandateAlg = {
  ValueEdDsaDescriptionEd25519EdDsa: '{"value":"EdDSA","description":"Ed25519 (EdDSA)"}',
} as const;
export type MandateAlg = (typeof MandateAlg)[keyof typeof MandateAlg] | (string & {});

export const mandateAlgSchema: EnumSchema<MandateAlg> = s.enumOf<MandateAlg>(MandateAlg);

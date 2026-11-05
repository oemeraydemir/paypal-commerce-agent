import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** signed cart mandate. */
export type SignedCartMandate = {
  /** Canonical content that was signed (version aicafe.cart-mandate/1). */
  mandate: Record<string, unknown>;
  /** base64url Ed25519 signature over the stable-stringified mandate */
  signature: string;
  /** alg (field). @default '{\n "value": "EdDSA",\n "description": "Enum value EdDSA."\n}' */
  alg?: '{\n  "value": "EdDSA",\n  "description": "Enum value EdDSA."\n}';
  /** Key id: the active key or a configured previous public key */
  kid: string;
  /**
   * UTF-8 JSON, object keys sorted, no whitespace (fast-json-stable-stringify 2.x). Not RFC 8785.
   *
   * @default '{\n "value": "aicafe-stable-json/1",\n "description": "Enum value
   * aicafe-stable-json/1."\n}'
   */
  canonicalization?: '{\n  "value": "aicafe-stable-json/1",\n  "description": "Enum value aicafe-stable-json/1."\n}';
};

export const signedCartMandateSchema: Schema<SignedCartMandate> = s.object<SignedCartMandate>({
  mandate: s.record(s.string(), s.unknown()),
  signature: s.string(),
  alg: s.defaulted(
    s.literal('{\n  "value": "EdDSA",\n  "description": "Enum value EdDSA."\n}'),
    '{\n  "value": "EdDSA",\n  "description": "Enum value EdDSA."\n}',
  ),
  kid: s.string(),
  canonicalization: s.defaulted(
    s.literal(
      '{\n  "value": "aicafe-stable-json/1",\n  "description": "Enum value aicafe-stable-json/1."\n}',
    ),
    '{\n  "value": "aicafe-stable-json/1",\n  "description": "Enum value aicafe-stable-json/1."\n}',
  ),
});

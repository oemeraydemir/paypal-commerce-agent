import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** jsonrpc (field). */
export const Jsonrpc = {
  Value20DescriptionEnumValue20: '{"value":"2.0","description":"Enum value 2.0."}',
} as const;
export type Jsonrpc = (typeof Jsonrpc)[keyof typeof Jsonrpc] | (string & {});

export const jsonrpcSchema: EnumSchema<Jsonrpc> = s.enumOf<Jsonrpc>(Jsonrpc);

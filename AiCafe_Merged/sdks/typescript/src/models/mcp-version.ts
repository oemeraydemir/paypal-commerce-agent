import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** JSON-RPC protocol version. */
export const McpVersion = {
  Value20DescriptionJsonRpc20: '{"value":"2.0","description":"JSON-RPC 2.0"}',
} as const;
export type McpVersion = (typeof McpVersion)[keyof typeof McpVersion] | (string & {});

export const mcpVersionSchema: EnumSchema<McpVersion> = s.enumOf<McpVersion>(McpVersion);

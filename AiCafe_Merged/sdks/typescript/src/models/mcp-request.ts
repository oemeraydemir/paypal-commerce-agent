import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { methodSchema, type Method } from "./method.js";
import { idSchema, type Id } from "./unions/id.js";

/** mcp request. */
export type McpRequest = {
  /** jsonrpc (field). @default '{\n "value": "2.0",\n "description": "Enum value 2.0."\n}' */
  jsonrpc?: '{\n  "value": "2.0",\n  "description": "Enum value 2.0."\n}';
  /** unique identifier (field). */
  id?: Id;
  /** method (field). */
  method: Method;
  /** params (field). */
  params?: Record<string, unknown>;
};

export const mcpRequestSchema: Schema<McpRequest> = s.object<McpRequest>({
  jsonrpc: s.defaulted(
    s.literal('{\n  "value": "2.0",\n  "description": "Enum value 2.0."\n}'),
    '{\n  "value": "2.0",\n  "description": "Enum value 2.0."\n}',
  ),
  id: s.optional(s.lazy(() => idSchema)),
  method: methodSchema,
  params: s.optional(s.record(s.string(), s.unknown())),
});

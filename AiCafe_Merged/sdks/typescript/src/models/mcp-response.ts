import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { error1Schema, type Error1 } from "./error1.js";
import { jsonrpcSchema, type Jsonrpc } from "./jsonrpc.js";

/** mcp response. */
export type McpResponse = {
  /** jsonrpc (field). */
  jsonrpc?: Jsonrpc;
  /** Echo of the request id (string or integer in JSON-RPC; shown as string here) */
  id?: string | null;
  /** result (field). */
  result?: Record<string, unknown>;
  /** error. */
  error?: Error1;
};

export const mcpResponseSchema: Schema<McpResponse> = s.object<McpResponse>({
  jsonrpc: s.optional(s.lazy(() => jsonrpcSchema)),
  id: s.optionalNullable(s.string()),
  result: s.optional(s.record(s.string(), s.unknown())),
  error: s.optional(s.lazy(() => error1Schema)),
});

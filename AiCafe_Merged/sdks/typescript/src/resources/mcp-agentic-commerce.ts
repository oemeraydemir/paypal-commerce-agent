import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import { allAuth } from "../core/auth/schemes.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import { uuid } from "../core/uuid.js";
import * as s from "../core/validation/index.js";
import { errorSchema, type Error } from "../models/error.js";
import { mcpRequestSchema, type McpRequest } from "../models/mcp-request.js";
import { mcpResponseSchema, type McpResponse } from "../models/mcp-response.js";
import type { Servers } from "../servers.js";

/**
 * Model Context Protocol server: lets any external AI agent shop at AI Café and start a PayPal
 * checkout that only a human can approve
 */
export class McpAgenticCommerce {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * End an MCP session
   *
   * @remarks
   * End an MCP session.
   *
   * @returns Ended
   *
   * @throws {@link McpAgenticCommerce.McpEndSessionError} when the API answers with an error status
   * — narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  mcpEndSession(
    request: McpAgenticCommerce.McpEndSessionRequest,
    options?: RequestOptions,
  ): ApiPromise<undefined, McpAgenticCommerce.McpEndSessionError> {
    return this.#rawClient.execute(
      {
        method: "DELETE",
        urlTemplate: this.#servers.default("/api/mcp"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [],
        query: [],
        headers: [
          { name: "Mcp-Session-Id", value: request.mcpSessionId, schema: s.string() },
          { name: "Idempotency-Key", value: uuid(), schema: s.string() },
        ],
        body: { kind: "empty" },
      },
      {
        success: { kind: "empty" },
        errorFactory: McpAgenticCommerce.McpEndSessionError,
      },
      options,
    );
  }

  /**
   * MCP Streamable-HTTP endpoint JSON-RPC 2.0
   *
   * @remarks
   * Tools: `search_menu`, `prepare_cart`, `check_policy`, `start_checkout`, `get_order_status`.
   * There is deliberately NO capture/pay/refund tool: `start_checkout` returns a PayPal sandbox
   * approval URL that a human must approve. Call `initialize` first and send the returned
   * `Mcp-Session-Id` header on every later request. A GET on this path returns 405 (the optional
   * SSE stream is not offered).
   *
   * @returns JSON-RPC result or error
   *
   * @throws {@link McpAgenticCommerce.McpRpcError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  mcpRpc(
    request: McpAgenticCommerce.McpRpcRequest,
    options?: RequestOptions,
  ): ApiPromise<McpResponse, McpAgenticCommerce.McpRpcError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/mcp"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [],
        query: [],
        headers: [
          { name: "Mcp-Session-Id", value: request.mcpSessionId, schema: s.optional(s.string()) },
          { name: "Idempotency-Key", value: uuid(), schema: s.string() },
        ],
        body: { kind: "json", value: request.body, schema: mcpRequestSchema },
      },
      {
        success: { kind: "json", schema: mcpResponseSchema },
        errorFactory: McpAgenticCommerce.McpRpcError,
      },
      options,
    );
  }
}

export namespace McpAgenticCommerce {
  export type McpEndSessionRequest = {
    /** Session header returned by MCP initialize; required for tools/call. */
    mcpSessionId: string;
  };

  export class McpEndSessionError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<McpEndSessionError> = [
      { on: 404, kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type McpRpcRequest = {
    /** Returned by `initialize`. */
    mcpSessionId?: string;
    /** An MCP JSON-RPC 2.0 request (initialize, tools/list, or tools/call). */
    body: McpRequest;
  };

  export class McpRpcError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<McpRpcError> = [
      { on: 403, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 404, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

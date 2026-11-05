import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import { allAuth, noneAuth } from "../core/auth/schemes.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import { uuid } from "../core/uuid.js";
import * as s from "../core/validation/index.js";
import { errorSchema, type Error } from "../models/error.js";
import { opsAskRequestSchema, type OpsAskRequest } from "../models/ops-ask-request.js";
import { opsStatusSchema, type OpsStatus } from "../models/ops-status.js";
import type { Servers } from "../servers.js";

/**
 * Read-only merchant assistant (PayPal Agent Toolkit)
 */
export class OpsCopilot {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * Ops Copilot capability status
   *
   * @remarks
   * Ops Copilot capability status.
   *
   * @returns Status
   *
   * @throws {@link OpsCopilot.GetOpsStatusError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getOpsStatus(options?: RequestOptions): ApiPromise<OpsStatus, OpsCopilot.GetOpsStatusError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/ops/status"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: opsStatusSchema },
        errorFactory: OpsCopilot.GetOpsStatusError,
      },
      options,
    );
  }

  /**
   * Ask the merchant copilot read-only PayPal access; may only propose refunds
   *
   * @remarks
   * Ask the merchant copilot (read-only PayPal access; may only propose refunds).
   *
   * @returns Answer (read-only)
   *
   * @throws {@link OpsCopilot.PostOpsAskError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postOpsAsk(
    request: OpsCopilot.PostOpsAskRequest,
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, OpsCopilot.PostOpsAskError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/ops/ask"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [],
        query: [],
        headers: [
          { name: "X-Ops-Key", value: request.xOpsKey, schema: s.optional(s.string()) },
          { name: "Idempotency-Key", value: uuid(), schema: s.string() },
        ],
        body: { kind: "json", value: request.body, schema: opsAskRequestSchema },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: OpsCopilot.PostOpsAskError,
      },
      options,
    );
  }
}

export namespace OpsCopilot {
  export class GetOpsStatusError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetOpsStatusError> = [
      { on: [400, 499], kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostOpsAskRequest = {
    /** Required when Ops Copilot is enabled. */
    xOpsKey?: string;
    /**
     * A natural-language question for the merchant Copilot (read-only; may only propose refunds).
     */
    body: OpsAskRequest;
  };

  export class PostOpsAskError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<PostOpsAskError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

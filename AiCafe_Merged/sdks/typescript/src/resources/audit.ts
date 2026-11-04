import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import * as s from "../core/validation/index.js";
import { errorSchema, type Error } from "../models/error.js";
import { policyDecisionSchema, type PolicyDecision } from "../models/policy-decision.js";
import { policyEventsResponseSchema, type PolicyEventsResponse } from "../models/policy-events-response.js";
import { policyEventsStatsSchema, type PolicyEventsStats } from "../models/policy-events-stats.js";
import type { Servers } from "../servers.js";

/**
 * Immutable policy-decision events
 */
export class Audit {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * Immutable audit trail of every policy decision
   *
   * @remarks
   * Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401
   * without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default
   * DASHBOARD_PUBLIC=true the route is open and returns a minimised view.
   *
   * @returns Events
   *
   * @throws {@link Audit.GetPolicyEventsError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getPolicyEvents(
    request: Audit.GetPolicyEventsRequest = {},
    options?: RequestOptions,
  ): ApiPromise<PolicyEventsResponse, Audit.GetPolicyEventsError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/policy-events"),
        auth: this.#auth.opsKey,
        pathParams: [],
        query: [
          {
            name: "decision",
            value: request.decision,
            schema: s.optional(s.lazy(() => policyDecisionSchema)),
          },
          { name: "userId", value: request.userId, schema: s.optional(s.string()) },
          { name: "limit", value: request.limit, schema: s.optional(s.int()) },
        ],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: policyEventsResponseSchema },
        errorFactory: Audit.GetPolicyEventsError,
      },
      options,
    );
  }

  /**
   * Policy decision statistics
   *
   * @remarks
   * Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401
   * without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default
   * DASHBOARD_PUBLIC=true the route is open and returns a minimised view.
   *
   * @returns Stats
   *
   * @throws {@link Audit.GetPolicyEventsStatsError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getPolicyEventsStats(
    request: Audit.GetPolicyEventsStatsRequest = {},
    options?: RequestOptions,
  ): ApiPromise<PolicyEventsStats, Audit.GetPolicyEventsStatsError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/policy-events/stats"),
        auth: this.#auth.opsKey,
        pathParams: [],
        query: [{ name: "userId", value: request.userId, schema: s.optional(s.string()) }],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: policyEventsStatsSchema },
        errorFactory: Audit.GetPolicyEventsStatsError,
      },
      options,
    );
  }
}

export namespace Audit {
  export type GetPolicyEventsRequest = {
    /** Value for the decision parameter. */
    decision?: PolicyDecision;
    /** Value for the userId parameter. */
    userId?: string;
    /** Value for the limit parameter. */
    limit?: number;
  };

  export class GetPolicyEventsError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"error4", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<GetPolicyEventsError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error4", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type GetPolicyEventsStatsRequest = {
    /** Value for the userId parameter. */
    userId?: string;
  };

  export class GetPolicyEventsStatsError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<GetPolicyEventsStatsError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

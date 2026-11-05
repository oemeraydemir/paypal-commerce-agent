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
import { issuedSessionSchema, type IssuedSession } from "../models/issued-session.js";
import type { Servers } from "../servers.js";

/**
 * Server-issued session identity
 */
export class Sessions {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * End the current session
   *
   * @remarks
   * End the current session.
   *
   * @returns Session ended
   *
   * @throws {@link Sessions.DeleteSessionsCurrentError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  deleteSessionsCurrent(
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, Sessions.DeleteSessionsCurrentError> {
    return this.#rawClient.execute(
      {
        method: "DELETE",
        urlTemplate: this.#servers.default("/api/sessions/current"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: Sessions.DeleteSessionsCurrentError,
      },
      options,
    );
  }

  /**
   * Health and readiness check
   *
   * @remarks
   * Health and readiness check.
   *
   * @returns OK
   *
   * @throws {@link Sessions.GetHealthError} when the API answers with an error status — narrow on
   * `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getHealth(options?: RequestOptions): ApiPromise<Record<string, unknown>, Sessions.GetHealthError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/health"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: Sessions.GetHealthError,
      },
      options,
    );
  }

  /**
   * Mint a server-side session
   *
   * @remarks
   * Mint a server-side session.
   *
   * @returns Session issued
   *
   * @throws {@link Sessions.PostSessionsError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postSessions(options?: RequestOptions): ApiPromise<IssuedSession, Sessions.PostSessionsError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/sessions"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: issuedSessionSchema },
        errorFactory: Sessions.PostSessionsError,
      },
      options,
    );
  }
}

export namespace Sessions {
  export class DeleteSessionsCurrentError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<DeleteSessionsCurrentError> = [
      { on: [400, 499], kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export class GetHealthError extends ApiError {
    declare readonly payload: Declared<"error503", Record<string, unknown>> | Undeclared;

    static readonly errors: ErrorDecoders<GetHealthError> = [
      { on: 503, kind: "error503", decode: { kind: "json", schema: s.record(s.string(), s.unknown()) } },
    ];
  }

  export class PostSessionsError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<PostSessionsError> = [
      { on: 429, kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

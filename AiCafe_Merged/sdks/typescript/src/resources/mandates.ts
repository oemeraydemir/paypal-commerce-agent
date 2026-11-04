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
import { mandateVerificationSchema, type MandateVerification } from "../models/mandate-verification.js";
import { signedCartMandateSchema, type SignedCartMandate } from "../models/signed-cart-mandate.js";
import type { Servers } from "../servers.js";

/**
 * Signed Cart Mandates (tamper-evident record of what was proposed and who holds payment authority)
 */
export class Mandates {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * Signed Cart Mandate for one of your orders
   *
   * @remarks
   * Ed25519-signed, deterministic record of what the shopper was asked to approve: items, server
   * prices, total, origin (HUMAN / AI_AGENT) and the constraints (the agent may not authorize
   * payment; payment authority is the buyer's approval at PayPal). Derived from the stored order,
   * so it survives restarts when MANDATE_SIGNING_KEY is configured. Another session's order is a
   * 404.
   *
   * @returns Signed mandate
   *
   * @throws {@link Mandates.GetOrderMandateError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getOrderMandate(
    request: Mandates.GetOrderMandateRequest,
    options?: RequestOptions,
  ): ApiPromise<SignedCartMandate, Mandates.GetOrderMandateError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/orders/{orderId}/mandate"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [{ name: "orderId", value: request.orderId, schema: s.string() }],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: signedCartMandateSchema },
        errorFactory: Mandates.GetOrderMandateError,
      },
      options,
    );
  }

  /**
   * Verify a Cart Mandate no session needed
   *
   * @remarks
   * Checks the key id, the Ed25519 signature, the expiry window and, when the order is still known,
   * that the mandate still matches it. Expiry is informational: a genuine but expired mandate stays
   * valid.
   *
   * @returns Verification result
   *
   * @throws {@link Mandates.PostMandatesVerifyError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postMandatesVerify(
    request: Mandates.PostMandatesVerifyRequest,
    options?: RequestOptions,
  ): ApiPromise<MandateVerification, Mandates.PostMandatesVerifyError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/mandates/verify"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "json", value: request.body, schema: signedCartMandateSchema },
      },
      {
        success: { kind: "json", schema: mandateVerificationSchema },
        errorFactory: Mandates.PostMandatesVerifyError,
      },
      options,
    );
  }
}

export namespace Mandates {
  export type GetOrderMandateRequest = {
    /** Value for the orderId parameter. */
    orderId: string;
  };

  export class GetOrderMandateError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<GetOrderMandateError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 404, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostMandatesVerifyRequest = {
    /** The signed Cart Mandate to verify against the published signing key. */
    body: SignedCartMandate;
  };

  export class PostMandatesVerifyError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<PostMandatesVerifyError> = [
      { on: 503, kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import { uuid } from "../core/uuid.js";
import * as s from "../core/validation/index.js";
import { apiRefundsResponseSchema, type ApiRefundsResponse } from "../models/api-refunds-response.js";
import { errorSchema, type Error } from "../models/error.js";
import { proposeRefundRequestSchema, type ProposeRefundRequest } from "../models/propose-refund-request.js";
import { refundRequestSchema, type RefundRequest } from "../models/refund-request.js";
import type { Servers } from "../servers.js";

/**
 * Merchant refund queue. An AI (Ops Copilot) or merchant may PROPOSE a refund; only an
 * authenticated approval calls PayPal's refund API.
 */
export class Refunds {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * Approve and issue the refund via PayPal sandbox
   *
   * @remarks
   * The only endpoint that calls PayPal's refund API. Uses a stable PayPal-Request-Id
   * (`aicafe-refund-<id>`), but does not rely on its unverified retention window alone: an
   * ambiguous outcome must be reconciled against the PayPal refund or capture before another
   * request.
   *
   * @returns Refunded
   *
   * @throws {@link Refunds.ApproveRefundError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  approveRefund(
    request: Refunds.ApproveRefundRequest,
    options?: RequestOptions,
  ): ApiPromise<RefundRequest, Refunds.ApproveRefundError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/refunds/{id}/approve"),
        auth: this.#auth.opsKey,
        pathParams: [{ name: "id", value: request.id, schema: s.string() }],
        query: [],
        headers: [
          { name: "X-Ops-Key", value: request.xOpsKey, schema: s.string() },
          { name: "Idempotency-Key", value: uuid(), schema: s.string() },
        ],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: refundRequestSchema },
        errorFactory: Refunds.ApproveRefundError,
      },
      options,
    );
  }

  /**
   * List refund requests newest first
   *
   * @remarks
   * List refund requests (newest first).
   *
   * @returns Refund queue
   *
   * @throws {@link Refunds.ListRefundsError} when the API answers with an error status — narrow on
   * `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  listRefunds(
    request: Refunds.ListRefundsRequest,
    options?: RequestOptions,
  ): ApiPromise<ApiRefundsResponse, Refunds.ListRefundsError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/refunds"),
        auth: this.#auth.opsKey,
        pathParams: [],
        query: [],
        headers: [{ name: "X-Ops-Key", value: request.xOpsKey, schema: s.string() }],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: apiRefundsResponseSchema },
        errorFactory: Refunds.ListRefundsError,
      },
      options,
    );
  }

  /**
   * Propose a refund moves no money
   *
   * @remarks
   * Propose a refund (moves no money).
   *
   * @returns Proposed
   *
   * @throws {@link Refunds.ProposeRefundError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  proposeRefund(
    request: Refunds.ProposeRefundRequestParams,
    options?: RequestOptions,
  ): ApiPromise<RefundRequest, Refunds.ProposeRefundError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/refunds/propose"),
        auth: this.#auth.opsKey,
        pathParams: [],
        query: [],
        headers: [
          { name: "X-Ops-Key", value: request.xOpsKey, schema: s.string() },
          { name: "Idempotency-Key", value: uuid(), schema: s.string() },
        ],
        body: { kind: "json", value: request.body, schema: proposeRefundRequestSchema },
      },
      {
        success: { kind: "json", schema: refundRequestSchema },
        errorFactory: Refunds.ProposeRefundError,
      },
      options,
    );
  }

  /**
   * Reject a proposed refund
   *
   * @remarks
   * Reject a proposed refund.
   *
   * @returns Rejected
   *
   * @throws {@link Refunds.RejectRefundError} when the API answers with an error status — narrow on
   * `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  rejectRefund(
    request: Refunds.RejectRefundRequest,
    options?: RequestOptions,
  ): ApiPromise<RefundRequest, Refunds.RejectRefundError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/refunds/{id}/reject"),
        auth: this.#auth.opsKey,
        pathParams: [{ name: "id", value: request.id, schema: s.string() }],
        query: [],
        headers: [
          { name: "X-Ops-Key", value: request.xOpsKey, schema: s.string() },
          { name: "Idempotency-Key", value: uuid(), schema: s.string() },
        ],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: refundRequestSchema },
        errorFactory: Refunds.RejectRefundError,
      },
      options,
    );
  }
}

export namespace Refunds {
  export type ApproveRefundRequest = {
    /** Value for the id parameter. */
    id: string;
    /** Merchant key. */
    xOpsKey: string;
  };

  export class ApproveRefundError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"refundRequest", RefundRequest>
      | Declared<"error4", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<ApproveRefundError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 404, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 409, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 502, kind: "refundRequest", decode: { kind: "json", schema: refundRequestSchema } },
      { on: 503, kind: "error4", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type ListRefundsRequest = {
    /** Merchant key. */
    xOpsKey: string;
  };

  export class ListRefundsError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<ListRefundsError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type ProposeRefundRequestParams = {
    /** Merchant key. */
    xOpsKey: string;
    /** Details of the refund request to propose. Proposing moves no money. */
    body: ProposeRefundRequest;
  };

  export class ProposeRefundError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"error4", Error>
      | Declared<"error5", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<ProposeRefundError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 404, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 409, kind: "error4", decode: { kind: "json", schema: errorSchema } },
      { on: 422, kind: "error5", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type RejectRefundRequest = {
    /** Value for the id parameter. */
    id: string;
    /** Merchant key. */
    xOpsKey: string;
  };

  export class RejectRefundError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<RejectRefundError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 404, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 409, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

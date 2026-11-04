import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import { allAuth, noneAuth } from "../core/auth/schemes.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import { uuid } from "../core/uuid.js";
import * as s from "../core/validation/index.js";
import { createOrderRequestSchema, type CreateOrderRequest } from "../models/create-order-request.js";
import { createOrderResponseSchema, type CreateOrderResponse } from "../models/create-order-response.js";
import { errorSchema, type Error } from "../models/error.js";
import { ordersListResponseSchema, type OrdersListResponse } from "../models/orders-list-response.js";
import { ordersStatsSchema, type OrdersStats } from "../models/orders-stats.js";
import { origin2Schema, type Origin2 } from "../models/origin2.js";
import type { Servers } from "../servers.js";

/**
 * Order creation, capture, cancel (PayPal)
 */
export class Orders {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * PayPal cancel redirect
   *
   * @remarks
   * PayPal cancel redirect.
   *
   * @returns HTML redirect page
   *
   * @throws {@link Orders.GetCheckoutCancelError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getCheckoutCancel(
    request: Orders.GetCheckoutCancelRequest,
    options?: RequestOptions,
  ): ApiPromise<undefined, Orders.GetCheckoutCancelError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/checkout/cancel"),
        auth: noneAuth,
        pathParams: [],
        query: [{ name: "token", value: request.token, schema: s.string() }],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "empty" },
        errorFactory: Orders.GetCheckoutCancelError,
      },
      options,
    );
  }

  /**
   * PayPal return redirect
   *
   * @remarks
   * PayPal return redirect.
   *
   * @returns HTML redirect page
   *
   * @throws {@link Orders.GetCheckoutReturnError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getCheckoutReturn(
    request: Orders.GetCheckoutReturnRequest,
    options?: RequestOptions,
  ): ApiPromise<undefined, Orders.GetCheckoutReturnError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/checkout/return"),
        auth: noneAuth,
        pathParams: [],
        query: [{ name: "token", value: request.token, schema: s.string() }],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "empty" },
        errorFactory: Orders.GetCheckoutReturnError,
      },
      options,
    );
  }

  /**
   * List orders public, read-only
   *
   * @remarks
   * Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401
   * without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default
   * DASHBOARD_PUBLIC=true the route is open and returns a minimised view.
   *
   * @returns Orders
   *
   * @throws {@link Orders.GetOrdersError} when the API answers with an error status — narrow on
   * `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getOrders(
    request: Orders.GetOrdersRequest = {},
    options?: RequestOptions,
  ): ApiPromise<OrdersListResponse, Orders.GetOrdersError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/orders"),
        auth: this.#auth.opsKey,
        pathParams: [],
        query: [
          { name: "origin", value: request.origin, schema: s.optional(s.lazy(() => origin2Schema)) },
          { name: "status", value: request.status, schema: s.optional(s.string()) },
          { name: "limit", value: request.limit, schema: s.optional(s.int()) },
        ],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: ordersListResponseSchema },
        errorFactory: Orders.GetOrdersError,
      },
      options,
    );
  }

  /**
   * Aggregate order statistics
   *
   * @remarks
   * Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401
   * without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default
   * DASHBOARD_PUBLIC=true the route is open and returns a minimised view.
   *
   * @returns Stats
   *
   * @throws {@link Orders.GetOrdersStatsError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getOrdersStats(options?: RequestOptions): ApiPromise<OrdersStats, Orders.GetOrdersStatsError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/orders/stats"),
        auth: this.#auth.opsKey,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: ordersStatsSchema },
        errorFactory: Orders.GetOrdersStatsError,
      },
      options,
    );
  }

  /**
   * Create an order from items server re-prices; policy enforced
   *
   * @remarks
   * Create an order from items (server re-prices; policy enforced).
   *
   * @returns Order created
   *
   * @throws {@link Orders.PostOrdersCreateError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postOrdersCreate(
    request: Orders.PostOrdersCreateRequest,
    options?: RequestOptions,
  ): ApiPromise<CreateOrderResponse, Orders.PostOrdersCreateError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/orders/create"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: request.idempotencyKey, schema: s.optional(s.string()) }],
        body: { kind: "json", value: request.body, schema: createOrderRequestSchema },
      },
      {
        success: { kind: "json", schema: createOrderResponseSchema },
        errorFactory: Orders.PostOrdersCreateError,
      },
      options,
    );
  }

  /**
   * Cancel a not-yet-captured checkout
   *
   * @remarks
   * Cancel a not-yet-captured checkout.
   *
   * @returns Cancelled
   *
   * @throws {@link Orders.PostOrdersOrderIdCancelError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postOrdersOrderIdCancel(
    request: Orders.PostOrdersOrderIdCancelRequest,
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, Orders.PostOrdersOrderIdCancelError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/orders/{orderId}/cancel"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [{ name: "orderId", value: request.orderId, schema: s.string() }],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: Orders.PostOrdersOrderIdCancelError,
      },
      options,
    );
  }

  /**
   * Capture the PayPal order after human approval
   *
   * @remarks
   * Capture the PayPal order (after human approval).
   *
   * @returns Captured
   *
   * @throws {@link Orders.PostOrdersOrderIdCaptureError} when the API answers with an error status
   * — narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postOrdersOrderIdCapture(
    request: Orders.PostOrdersOrderIdCaptureRequest,
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, Orders.PostOrdersOrderIdCaptureError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/orders/{orderId}/capture"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [{ name: "orderId", value: request.orderId, schema: s.string() }],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: Orders.PostOrdersOrderIdCaptureError,
      },
      options,
    );
  }

  /**
   * PayPal webhook receiver signature-verified
   *
   * @remarks
   * PayPal webhook receiver (signature-verified).
   *
   * @returns Processed / duplicate acknowledged
   *
   * @throws {@link Orders.PostWebhooksPaypalError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postWebhooksPaypal(options?: RequestOptions): ApiPromise<undefined, Orders.PostWebhooksPaypalError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/webhooks/paypal"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "empty" },
      },
      {
        success: { kind: "empty" },
        errorFactory: Orders.PostWebhooksPaypalError,
      },
      options,
    );
  }
}

export namespace Orders {
  export type GetCheckoutCancelRequest = {
    /** PayPal approval token returned when the order was created. */
    token: string;
  };

  export class GetCheckoutCancelError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetCheckoutCancelError> = [
      { on: [400, 499], kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type GetCheckoutReturnRequest = {
    /** PayPal approval token returned when the order was created. */
    token: string;
  };

  export class GetCheckoutReturnError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetCheckoutReturnError> = [
      { on: [400, 499], kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type GetOrdersRequest = {
    /** Value for the origin parameter. */
    origin?: Origin2;
    /** Value for the status parameter. */
    status?: string;
    /** Value for the limit parameter. */
    limit?: number;
  };

  export class GetOrdersError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"error4", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<GetOrdersError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error4", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export class GetOrdersStatsError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<GetOrdersStatsError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostOrdersCreateRequest = {
    /** Client key; server hashes it with the session and reuses as PayPal-Request-Id. */
    idempotencyKey?: string;
    /** The items to order. The server re-prices authoritatively and enforces policy. */
    body: CreateOrderRequest;
  };

  export class PostOrdersCreateError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"error4", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<PostOrdersCreateError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 403, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error4", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostOrdersOrderIdCancelRequest = {
    /** Value for the orderId parameter. */
    orderId: string;
  };

  export class PostOrdersOrderIdCancelError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Declared<"error2", Error> | Undeclared;

    static readonly errors: ErrorDecoders<PostOrdersOrderIdCancelError> = [
      { on: 404, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 409, kind: "error2", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostOrdersOrderIdCaptureRequest = {
    /** Value for the orderId parameter. */
    orderId: string;
  };

  export class PostOrdersOrderIdCaptureError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"error4", Error>
      | Declared<"error5", Error>
      | Declared<"error6", Error>
      | Declared<"error7", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<PostOrdersOrderIdCaptureError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 402, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 404, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 409, kind: "error4", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error5", decode: { kind: "json", schema: errorSchema } },
      { on: 502, kind: "error6", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error7", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export class PostWebhooksPaypalError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<PostWebhooksPaypalError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

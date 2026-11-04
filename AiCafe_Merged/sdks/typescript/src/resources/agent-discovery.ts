import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import { noneAuth } from "../core/auth/schemes.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import * as s from "../core/validation/index.js";
import { errorSchema, type Error } from "../models/error.js";
import type { Servers } from "../servers.js";

/**
 * Machine-readable entry points for AI agents
 */
export class AgentDiscovery {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;

  constructor(rawClient: RawClient, servers: Servers) {
    this.#rawClient = rawClient;
    this.#servers = servers;
  }

  /**
   * Agent card generated from the manifest
   *
   * @remarks
   * Compact card generated from /.well-known/agent-commerce.json; cannot disagree with it.
   *
   * @returns OK
   *
   * @throws {@link AgentDiscovery.GetAgentCardError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getAgentCard(
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, AgentDiscovery.GetAgentCardError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/.well-known/agent.json"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: AgentDiscovery.GetAgentCardError,
      },
      options,
    );
  }

  /**
   * Canonical agent-commerce manifest
   *
   * @remarks
   * Single source of truth for AI agents: merchant, endpoints, MCP tool names (derived from the
   * real MCP registry), guardrails (agentCanPay/Capture/Refund = false), policy limits, Cart
   * Mandate verification info and disclaimers. Custom aicafe.* format; not an official PayPal Agent
   * Ready, Store Sync or AP2 integration. URLs come from PUBLIC_BASE_URL (required in production);
   * public cache only when it is configured.
   *
   * @returns OK
   *
   * @throws {@link AgentDiscovery.GetAgentCommerceManifestError} when the API answers with an error
   * status — narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getAgentCommerceManifest(
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, AgentDiscovery.GetAgentCommerceManifestError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/.well-known/agent-commerce.json"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: AgentDiscovery.GetAgentCommerceManifestError,
      },
      options,
    );
  }

  /**
   * Product feed schema.org-style ItemList
   *
   * @remarks
   * Custom schema.org-style JSON-LD ItemList of Product/Offer entries with server catalog prices
   * (price decimal string, additionalProperty priceMinor/dietary). Not an official PayPal Store
   * Sync feed. Read-only, ETag-revalidatable.
   *
   * @returns OK
   *
   * @throws {@link AgentDiscovery.GetFeedProductsError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getFeedProducts(
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, AgentDiscovery.GetFeedProductsError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/feed/products"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: AgentDiscovery.GetFeedProductsError,
      },
      options,
    );
  }

  /**
   * llms.txt generated from the manifest
   *
   * @remarks
   * Plain-text summary generated from /.well-known/agent-commerce.json.
   *
   * @returns OK
   *
   * @throws {@link AgentDiscovery.GetLlmsTxtError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getLlmsTxt(options?: RequestOptions): ApiPromise<string, AgentDiscovery.GetLlmsTxtError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/llms.txt"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "text", schema: s.string() },
        errorFactory: AgentDiscovery.GetLlmsTxtError,
      },
      options,
    );
  }

  /**
   * Public signing keys JWK set
   *
   * @remarks
   * Active and previous Ed25519 PUBLIC keys (status: active|previous), keyPersistence
   * (configured|ephemeral) and the canonicalization label. 503 if the key configuration is invalid.
   *
   * @returns JWK set
   *
   * @throws {@link AgentDiscovery.GetMandateKeysError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getMandateKeys(
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, AgentDiscovery.GetMandateKeysError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/.well-known/mandate-keys.json"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: AgentDiscovery.GetMandateKeysError,
      },
      options,
    );
  }
}

export namespace AgentDiscovery {
  export class GetAgentCardError extends ApiError {
    declare readonly payload: Declared<"error503", Record<string, unknown>> | Undeclared;

    static readonly errors: ErrorDecoders<GetAgentCardError> = [
      { on: 503, kind: "error503", decode: { kind: "json", schema: s.record(s.string(), s.unknown()) } },
    ];
  }

  export class GetAgentCommerceManifestError extends ApiError {
    declare readonly payload: Declared<"error503", Record<string, unknown>> | Undeclared;

    static readonly errors: ErrorDecoders<GetAgentCommerceManifestError> = [
      { on: 503, kind: "error503", decode: { kind: "json", schema: s.record(s.string(), s.unknown()) } },
    ];
  }

  export class GetFeedProductsError extends ApiError {
    declare readonly payload: Declared<"error503", Record<string, unknown>> | Undeclared;

    static readonly errors: ErrorDecoders<GetFeedProductsError> = [
      { on: 503, kind: "error503", decode: { kind: "json", schema: s.record(s.string(), s.unknown()) } },
    ];
  }

  export class GetLlmsTxtError extends ApiError {
    declare readonly payload: Declared<"error503", Record<string, unknown>> | Undeclared;

    static readonly errors: ErrorDecoders<GetLlmsTxtError> = [
      { on: 503, kind: "error503", decode: { kind: "json", schema: s.record(s.string(), s.unknown()) } },
    ];
  }

  export class GetMandateKeysError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetMandateKeysError> = [
      { on: 503, kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

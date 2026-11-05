import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import { noneAuth } from "../core/auth/schemes.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import * as s from "../core/validation/index.js";
import { catalogResponseSchema, type CatalogResponse } from "../models/catalog-response.js";
import { errorSchema, type Error } from "../models/error.js";
import { matchModeSchema, type MatchMode } from "../models/match-mode.js";
import { productSchema, type Product } from "../models/product.js";
import type { Servers } from "../servers.js";

/**
 * Product catalog (read-only)
 */
export class Catalog {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;

  constructor(rawClient: RawClient, servers: Servers) {
    this.#rawClient = rawClient;
    this.#servers = servers;
  }

  /**
   * List all products
   *
   * @remarks
   * List all products.
   *
   * @returns Catalog
   *
   * @throws {@link Catalog.GetCatalogError} when the API answers with an error status — narrow on
   * `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getCatalog(options?: RequestOptions): ApiPromise<CatalogResponse, Catalog.GetCatalogError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/catalog"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: catalogResponseSchema },
        errorFactory: Catalog.GetCatalogError,
      },
      options,
    );
  }

  /**
   * Get a product by id
   *
   * @remarks
   * Get a product by id.
   *
   * @returns Product
   *
   * @throws {@link Catalog.GetCatalogIdError} when the API answers with an error status — narrow on
   * `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getCatalogId(
    request: Catalog.GetCatalogIdRequest,
    options?: RequestOptions,
  ): ApiPromise<Product, Catalog.GetCatalogIdError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/catalog/{id}"),
        auth: noneAuth,
        pathParams: [{ name: "id", value: request.id, schema: s.string() }],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: productSchema },
        errorFactory: Catalog.GetCatalogIdError,
      },
      options,
    );
  }

  /**
   * Search the catalog server-side filtering
   *
   * @remarks
   * Search the catalog (server-side filtering).
   *
   * @returns Search results
   *
   * @throws {@link Catalog.GetCatalogSearchError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getCatalogSearch(
    request: Catalog.GetCatalogSearchRequest = {},
    options?: RequestOptions,
  ): ApiPromise<CatalogResponse, Catalog.GetCatalogSearchError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/catalog/search"),
        auth: noneAuth,
        pathParams: [],
        query: [
          { name: "query", value: request.query, schema: s.optional(s.string()) },
          { name: "category", value: request.category, schema: s.optional(s.string()) },
          { name: "tags", value: request.tags, schema: s.optional(s.string()) },
          { name: "dietary", value: request.dietary, schema: s.optional(s.string()) },
          { name: "occasion", value: request.occasion, schema: s.optional(s.string()) },
          { name: "maxPriceMinor", value: request.maxPriceMinor, schema: s.optional(s.int()) },
          { name: "matchMode", value: request.matchMode, schema: s.optional(s.lazy(() => matchModeSchema)) },
        ],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: catalogResponseSchema },
        errorFactory: Catalog.GetCatalogSearchError,
      },
      options,
    );
  }
}

export namespace Catalog {
  export class GetCatalogError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetCatalogError> = [
      { on: [400, 499], kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type GetCatalogIdRequest = {
    /** Value for the id parameter. */
    id: string;
  };

  export class GetCatalogIdError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetCatalogIdError> = [
      { on: 404, kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type GetCatalogSearchRequest = {
    /** Value for the query parameter. */
    query?: string;
    /** Value for the category parameter. */
    category?: string;
    /** Comma-separated */
    tags?: string;
    /** Comma-separated; e.g. vegan,gluten-free */
    dietary?: string;
    /** Value for the occasion parameter. */
    occasion?: string;
    /** Value for the maxPriceMinor parameter. */
    maxPriceMinor?: number;
    /** Value for the matchMode parameter. */
    matchMode?: MatchMode;
  };

  export class GetCatalogSearchError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetCatalogSearchError> = [
      { on: [400, 499], kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import { allAuth, noneAuth } from "../core/auth/schemes.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import { uuid } from "../core/uuid.js";
import * as s from "../core/validation/index.js";
import {
  allowanceScopeApproveInputSchema,
  type AllowanceScopeApproveInput,
} from "../models/allowance-scope-approve-input.js";
import {
  allowanceScopeCreateInputSchema,
  type AllowanceScopeCreateInput,
} from "../models/allowance-scope-create-input.js";
import {
  allowanceScopeDetailResponseSchema,
  type AllowanceScopeDetailResponse,
} from "../models/allowance-scope-detail-response.js";
import {
  allowanceScopeListResponseSchema,
  type AllowanceScopeListResponse,
} from "../models/allowance-scope-list-response.js";
import { allowanceScopeSchema, type AllowanceScope } from "../models/allowance-scope.js";
import { errorSchema, type Error } from "../models/error.js";
import { policyPreviewRequestSchema, type PolicyPreviewRequest } from "../models/policy-preview-request.js";
import {
  policyPreviewResponseSchema,
  type PolicyPreviewResponse,
} from "../models/policy-preview-response.js";
import { takeHomeRequestSchema, type TakeHomeRequest } from "../models/take-home-request.js";
import { takeHomeResponseSchema, type TakeHomeResponse } from "../models/take-home-response.js";
import type { Servers } from "../servers.js";

/**
 * Human-in-the-loop price & spend policy
 */
export class Policy {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * Get one scope with its audit trail
   *
   * @remarks
   * Returns the scope plus its event trail. Only the owning session may read it.
   *
   * @returns Scope with audit
   *
   * @throws {@link Policy.GetPolicyScopeError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getPolicyScope(
    request: Policy.GetPolicyScopeRequest,
    options?: RequestOptions,
  ): ApiPromise<AllowanceScopeDetailResponse, Policy.GetPolicyScopeError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/policy/scopes/{scopeId}"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [{ name: "scopeId", value: request.scopeId, schema: s.string() }],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: allowanceScopeDetailResponseSchema },
        errorFactory: Policy.GetPolicyScopeError,
      },
      options,
    );
  }

  /**
   * List the shopper's scoped allowances
   *
   * @remarks
   * Returns all scopes owned by the authenticated session.
   *
   * @returns Scopes
   *
   * @throws {@link Policy.GetPolicyScopesError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  getPolicyScopes(
    options?: RequestOptions,
  ): ApiPromise<AllowanceScopeListResponse, Policy.GetPolicyScopesError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/api/policy/scopes"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: allowanceScopeListResponseSchema },
        errorFactory: Policy.GetPolicyScopesError,
      },
      options,
    );
  }

  /**
   * Preview the authoritative policy decision for a cart side-effect free
   *
   * @remarks
   * Preview the authoritative policy decision for a cart (side-effect free).
   *
   * @returns Preview
   *
   * @throws {@link Policy.PostPolicyPreviewError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postPolicyPreview(
    request: Policy.PostPolicyPreviewRequest,
    options?: RequestOptions,
  ): ApiPromise<PolicyPreviewResponse, Policy.PostPolicyPreviewError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/policy/preview"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "json", value: request.body, schema: policyPreviewRequestSchema },
      },
      {
        success: { kind: "json", schema: policyPreviewResponseSchema },
        errorFactory: Policy.PostPolicyPreviewError,
      },
      options,
    );
  }

  /**
   * Approve a pending scope or confirm a limit increase
   *
   * @remarks
   * Activates a PENDING scope, or records a fresh shopper approval for a limit increase. Limits
   * remain capped by the global ceiling.
   *
   * @returns Approved
   *
   * @throws {@link Policy.PostPolicyScopeApproveError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postPolicyScopeApprove(
    request: Policy.PostPolicyScopeApproveRequest,
    options?: RequestOptions,
  ): ApiPromise<AllowanceScope, Policy.PostPolicyScopeApproveError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/policy/scopes/{scopeId}/approve"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [{ name: "scopeId", value: request.scopeId, schema: s.string() }],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "json", value: request.body, schema: allowanceScopeApproveInputSchema },
      },
      {
        success: { kind: "json", schema: allowanceScopeSchema },
        errorFactory: Policy.PostPolicyScopeApproveError,
      },
      options,
    );
  }

  /**
   * Revoke a scoped allowance
   *
   * @remarks
   * Revokes a scope. Subsequent checkouts bound to it fail closed.
   *
   * @returns Revoked
   *
   * @throws {@link Policy.PostPolicyScopeRevokeError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postPolicyScopeRevoke(
    request: Policy.PostPolicyScopeRevokeRequest,
    options?: RequestOptions,
  ): ApiPromise<AllowanceScope, Policy.PostPolicyScopeRevokeError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/policy/scopes/{scopeId}/revoke"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [{ name: "scopeId", value: request.scopeId, schema: s.string() }],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: allowanceScopeSchema },
        errorFactory: Policy.PostPolicyScopeRevokeError,
      },
      options,
    );
  }

  /**
   * Create a scoped allowance
   *
   * @remarks
   * Creates a scope. A HUMAN issuer yields an ACTIVE scope; an AI-prepared session yields a PENDING
   * (agent-proposed) scope awaiting shopper approval.
   *
   * @returns Created
   *
   * @throws {@link Policy.PostPolicyScopesError} when the API answers with an error status — narrow
   * on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postPolicyScopes(
    request: Policy.PostPolicyScopesRequest,
    options?: RequestOptions,
  ): ApiPromise<AllowanceScope, Policy.PostPolicyScopesError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/policy/scopes"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "json", value: request.body, schema: allowanceScopeCreateInputSchema },
      },
      {
        success: { kind: "json", schema: allowanceScopeSchema },
        errorFactory: Policy.PostPolicyScopesError,
      },
      options,
    );
  }

  /**
   * Take-it-home suggestions Channel3
   *
   * @remarks
   * Read-only product discovery through Channel3. The query is built on the server from the catalog
   * category of the cart items; no client text is forwarded. Results are outbound retailer links:
   * not part of the PayPal cart, not covered by the spending allowance, never paid through this
   * API. Returns enabled=false when no Channel3 key is configured.
   *
   * @returns Suggestions (possibly empty or disabled)
   *
   * @throws {@link Policy.PostTakeHomeSuggestionsError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postTakeHomeSuggestions(
    request: Policy.PostTakeHomeSuggestionsRequest,
    options?: RequestOptions,
  ): ApiPromise<TakeHomeResponse, Policy.PostTakeHomeSuggestionsError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/discover/take-home"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "json", value: request.body, schema: takeHomeRequestSchema },
      },
      {
        success: { kind: "json", schema: takeHomeResponseSchema },
        errorFactory: Policy.PostTakeHomeSuggestionsError,
      },
      options,
    );
  }
}

export namespace Policy {
  export type GetPolicyScopeRequest = {
    scopeId: string;
  };

  export class GetPolicyScopeError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Declared<"error2", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetPolicyScopeError> = [
      { on: 404, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export class GetPolicyScopesError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Declared<"error2", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetPolicyScopesError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostPolicyPreviewRequest = {
    /** The cart items whose policy decision should be previewed (side-effect free). */
    body: PolicyPreviewRequest;
  };

  export class PostPolicyPreviewError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Declared<"error2", Error> | Undeclared;

    static readonly errors: ErrorDecoders<PostPolicyPreviewError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error2", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostPolicyScopeApproveRequest = {
    scopeId: string;
    body: AllowanceScopeApproveInput;
  };

  export class PostPolicyScopeApproveError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"error4", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<PostPolicyScopeApproveError> = [
      { on: 404, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 409, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 422, kind: "error4", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostPolicyScopeRevokeRequest = {
    scopeId: string;
  };

  export class PostPolicyScopeRevokeError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Declared<"error2", Error> | Undeclared;

    static readonly errors: ErrorDecoders<PostPolicyScopeRevokeError> = [
      { on: 404, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostPolicyScopesRequest = {
    body: AllowanceScopeCreateInput;
  };

  export class PostPolicyScopesError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<PostPolicyScopesError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 422, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostTakeHomeSuggestionsRequest = {
    body: TakeHomeRequest;
  };

  export class PostTakeHomeSuggestionsError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"error4", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<PostTakeHomeSuggestionsError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 502, kind: "error4", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

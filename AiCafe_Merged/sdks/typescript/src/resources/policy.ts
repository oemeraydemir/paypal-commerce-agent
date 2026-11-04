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
import { policyPreviewRequestSchema, type PolicyPreviewRequest } from "../models/policy-preview-request.js";
import {
  policyPreviewResponseSchema,
  type PolicyPreviewResponse,
} from "../models/policy-preview-response.js";
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
}

export namespace Policy {
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
}

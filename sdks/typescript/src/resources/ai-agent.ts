import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import { allAuth } from "../core/auth/schemes.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import { uuid } from "../core/uuid.js";
import * as s from "../core/validation/index.js";
import { aiChatRequestSchema, type AiChatRequest } from "../models/ai-chat-request.js";
import { aiChatResponseSchema, type AiChatResponse } from "../models/ai-chat-response.js";
import { errorSchema, type Error } from "../models/error.js";
import type { Servers } from "../servers.js";

/**
 * Natural-language cart builder
 */
export class AiAgent {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * Clear the AI-prepared cart for this session
   *
   * @remarks
   * Clear the AI-prepared cart for this session.
   *
   * @returns Cleared
   *
   * @throws {@link AiAgent.DeleteAiCartSessionIdError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  deleteAiCartSessionId(
    request: AiAgent.DeleteAiCartSessionIdRequest,
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, AiAgent.DeleteAiCartSessionIdError> {
    return this.#rawClient.execute(
      {
        method: "DELETE",
        urlTemplate: this.#servers.default("/api/ai/cart/{sessionId}"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [{ name: "sessionId", value: request.sessionId, schema: s.string() }],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: AiAgent.DeleteAiCartSessionIdError,
      },
      options,
    );
  }

  /**
   * Clear conversation history for this session
   *
   * @remarks
   * Clear conversation history for this session.
   *
   * @returns Cleared
   *
   * @throws {@link AiAgent.DeleteAiChatSessionIdError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  deleteAiChatSessionId(
    request: AiAgent.DeleteAiChatSessionIdRequest,
    options?: RequestOptions,
  ): ApiPromise<Record<string, unknown>, AiAgent.DeleteAiChatSessionIdError> {
    return this.#rawClient.execute(
      {
        method: "DELETE",
        urlTemplate: this.#servers.default("/api/ai/chat/{sessionId}"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [{ name: "sessionId", value: request.sessionId, schema: s.string() }],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.record(s.string(), s.unknown()) },
        errorFactory: AiAgent.DeleteAiChatSessionIdError,
      },
      options,
    );
  }

  /**
   * Chat with the shopping agent builds a cart
   *
   * @remarks
   * Chat with the shopping agent (builds a cart).
   *
   * @returns Agent reply + prepared cart
   *
   * @throws {@link AiAgent.PostAiChatError} when the API answers with an error status — narrow on
   * `err.payload.kind`
   *
   * @throws {@link AiCafPayPalCommerceAgentApiError} when no usable response was produced: a
   * connection failure, a timeout, a body that would not decode, a value that would not encode, or
   * a credential that could not be obtained
   */
  postAiChat(
    request: AiAgent.PostAiChatRequest,
    options?: RequestOptions,
  ): ApiPromise<AiChatResponse, AiAgent.PostAiChatError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/api/ai/chat"),
        auth: allAuth(this.#auth.sessionId, this.#auth.bearerAuth),
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: uuid(), schema: s.string() }],
        body: { kind: "json", value: request.body, schema: aiChatRequestSchema },
      },
      {
        success: { kind: "json", schema: aiChatResponseSchema },
        errorFactory: AiAgent.PostAiChatError,
      },
      options,
    );
  }
}

export namespace AiAgent {
  export type DeleteAiCartSessionIdRequest = {
    /** Value for the sessionId parameter. */
    sessionId: string;
  };

  export class DeleteAiCartSessionIdError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<DeleteAiCartSessionIdError> = [
      { on: 403, kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type DeleteAiChatSessionIdRequest = {
    /** Value for the sessionId parameter. */
    sessionId: string;
  };

  export class DeleteAiChatSessionIdError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<DeleteAiChatSessionIdError> = [
      { on: 403, kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type PostAiChatRequest = {
    /** The user's chat message plus optional shopper preferences used to prepare a cart. */
    body: AiChatRequest;
  };

  export class PostAiChatError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<PostAiChatError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 503, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}

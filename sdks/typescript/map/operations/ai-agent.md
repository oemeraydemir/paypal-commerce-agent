<!-- Generated file — do not edit; regenerated with the SDK. -->

# AiAgent — operations

Accessor: `client.aiAgent` · Source: `src/resources/ai-agent.ts` · 3 operations · Request and error types: namespace `AiAgent`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### deleteAiCartSessionId

- **Signature**: `deleteAiCartSessionId(request: AiAgent.DeleteAiCartSessionIdRequest, options?: RequestOptions): ApiPromise<Record<string, unknown>, AiAgent.DeleteAiCartSessionIdError>`
- **Wire**: `DELETE /api/ai/cart/{sessionId}`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `AiAgent.DeleteAiCartSessionIdError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [403] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `AiAgent.DeleteAiCartSessionIdRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `sessionId` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |

### deleteAiChatSessionId

- **Signature**: `deleteAiChatSessionId(request: AiAgent.DeleteAiChatSessionIdRequest, options?: RequestOptions): ApiPromise<Record<string, unknown>, AiAgent.DeleteAiChatSessionIdError>`
- **Wire**: `DELETE /api/ai/chat/{sessionId}`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `AiAgent.DeleteAiChatSessionIdError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [403] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `AiAgent.DeleteAiChatSessionIdRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `sessionId` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postAiChat

- **Signature**: `postAiChat(request: AiAgent.PostAiChatRequest, options?: RequestOptions): ApiPromise<AiChatResponse, AiAgent.PostAiChatError>`
- **Wire**: `POST /api/ai/chat`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `AiChatResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `AiAgent.PostAiChatError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [429] `Error` · `"error3"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `AiAgent.PostAiChatRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `body` | `body` | `AiChatRequest` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `AiChatRequest` | `aiChatRequestSchema` | `src/models/ai-chat-request.ts` |
| `AiChatResponse` | `aiChatResponseSchema` | `src/models/ai-chat-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


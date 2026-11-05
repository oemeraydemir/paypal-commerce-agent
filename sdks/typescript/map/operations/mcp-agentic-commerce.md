<!-- Generated file — do not edit; regenerated with the SDK. -->

# McpAgenticCommerce — operations

Accessor: `client.mcpAgenticCommerce` · Source: `src/resources/mcp-agentic-commerce.ts` · 2 operations · Request and error types: namespace `McpAgenticCommerce`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### mcpEndSession

- **Signature**: `mcpEndSession(request: McpAgenticCommerce.McpEndSessionRequest, options?: RequestOptions): ApiPromise<undefined, McpAgenticCommerce.McpEndSessionError>`
- **Wire**: `DELETE /api/mcp`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `undefined` — the operation resolves to nothing
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `McpAgenticCommerce.McpEndSessionError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [404] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `McpAgenticCommerce.McpEndSessionRequest` (1):

| Field | Channel | Wire | Type | Req |
| --- | --- | --- | --- | --- |
| `mcpSessionId` | `header` | `Mcp-Session-Id` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |

### mcpRpc

- **Signature**: `mcpRpc(request: McpAgenticCommerce.McpRpcRequest, options?: RequestOptions): ApiPromise<McpResponse, McpAgenticCommerce.McpRpcError>`
- **Wire**: `POST /api/mcp`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `McpResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `McpAgenticCommerce.McpRpcError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [403] `Error` · `"error2"` [404] `Error` · `"error3"` [429] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `McpAgenticCommerce.McpRpcRequest` (2):

| Field | Channel | Wire | Type | Req |
| --- | --- | --- | --- | --- |
| `mcpSessionId` | `header` | `Mcp-Session-Id` | `string` | no |
| `body` | `body` | — | `McpRequest` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `McpRequest` | `mcpRequestSchema` | `src/models/mcp-request.ts` |
| `McpResponse` | `mcpResponseSchema` | `src/models/mcp-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


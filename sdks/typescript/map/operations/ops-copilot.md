<!-- Generated file — do not edit; regenerated with the SDK. -->

# OpsCopilot — operations

Accessor: `client.opsCopilot` · Source: `src/resources/ops-copilot.ts` · 2 operations · Request and error types: namespace `OpsCopilot`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getOpsStatus

- **Signature**: `getOpsStatus(options?: RequestOptions): ApiPromise<OpsStatus, OpsCopilot.GetOpsStatusError>`
- **Wire**: `GET /api/ops/status`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `OpsStatus`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `OpsCopilot.GetOpsStatusError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [4XX wildcard] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `OpsStatus` | `opsStatusSchema` | `src/models/ops-status.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postOpsAsk

- **Signature**: `postOpsAsk(request: OpsCopilot.PostOpsAskRequest, options?: RequestOptions): ApiPromise<Record<string, unknown>, OpsCopilot.PostOpsAskError>`
- **Wire**: `POST /api/ops/ask`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `OpsCopilot.PostOpsAskError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [429] `Error` · `"error3"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `OpsCopilot.PostOpsAskRequest` (2):

| Field | Channel | Wire | Type | Req |
| --- | --- | --- | --- | --- |
| `xOpsKey` | `header` | `X-Ops-Key` | `string` | no |
| `body` | `body` | — | `OpsAskRequest` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `OpsAskRequest` | `opsAskRequestSchema` | `src/models/ops-ask-request.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


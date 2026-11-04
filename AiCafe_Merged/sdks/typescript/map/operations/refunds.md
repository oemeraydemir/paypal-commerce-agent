<!-- Generated file — do not edit; regenerated with the SDK. -->

# Refunds — operations

Accessor: `client.refunds` · Source: `src/resources/refunds.ts` · 4 operations · Request and error types: namespace `Refunds`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### approveRefund

- **Signature**: `approveRefund(request: Refunds.ApproveRefundRequest, options?: RequestOptions): ApiPromise<RefundRequest, Refunds.ApproveRefundError>`
- **Wire**: `POST /api/refunds/{id}/approve`
- **Auth**: `opsKey`
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `RefundRequest`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Refunds.ApproveRefundError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [404] `Error` · `"error3"` [409] `Error` · `"refundRequest"` [502] `RefundRequest` · `"error4"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Refunds.ApproveRefundRequest` (2):

| Field | Channel | Wire | Type | Req |
| --- | --- | --- | --- | --- |
| `id` | `path` | — | `string` | yes |
| `xOpsKey` | `header` | `X-Ops-Key` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `RefundRequest` | `refundRequestSchema` | `src/models/refund-request.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### listRefunds

- **Signature**: `listRefunds(request: Refunds.ListRefundsRequest, options?: RequestOptions): ApiPromise<ApiRefundsResponse, Refunds.ListRefundsError>`
- **Wire**: `GET /api/refunds`
- **Auth**: `opsKey`
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `ApiRefundsResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Refunds.ListRefundsError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [429] `Error` · `"error3"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Refunds.ListRefundsRequest` (1):

| Field | Channel | Wire | Type | Req |
| --- | --- | --- | --- | --- |
| `xOpsKey` | `header` | `X-Ops-Key` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `ApiRefundsResponse` | `apiRefundsResponseSchema` | `src/models/api-refunds-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### proposeRefund

- **Signature**: `proposeRefund(request: Refunds.ProposeRefundRequestParams, options?: RequestOptions): ApiPromise<RefundRequest, Refunds.ProposeRefundError>`
- **Wire**: `POST /api/refunds/propose`
- **Auth**: `opsKey`
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `RefundRequest`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Refunds.ProposeRefundError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [401] `Error` · `"error3"` [404] `Error` · `"error4"` [409] `Error` · `"error5"` [422] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Refunds.ProposeRefundRequestParams` (2):

| Field | Channel | Wire | Type | Req |
| --- | --- | --- | --- | --- |
| `xOpsKey` | `header` | `X-Ops-Key` | `string` | yes |
| `body` | `body` | — | `ProposeRefundRequest` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `ProposeRefundRequest` | `proposeRefundRequestSchema` | `src/models/propose-refund-request.ts` |
| `RefundRequest` | `refundRequestSchema` | `src/models/refund-request.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### rejectRefund

- **Signature**: `rejectRefund(request: Refunds.RejectRefundRequest, options?: RequestOptions): ApiPromise<RefundRequest, Refunds.RejectRefundError>`
- **Wire**: `POST /api/refunds/{id}/reject`
- **Auth**: `opsKey`
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `RefundRequest`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Refunds.RejectRefundError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [404] `Error` · `"error3"` [409] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Refunds.RejectRefundRequest` (2):

| Field | Channel | Wire | Type | Req |
| --- | --- | --- | --- | --- |
| `id` | `path` | — | `string` | yes |
| `xOpsKey` | `header` | `X-Ops-Key` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `RefundRequest` | `refundRequestSchema` | `src/models/refund-request.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


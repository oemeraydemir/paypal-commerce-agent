<!-- Generated file — do not edit; regenerated with the SDK. -->

# Mandates — operations

Accessor: `client.mandates` · Source: `src/resources/mandates.ts` · 2 operations · Request and error types: namespace `Mandates`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getOrderMandate

- **Signature**: `getOrderMandate(request: Mandates.GetOrderMandateRequest, options?: RequestOptions): ApiPromise<SignedCartMandate, Mandates.GetOrderMandateError>`
- **Wire**: `GET /api/orders/{orderId}/mandate`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `SignedCartMandate`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Mandates.GetOrderMandateError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [404] `Error` · `"error3"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Mandates.GetOrderMandateRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `orderId` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `SignedCartMandate` | `signedCartMandateSchema` | `src/models/signed-cart-mandate.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postMandatesVerify

- **Signature**: `postMandatesVerify(request: Mandates.PostMandatesVerifyRequest, options?: RequestOptions): ApiPromise<MandateVerification, Mandates.PostMandatesVerifyError>`
- **Wire**: `POST /api/mandates/verify`
- **Auth**: none — public; no credential is sent
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `MandateVerification`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Mandates.PostMandatesVerifyError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Mandates.PostMandatesVerifyRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `body` | `body` | `SignedCartMandate` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `SignedCartMandate` | `signedCartMandateSchema` | `src/models/signed-cart-mandate.ts` |
| `MandateVerification` | `mandateVerificationSchema` | `src/models/mandate-verification.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


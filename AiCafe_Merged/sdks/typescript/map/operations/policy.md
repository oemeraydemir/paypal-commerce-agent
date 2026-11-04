<!-- Generated file — do not edit; regenerated with the SDK. -->

# Policy — operations

Accessor: `client.policy` · Source: `src/resources/policy.ts` · 1 operation · Request and error types: namespace `Policy`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### postPolicyPreview

- **Signature**: `postPolicyPreview(request: Policy.PostPolicyPreviewRequest, options?: RequestOptions): ApiPromise<PolicyPreviewResponse, Policy.PostPolicyPreviewError>`
- **Wire**: `POST /api/policy/preview`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `PolicyPreviewResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Policy.PostPolicyPreviewError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [429] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Policy.PostPolicyPreviewRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `body` | `body` | `PolicyPreviewRequest` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `PolicyPreviewRequest` | `policyPreviewRequestSchema` | `src/models/policy-preview-request.ts` |
| `PolicyPreviewResponse` | `policyPreviewResponseSchema` | `src/models/policy-preview-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


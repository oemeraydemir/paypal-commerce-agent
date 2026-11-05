<!-- Generated file — do not edit; regenerated with the SDK. -->

# Policy — operations

Accessor: `client.policy` · Source: `src/resources/policy.ts` · 7 operations · Request and error types: namespace `Policy`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getPolicyScope

- **Signature**: `getPolicyScope(request: Policy.GetPolicyScopeRequest, options?: RequestOptions): ApiPromise<AllowanceScopeDetailResponse, Policy.GetPolicyScopeError>`
- **Wire**: `GET /api/policy/scopes/{scopeId}`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `AllowanceScopeDetailResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Policy.GetPolicyScopeError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [404] `Error` · `"error2"` [401] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Policy.GetPolicyScopeRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `scopeId` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `AllowanceScopeDetailResponse` | `allowanceScopeDetailResponseSchema` | `src/models/allowance-scope-detail-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### getPolicyScopes

- **Signature**: `getPolicyScopes(options?: RequestOptions): ApiPromise<AllowanceScopeListResponse, Policy.GetPolicyScopesError>`
- **Wire**: `GET /api/policy/scopes`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `AllowanceScopeListResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Policy.GetPolicyScopesError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [401] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `AllowanceScopeListResponse` | `allowanceScopeListResponseSchema` | `src/models/allowance-scope-list-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

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

### postPolicyScopeApprove

- **Signature**: `postPolicyScopeApprove(request: Policy.PostPolicyScopeApproveRequest, options?: RequestOptions): ApiPromise<AllowanceScope, Policy.PostPolicyScopeApproveError>`
- **Wire**: `POST /api/policy/scopes/{scopeId}/approve`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `AllowanceScope`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Policy.PostPolicyScopeApproveError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [404] `Error` · `"error2"` [401] `Error` · `"error3"` [409] `Error` · `"error4"` [422] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Policy.PostPolicyScopeApproveRequest` (2):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `scopeId` | `path` | `string` | yes |
| `body` | `body` | `AllowanceScopeApproveInput` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `AllowanceScopeApproveInput` | `allowanceScopeApproveInputSchema` | `src/models/allowance-scope-approve-input.ts` |
| `AllowanceScope` | `allowanceScopeSchema` | `src/models/allowance-scope.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postPolicyScopeRevoke

- **Signature**: `postPolicyScopeRevoke(request: Policy.PostPolicyScopeRevokeRequest, options?: RequestOptions): ApiPromise<AllowanceScope, Policy.PostPolicyScopeRevokeError>`
- **Wire**: `POST /api/policy/scopes/{scopeId}/revoke`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `AllowanceScope`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Policy.PostPolicyScopeRevokeError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [404] `Error` · `"error2"` [401] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Policy.PostPolicyScopeRevokeRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `scopeId` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `AllowanceScope` | `allowanceScopeSchema` | `src/models/allowance-scope.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postPolicyScopes

- **Signature**: `postPolicyScopes(request: Policy.PostPolicyScopesRequest, options?: RequestOptions): ApiPromise<AllowanceScope, Policy.PostPolicyScopesError>`
- **Wire**: `POST /api/policy/scopes`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `AllowanceScope`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Policy.PostPolicyScopesError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [401] `Error` · `"error3"` [422] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Policy.PostPolicyScopesRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `body` | `body` | `AllowanceScopeCreateInput` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `AllowanceScopeCreateInput` | `allowanceScopeCreateInputSchema` | `src/models/allowance-scope-create-input.ts` |
| `AllowanceScope` | `allowanceScopeSchema` | `src/models/allowance-scope.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postTakeHomeSuggestions

- **Signature**: `postTakeHomeSuggestions(request: Policy.PostTakeHomeSuggestionsRequest, options?: RequestOptions): ApiPromise<TakeHomeResponse, Policy.PostTakeHomeSuggestionsError>`
- **Wire**: `POST /api/discover/take-home`
- **Auth**: none — public; no credential is sent
- **Request body**: `application/json` — the `body` field
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `TakeHomeResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Policy.PostTakeHomeSuggestionsError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [401] `Error` · `"error3"` [429] `Error` · `"error4"` [502] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Policy.PostTakeHomeSuggestionsRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `body` | `body` | `TakeHomeRequest` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `TakeHomeRequest` | `takeHomeRequestSchema` | `src/models/take-home-request.ts` |
| `TakeHomeResponse` | `takeHomeResponseSchema` | `src/models/take-home-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


<!-- Generated file — do not edit; regenerated with the SDK. -->

# Policy — operations

Accessor: `client.policy` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/policy.py` · 1 operation

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.policy.post_policy_preview

- **Route**: `POST /api/policy/preview`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def post_policy_preview(body: PolicyPreviewRequest | PolicyPreviewRequestDict, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `body`
- **Params**: `body` — JSON body
- **Returns (parsed)**: `PolicyPreviewResponse`
- **Returns (raw)**: `ApiResult[PolicyPreviewResponse, PostPolicyPreviewErrorBody]`
- **Error**: `PostPolicyPreviewErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [400, 429] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `PolicyPreviewRequest` | `ai_caf_pay_pal_commerce_agent_api/models/policy_preview_request.py` |
| `PolicyPreviewRequestDict` | `ai_caf_pay_pal_commerce_agent_api/models/policy_preview_request.py` |
| `PolicyPreviewResponse` | `ai_caf_pay_pal_commerce_agent_api/models/policy_preview_response.py` |
| `PostPolicyPreviewErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/post_policy_preview_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


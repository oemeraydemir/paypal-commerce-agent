<!-- Generated file — do not edit; regenerated with the SDK. -->

# Refunds — operations

Accessor: `client.refunds` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/refunds.py` · 4 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.refunds.approve_refund

- **Route**: `POST /api/refunds/{id}/approve`
- **Auth**: `ops_key`
- **Signature**: `def approve_refund(id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `id_`, `x_ops_key`
- **Params**: `id_` — path `id` · `x_ops_key` — header `X-Ops-Key`
- **Returns (parsed)**: `RefundRequest`
- **Returns (raw)**: `ApiResult[RefundRequest, ApproveRefundErrorBody]`
- **Error**: `ApproveRefundErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [401, 404, 409, 503] · `RefundRequest` [502] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `RefundRequest` | `ai_caf_pay_pal_commerce_agent_api/models/refund_request.py` |
| `ApproveRefundErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/approve_refund_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.refunds.list_refunds

- **Route**: `GET /api/refunds`
- **Auth**: `ops_key`
- **Signature**: `def list_refunds(x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `x_ops_key`
- **Params**: `x_ops_key` — header `X-Ops-Key`
- **Returns (parsed)**: `ApiRefundsResponse`
- **Returns (raw)**: `ApiResult[ApiRefundsResponse, ListRefundsErrorBody]`
- **Error**: `ListRefundsErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [401, 429, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `ApiRefundsResponse` | `ai_caf_pay_pal_commerce_agent_api/models/api_refunds_response.py` |
| `ListRefundsErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/list_refunds_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.refunds.propose_refund

- **Route**: `POST /api/refunds/propose`
- **Auth**: `ops_key`
- **Signature**: `def propose_refund(x_ops_key: str, body: ProposeRefundRequest | ProposeRefundRequestDict, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `x_ops_key`, `body`
- **Params**: `x_ops_key` — header `X-Ops-Key` · `body` — JSON body
- **Returns (parsed)**: `RefundRequest`
- **Returns (raw)**: `ApiResult[RefundRequest, ProposeRefundErrorBody]`
- **Error**: `ProposeRefundErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [400, 401, 404, 409, 422] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `ProposeRefundRequest` | `ai_caf_pay_pal_commerce_agent_api/models/propose_refund_request.py` |
| `ProposeRefundRequestDict` | `ai_caf_pay_pal_commerce_agent_api/models/propose_refund_request.py` |
| `RefundRequest` | `ai_caf_pay_pal_commerce_agent_api/models/refund_request.py` |
| `ProposeRefundErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/propose_refund_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.refunds.reject_refund

- **Route**: `POST /api/refunds/{id}/reject`
- **Auth**: `ops_key`
- **Signature**: `def reject_refund(id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `id_`, `x_ops_key`
- **Params**: `id_` — path `id` · `x_ops_key` — header `X-Ops-Key`
- **Returns (parsed)**: `RefundRequest`
- **Returns (raw)**: `ApiResult[RefundRequest, RejectRefundErrorBody]`
- **Error**: `RejectRefundErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [401, 404, 409] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `RefundRequest` | `ai_caf_pay_pal_commerce_agent_api/models/refund_request.py` |
| `RejectRefundErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/reject_refund_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


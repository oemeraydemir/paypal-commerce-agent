<!-- Generated file — do not edit; regenerated with the SDK. -->

# OpsCopilot — operations

Accessor: `client.ops_copilot` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/ops_copilot.py` · 2 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.ops_copilot.get_ops_status

- **Route**: `GET /api/ops/status`
- **Signature**: `def get_ops_status(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `OpsStatus`
- **Returns (raw)**: `ApiResult[OpsStatus, GetOpsStatusErrorBody]`
- **Error**: `GetOpsStatusErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [4XX] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `OpsStatus` | `ai_caf_pay_pal_commerce_agent_api/models/ops_status.py` |
| `GetOpsStatusErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_ops_status_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.ops_copilot.post_ops_ask

- **Route**: `POST /api/ops/ask`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def post_ops_ask(body: OpsAskRequest | OpsAskRequestDict, *, x_ops_key: str | None = None, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `body`
- **Params**: `x_ops_key` — header `X-Ops-Key` · `body` — JSON body
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, PostOpsAskErrorBody]`
- **Error**: `PostOpsAskErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [401, 429, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `OpsAskRequest` | `ai_caf_pay_pal_commerce_agent_api/models/ops_ask_request.py` |
| `OpsAskRequestDict` | `ai_caf_pay_pal_commerce_agent_api/models/ops_ask_request.py` |
| `PostOpsAskErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/post_ops_ask_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


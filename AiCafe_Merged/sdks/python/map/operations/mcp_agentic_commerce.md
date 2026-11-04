<!-- Generated file — do not edit; regenerated with the SDK. -->

# McpAgenticCommerce — operations

Accessor: `client.mcp_agentic_commerce` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/mcp_agentic_commerce.py` · 2 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.mcp_agentic_commerce.mcp_end_session

- **Route**: `DELETE /api/mcp`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def mcp_end_session(mcp_session_id: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `mcp_session_id`
- **Params**: `mcp_session_id` — header `Mcp-Session-Id`
- **Returns (parsed)**: `None`
- **Returns (raw)**: `ApiResult[None, McpEndSessionErrorBody]`
- **Error**: `McpEndSessionErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [404] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `McpEndSessionErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/mcp_end_session_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.mcp_agentic_commerce.mcp_rpc

- **Route**: `POST /api/mcp`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def mcp_rpc(body: McpRequest | McpRequestDict, *, mcp_session_id: str | None = None, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `body`
- **Params**: `mcp_session_id` — header `Mcp-Session-Id` · `body` — JSON body
- **Returns (parsed)**: `McpResponse`
- **Returns (raw)**: `ApiResult[McpResponse, McpRpcErrorBody]`
- **Error**: `McpRpcErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [403, 404, 429] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `McpRequest` | `ai_caf_pay_pal_commerce_agent_api/models/mcp_request.py` |
| `McpRequestDict` | `ai_caf_pay_pal_commerce_agent_api/models/mcp_request.py` |
| `McpResponse` | `ai_caf_pay_pal_commerce_agent_api/models/mcp_response.py` |
| `McpRpcErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/mcp_rpc_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


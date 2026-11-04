<!-- Generated file — do not edit; regenerated with the SDK. -->

# AiAgent — operations

Accessor: `client.ai_agent` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/ai_agent.py` · 3 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.ai_agent.delete_ai_cart_session_id

- **Route**: `DELETE /api/ai/cart/{sessionId}`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def delete_ai_cart_session_id(session_id: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `session_id`
- **Params**: `session_id` — path `sessionId`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, DeleteAiCartSessionIdErrorBody]`
- **Error**: `DeleteAiCartSessionIdErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [403] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `DeleteAiCartSessionIdErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/delete_ai_cart_session_id_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.ai_agent.delete_ai_chat_session_id

- **Route**: `DELETE /api/ai/chat/{sessionId}`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def delete_ai_chat_session_id(session_id: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `session_id`
- **Params**: `session_id` — path `sessionId`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, DeleteAiChatSessionIdErrorBody]`
- **Error**: `DeleteAiChatSessionIdErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [403] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `DeleteAiChatSessionIdErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/delete_ai_chat_session_id_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.ai_agent.post_ai_chat

- **Route**: `POST /api/ai/chat`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def post_ai_chat(body: AiChatRequest | AiChatRequestDict, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `body`
- **Params**: `body` — JSON body
- **Returns (parsed)**: `AiChatResponse`
- **Returns (raw)**: `ApiResult[AiChatResponse, PostAiChatErrorBody]`
- **Error**: `PostAiChatErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [400, 429, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `AiChatRequest` | `ai_caf_pay_pal_commerce_agent_api/models/ai_chat_request.py` |
| `AiChatRequestDict` | `ai_caf_pay_pal_commerce_agent_api/models/ai_chat_request.py` |
| `AiChatResponse` | `ai_caf_pay_pal_commerce_agent_api/models/ai_chat_response.py` |
| `PostAiChatErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/post_ai_chat_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


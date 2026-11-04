<!-- Generated file — do not edit; regenerated with the SDK. -->

# Sessions — operations

Accessor: `client.sessions` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/sessions.py` · 3 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.sessions.delete_sessions_current

- **Route**: `DELETE /api/sessions/current`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def delete_sessions_current(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, DeleteSessionsCurrentErrorBody]`
- **Error**: `DeleteSessionsCurrentErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [4XX] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `DeleteSessionsCurrentErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/delete_sessions_current_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.sessions.get_health

- **Route**: `GET /api/health`
- **Signature**: `def get_health(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, GetHealthErrorBody]`
- **Error**: `GetHealthErrorBody` — **Case A (typed)**
- **Error arms**: `Any` [503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `GetHealthErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_health_error.py` |

### client.sessions.post_sessions

- **Route**: `POST /api/sessions`
- **Signature**: `def post_sessions(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `IssuedSession`
- **Returns (raw)**: `ApiResult[IssuedSession, PostSessionsErrorBody]`
- **Error**: `PostSessionsErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [429] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `IssuedSession` | `ai_caf_pay_pal_commerce_agent_api/models/issued_session.py` |
| `PostSessionsErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/post_sessions_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


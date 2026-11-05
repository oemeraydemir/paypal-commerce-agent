<!-- Generated file — do not edit; regenerated with the SDK. -->

# Audit — operations

Accessor: `client.audit` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/audit.py` · 2 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.audit.get_policy_events

- **Route**: `GET /api/policy-events`
- **Auth**: `ops_key`
- **Signature**: `def get_policy_events(*, decision: PolicyDecisionOrStr | None = None, user_id: str | None = None, limit: int | None = None, request_options: RequestOptionsOrDict | None = None)`
- **Params**: `decision` — query · `user_id` — query `userId` · `limit` — query
- **Returns (parsed)**: `PolicyEventsResponse`
- **Returns (raw)**: `ApiResult[PolicyEventsResponse, GetPolicyEventsErrorBody]`
- **Error**: `GetPolicyEventsErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [400, 401, 429, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `PolicyDecisionOrStr` | `ai_caf_pay_pal_commerce_agent_api/models/enums/policy_decision.py` |
| `PolicyEventsResponse` | `ai_caf_pay_pal_commerce_agent_api/models/policy_events_response.py` |
| `GetPolicyEventsErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_policy_events_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.audit.get_policy_events_stats

- **Route**: `GET /api/policy-events/stats`
- **Auth**: `ops_key`
- **Signature**: `def get_policy_events_stats(*, user_id: str | None = None, request_options: RequestOptionsOrDict | None = None)`
- **Params**: `user_id` — query `userId`
- **Returns (parsed)**: `PolicyEventsStats`
- **Returns (raw)**: `ApiResult[PolicyEventsStats, GetPolicyEventsStatsErrorBody]`
- **Error**: `GetPolicyEventsStatsErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [401, 429, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `PolicyEventsStats` | `ai_caf_pay_pal_commerce_agent_api/models/policy_events_stats.py` |
| `GetPolicyEventsStatsErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_policy_events_stats_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


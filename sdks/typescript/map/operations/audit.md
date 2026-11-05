<!-- Generated file — do not edit; regenerated with the SDK. -->

# Audit — operations

Accessor: `client.audit` · Source: `src/resources/audit.ts` · 2 operations · Request and error types: namespace `Audit`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getPolicyEvents

- **Signature**: `getPolicyEvents(request?: Audit.GetPolicyEventsRequest, options?: RequestOptions): ApiPromise<PolicyEventsResponse, Audit.GetPolicyEventsError>`
- **Wire**: `GET /api/policy-events`
- **Auth**: `opsKey`
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `PolicyEventsResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Audit.GetPolicyEventsError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [401] `Error` · `"error3"` [429] `Error` · `"error4"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Audit.GetPolicyEventsRequest` (3):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `decision` | `query` | `PolicyDecision` | no |
| `userId` | `query` | `string` | no |
| `limit` | `query` | `number` | no |

| Type | Schema value | Source |
| --- | --- | --- |
| `PolicyDecision` | `policyDecisionSchema` | `src/models/policy-decision.ts` |
| `PolicyEventsResponse` | `policyEventsResponseSchema` | `src/models/policy-events-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### getPolicyEventsStats

- **Signature**: `getPolicyEventsStats(request?: Audit.GetPolicyEventsStatsRequest, options?: RequestOptions): ApiPromise<PolicyEventsStats, Audit.GetPolicyEventsStatsError>`
- **Wire**: `GET /api/policy-events/stats`
- **Auth**: `opsKey`
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `PolicyEventsStats`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Audit.GetPolicyEventsStatsError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [429] `Error` · `"error3"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Audit.GetPolicyEventsStatsRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `userId` | `query` | `string` | no |

| Type | Schema value | Source |
| --- | --- | --- |
| `PolicyEventsStats` | `policyEventsStatsSchema` | `src/models/policy-events-stats.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


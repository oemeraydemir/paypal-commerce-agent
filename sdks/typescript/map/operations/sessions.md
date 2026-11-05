<!-- Generated file — do not edit; regenerated with the SDK. -->

# Sessions — operations

Accessor: `client.sessions` · Source: `src/resources/sessions.ts` · 3 operations · Request and error types: namespace `Sessions`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### deleteSessionsCurrent

- **Signature**: `deleteSessionsCurrent(options?: RequestOptions): ApiPromise<Record<string, unknown>, Sessions.DeleteSessionsCurrentError>`
- **Wire**: `DELETE /api/sessions/current`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Sessions.DeleteSessionsCurrentError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [4XX wildcard] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |

### getHealth

- **Signature**: `getHealth(options?: RequestOptions): ApiPromise<Record<string, unknown>, Sessions.GetHealthError>`
- **Wire**: `GET /api/health`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Sessions.GetHealthError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error503"` [503] `Record<string, unknown>` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

### postSessions

- **Signature**: `postSessions(options?: RequestOptions): ApiPromise<IssuedSession, Sessions.PostSessionsError>`
- **Wire**: `POST /api/sessions`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `IssuedSession`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Sessions.PostSessionsError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [429] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `IssuedSession` | `issuedSessionSchema` | `src/models/issued-session.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


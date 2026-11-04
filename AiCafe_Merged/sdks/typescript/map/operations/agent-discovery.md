<!-- Generated file — do not edit; regenerated with the SDK. -->

# AgentDiscovery — operations

Accessor: `client.agentDiscovery` · Source: `src/resources/agent-discovery.ts` · 5 operations · Request and error types: namespace `AgentDiscovery`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getAgentCard

- **Signature**: `getAgentCard(options?: RequestOptions): ApiPromise<Record<string, unknown>, AgentDiscovery.GetAgentCardError>`
- **Wire**: `GET /.well-known/agent.json`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `AgentDiscovery.GetAgentCardError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error503"` [503] `Record<string, unknown>` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

### getAgentCommerceManifest

- **Signature**: `getAgentCommerceManifest(options?: RequestOptions): ApiPromise<Record<string, unknown>, AgentDiscovery.GetAgentCommerceManifestError>`
- **Wire**: `GET /.well-known/agent-commerce.json`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `AgentDiscovery.GetAgentCommerceManifestError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error503"` [503] `Record<string, unknown>` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

### getFeedProducts

- **Signature**: `getFeedProducts(options?: RequestOptions): ApiPromise<Record<string, unknown>, AgentDiscovery.GetFeedProductsError>`
- **Wire**: `GET /api/feed/products`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `AgentDiscovery.GetFeedProductsError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error503"` [503] `Record<string, unknown>` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

### getLlmsTxt

- **Signature**: `getLlmsTxt(options?: RequestOptions): ApiPromise<string, AgentDiscovery.GetLlmsTxtError>`
- **Wire**: `GET /llms.txt`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `string` — `text/plain;charset=utf-8`, decoded by the plain-text scalar decoder, not by a model
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `AgentDiscovery.GetLlmsTxtError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error503"` [503] `Record<string, unknown>` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

### getMandateKeys

- **Signature**: `getMandateKeys(options?: RequestOptions): ApiPromise<Record<string, unknown>, AgentDiscovery.GetMandateKeysError>`
- **Wire**: `GET /.well-known/mandate-keys.json`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `AgentDiscovery.GetMandateKeysError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |


<!-- Generated file — do not edit; regenerated with the SDK. -->

# Catalog — operations

Accessor: `client.catalog` · Source: `src/resources/catalog.ts` · 3 operations · Request and error types: namespace `Catalog`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getCatalog

- **Signature**: `getCatalog(options?: RequestOptions): ApiPromise<CatalogResponse, Catalog.GetCatalogError>`
- **Wire**: `GET /api/catalog`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `CatalogResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Catalog.GetCatalogError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [4XX wildcard] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `CatalogResponse` | `catalogResponseSchema` | `src/models/catalog-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### getCatalogId

- **Signature**: `getCatalogId(request: Catalog.GetCatalogIdRequest, options?: RequestOptions): ApiPromise<Product, Catalog.GetCatalogIdError>`
- **Wire**: `GET /api/catalog/{id}`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `Product`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Catalog.GetCatalogIdError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [404] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Catalog.GetCatalogIdRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `id` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `Product` | `productSchema` | `src/models/product.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### getCatalogSearch

- **Signature**: `getCatalogSearch(request?: Catalog.GetCatalogSearchRequest, options?: RequestOptions): ApiPromise<CatalogResponse, Catalog.GetCatalogSearchError>`
- **Wire**: `GET /api/catalog/search`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `CatalogResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Catalog.GetCatalogSearchError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [4XX wildcard] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Catalog.GetCatalogSearchRequest` (7):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `query` | `query` | `string` | no |
| `category` | `query` | `string` | no |
| `tags` | `query` | `string` | no |
| `dietary` | `query` | `string` | no |
| `occasion` | `query` | `string` | no |
| `maxPriceMinor` | `query` | `number` | no |
| `matchMode` | `query` | `MatchMode` | no |

| Type | Schema value | Source |
| --- | --- | --- |
| `MatchMode` | `matchModeSchema` | `src/models/match-mode.ts` |
| `CatalogResponse` | `catalogResponseSchema` | `src/models/catalog-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |


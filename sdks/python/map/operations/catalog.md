<!-- Generated file — do not edit; regenerated with the SDK. -->

# Catalog — operations

Accessor: `client.catalog` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/catalog.py` · 3 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.catalog.get_catalog

- **Route**: `GET /api/catalog`
- **Signature**: `def get_catalog(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `CatalogResponse`
- **Returns (raw)**: `ApiResult[CatalogResponse, GetCatalogErrorBody]`
- **Error**: `GetCatalogErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [4XX] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `CatalogResponse` | `ai_caf_pay_pal_commerce_agent_api/models/catalog_response.py` |
| `GetCatalogErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.catalog.get_catalog_id

- **Route**: `GET /api/catalog/{id}`
- **Signature**: `def get_catalog_id(id_: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `id_`
- **Params**: `id_` — path `id`
- **Returns (parsed)**: `Product`
- **Returns (raw)**: `ApiResult[Product, GetCatalogIdErrorBody]`
- **Error**: `GetCatalogIdErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [404] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `Product` | `ai_caf_pay_pal_commerce_agent_api/models/product.py` |
| `GetCatalogIdErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_id_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.catalog.get_catalog_search

- **Route**: `GET /api/catalog/search`
- **Signature**: `def get_catalog_search(*, query: str | None = None, category: str | None = None, tags: str | None = None, dietary: str | None = None, occasion: str | None = None, max_price_minor: int | None = None, match_mode: MatchModeOrStr | None = None, request_options: RequestOptionsOrDict | None = None)`
- **Params**: `query` — query · `category` — query · `tags` — query · `dietary` — query · `occasion` — query · `max_price_minor` — query `maxPriceMinor` · `match_mode` — query `matchMode`
- **Returns (parsed)**: `CatalogResponse`
- **Returns (raw)**: `ApiResult[CatalogResponse, GetCatalogSearchErrorBody]`
- **Error**: `GetCatalogSearchErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [4XX] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `MatchModeOrStr` | `ai_caf_pay_pal_commerce_agent_api/models/enums/match_mode.py` |
| `CatalogResponse` | `ai_caf_pay_pal_commerce_agent_api/models/catalog_response.py` |
| `GetCatalogSearchErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_search_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


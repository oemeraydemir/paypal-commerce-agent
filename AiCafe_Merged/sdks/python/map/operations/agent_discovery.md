<!-- Generated file — do not edit; regenerated with the SDK. -->

# AgentDiscovery — operations

Accessor: `client.agent_discovery` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/agent_discovery.py` · 5 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.agent_discovery.get_agent_card

- **Route**: `GET /.well-known/agent.json`
- **Signature**: `def get_agent_card(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, GetAgentCardErrorBody]`
- **Error**: `GetAgentCardErrorBody` — **Case A (typed)**
- **Error arms**: `Any` [503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `GetAgentCardErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_agent_card_error.py` |

### client.agent_discovery.get_agent_commerce_manifest

- **Route**: `GET /.well-known/agent-commerce.json`
- **Signature**: `def get_agent_commerce_manifest(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, GetAgentCommerceManifestErrorBody]`
- **Error**: `GetAgentCommerceManifestErrorBody` — **Case A (typed)**
- **Error arms**: `Any` [503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `GetAgentCommerceManifestErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_agent_commerce_manifest_error.py` |

### client.agent_discovery.get_feed_products

- **Route**: `GET /api/feed/products`
- **Signature**: `def get_feed_products(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, GetFeedProductsErrorBody]`
- **Error**: `GetFeedProductsErrorBody` — **Case A (typed)**
- **Error arms**: `Any` [503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `GetFeedProductsErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_feed_products_error.py` |

### client.agent_discovery.get_llms_txt

- **Route**: `GET /llms.txt`
- **Signature**: `def get_llms_txt(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `str`
- **Returns (raw)**: `ApiResult[str, GetLlmsTxtErrorBody]`
- **Error**: `GetLlmsTxtErrorBody` — **Case A (typed)**
- **Error arms**: `Any` [503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `GetLlmsTxtErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_llms_txt_error.py` |

### client.agent_discovery.get_mandate_keys

- **Route**: `GET /.well-known/mandate-keys.json`
- **Signature**: `def get_mandate_keys(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, GetMandateKeysErrorBody]`
- **Error**: `GetMandateKeysErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `GetMandateKeysErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_mandate_keys_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


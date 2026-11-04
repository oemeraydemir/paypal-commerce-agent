# Reference

**Parsed** endpoints return the typed payload and raise `ApiError` on a documented non-2xx. For the raw endpoints, see [Raw API Reference](raw-api-reference.md).

> Source: [AiCafPayPalCommerceAgentApiClient](ai_caf_pay_pal_commerce_agent_api/client.py)

## AiAgent

> Source: [AiAgent](ai_caf_pay_pal_commerce_agent_api/apis/ai_agent.py)

<details>
<summary><code>def delete_ai_cart_session_id(session_id: str, *, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Clear the AI-prepared cart for this session.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.ai_agent.delete_ai_cart_session_id("s_01HZX")
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type DeleteAiCartSessionIdErrorBody
```

**Async**

```python
try:
    response = await async_client.ai_agent.delete_ai_cart_session_id("s_01HZX")
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type DeleteAiCartSessionIdErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>session_id</code> | <code>str</code> | Value for the sessionId parameter. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- Cleared

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[DeleteAiCartSessionIdErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/delete_ai_cart_session_id_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 403 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def delete_ai_chat_session_id(session_id: str, *, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Clear conversation history for this session.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.ai_agent.delete_ai_chat_session_id("s_01HZX")
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type DeleteAiChatSessionIdErrorBody
```

**Async**

```python
try:
    response = await async_client.ai_agent.delete_ai_chat_session_id("s_01HZX")
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type DeleteAiChatSessionIdErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>session_id</code> | <code>str</code> | Value for the sessionId parameter. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- Cleared

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[DeleteAiChatSessionIdErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/delete_ai_chat_session_id_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 403 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def post_ai_chat(body: AiChatRequest | AiChatRequestDict, *, request_options: RequestOptionsOrDict | None = None) -> AiChatResponse</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Chat with the shopping agent (builds a cart).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.ai_agent.post_ai_chat(AiChatRequest(message="some example string"))
    # TODO: Handle 'response' of type AiChatResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostAiChatErrorBody
```

**Async**

```python
try:
    response = await async_client.ai_agent.post_ai_chat(AiChatRequest(message="some example string"))
    # TODO: Handle 'response' of type AiChatResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostAiChatErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[AiChatRequest](ai_caf_pay_pal_commerce_agent_api/models/ai_chat_request.py) \| [AiChatRequestDict](ai_caf_pay_pal_commerce_agent_api/models/ai_chat_request.py)</code> | The user's chat message plus optional shopper preferences used to prepare a cart. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[AiChatResponse](ai_caf_pay_pal_commerce_agent_api/models/ai_chat_response.py)</code> -- Agent reply + prepared cart

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[PostAiChatErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_ai_chat_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400, 429, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## AgentDiscovery

> Source: [AgentDiscovery](ai_caf_pay_pal_commerce_agent_api/apis/agent_discovery.py)

<details>
<summary><code>def get_agent_card(*, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Compact card generated from /.well-known/agent-commerce.json; cannot disagree with it.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.agent_discovery.get_agent_card()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetAgentCardErrorBody
```

**Async**

```python
try:
    response = await async_client.agent_discovery.get_agent_card()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetAgentCardErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- OK

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetAgentCardErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_agent_card_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 503 | <code>Any</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_agent_commerce_manifest(*, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Single source of truth for AI agents: merchant, endpoints, MCP tool names (derived from the real MCP registry), guardrails (agentCanPay/Capture/Refund = false), policy limits, Cart Mandate verification info and disclaimers. Custom aicafe.* format; not an official PayPal Agent Ready, Store Sync or AP2 integration. URLs come from PUBLIC_BASE_URL (required in production); public cache only when it is configured.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.agent_discovery.get_agent_commerce_manifest()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetAgentCommerceManifestErrorBody
```

**Async**

```python
try:
    response = await async_client.agent_discovery.get_agent_commerce_manifest()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetAgentCommerceManifestErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- OK

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetAgentCommerceManifestErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_agent_commerce_manifest_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 503 | <code>Any</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_feed_products(*, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Custom schema.org-style JSON-LD ItemList of Product/Offer entries with server catalog prices (price decimal string, additionalProperty priceMinor/dietary). Not an official PayPal Store Sync feed. Read-only, ETag-revalidatable.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.agent_discovery.get_feed_products()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetFeedProductsErrorBody
```

**Async**

```python
try:
    response = await async_client.agent_discovery.get_feed_products()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetFeedProductsErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- OK

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetFeedProductsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_feed_products_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 503 | <code>Any</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_llms_txt(*, request_options: RequestOptionsOrDict | None = None) -> str</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Plain-text summary generated from /.well-known/agent-commerce.json.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.agent_discovery.get_llms_txt()
    # TODO: Handle 'response' of type str
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetLlmsTxtErrorBody
```

**Async**

```python
try:
    response = await async_client.agent_discovery.get_llms_txt()
    # TODO: Handle 'response' of type str
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetLlmsTxtErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>str</code> -- OK

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetLlmsTxtErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_llms_txt_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 503 | <code>Any</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_mandate_keys(*, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Active and previous Ed25519 PUBLIC keys (status: active|previous), keyPersistence (configured|ephemeral) and the canonicalization label. 503 if the key configuration is invalid.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.agent_discovery.get_mandate_keys()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetMandateKeysErrorBody
```

**Async**

```python
try:
    response = await async_client.agent_discovery.get_mandate_keys()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetMandateKeysErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- JWK set

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetMandateKeysErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_mandate_keys_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## Audit

> Source: [Audit](ai_caf_pay_pal_commerce_agent_api/apis/audit.py)

<details>
<summary><code>def get_policy_events(*, decision: PolicyDecisionOrStr | None = None, user_id: str | None = None, limit: int | None = None, request_options: RequestOptionsOrDict | None = None) -> PolicyEventsResponse</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open and returns a minimised view.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.audit.get_policy_events(user_id="demo", limit=20)
    # TODO: Handle 'response' of type PolicyEventsResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetPolicyEventsErrorBody
```

**Async**

```python
try:
    response = await async_client.audit.get_policy_events(user_id="demo", limit=20)
    # TODO: Handle 'response' of type PolicyEventsResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetPolicyEventsErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>decision</code> | <code>[PolicyDecisionOrStr](ai_caf_pay_pal_commerce_agent_api/models/enums/policy_decision.py) \| None</code> | Value for the decision parameter.<br>**Default**: <code>None</code> |
| <code>user_id</code> | <code>str \| None</code> | Value for the userId parameter.<br>**Default**: <code>None</code> |
| <code>limit</code> | <code>int \| None</code> | Value for the limit parameter.<br>**Default**: <code>None</code> |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[PolicyEventsResponse](ai_caf_pay_pal_commerce_agent_api/models/policy_events_response.py)</code> -- Events

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetPolicyEventsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_policy_events_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400, 401, 429, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_policy_events_stats(*, user_id: str | None = None, request_options: RequestOptionsOrDict | None = None) -> PolicyEventsStats</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open and returns a minimised view.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.audit.get_policy_events_stats(user_id="demo")
    # TODO: Handle 'response' of type PolicyEventsStats
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetPolicyEventsStatsErrorBody
```

**Async**

```python
try:
    response = await async_client.audit.get_policy_events_stats(user_id="demo")
    # TODO: Handle 'response' of type PolicyEventsStats
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetPolicyEventsStatsErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>user_id</code> | <code>str \| None</code> | Value for the userId parameter.<br>**Default**: <code>None</code> |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[PolicyEventsStats](ai_caf_pay_pal_commerce_agent_api/models/policy_events_stats.py)</code> -- Stats

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetPolicyEventsStatsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_policy_events_stats_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 401, 429, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## Catalog

> Source: [Catalog](ai_caf_pay_pal_commerce_agent_api/apis/catalog.py)

<details>
<summary><code>def get_catalog(*, request_options: RequestOptionsOrDict | None = None) -> CatalogResponse</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

List all products.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.catalog.get_catalog()
    # TODO: Handle 'response' of type CatalogResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCatalogErrorBody
```

**Async**

```python
try:
    response = await async_client.catalog.get_catalog()
    # TODO: Handle 'response' of type CatalogResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCatalogErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[CatalogResponse](ai_caf_pay_pal_commerce_agent_api/models/catalog_response.py)</code> -- Catalog

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetCatalogErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400-499 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_catalog_id(id_: str, *, request_options: RequestOptionsOrDict | None = None) -> Product</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Get a product by id.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.catalog.get_catalog_id("coffee")
    # TODO: Handle 'response' of type Product
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCatalogIdErrorBody
```

**Async**

```python
try:
    response = await async_client.catalog.get_catalog_id("coffee")
    # TODO: Handle 'response' of type Product
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCatalogIdErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>id_</code> | <code>str</code> | Value for the id parameter. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[Product](ai_caf_pay_pal_commerce_agent_api/models/product.py)</code> -- Product

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetCatalogIdErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_id_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 404 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_catalog_search(*, query: str | None = None, category: str | None = None, tags: str | None = None, dietary: str | None = None, occasion: str | None = None, max_price_minor: int | None = None, match_mode: MatchModeOrStr | None = None, request_options: RequestOptionsOrDict | None = None) -> CatalogResponse</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Search the catalog (server-side filtering).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.catalog.get_catalog_search(
        query="flat white",
        category="drinks",
        tags="coffee",
        dietary="vegetarian",
        occasion="morning",
        max_price_minor=1000,
    )
    # TODO: Handle 'response' of type CatalogResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCatalogSearchErrorBody
```

**Async**

```python
try:
    response = await async_client.catalog.get_catalog_search(
        query="flat white",
        category="drinks",
        tags="coffee",
        dietary="vegetarian",
        occasion="morning",
        max_price_minor=1000,
    )
    # TODO: Handle 'response' of type CatalogResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCatalogSearchErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>query</code> | <code>str \| None</code> | Value for the query parameter.<br>**Default**: <code>None</code> |
| <code>category</code> | <code>str \| None</code> | Value for the category parameter.<br>**Default**: <code>None</code> |
| <code>tags</code> | <code>str \| None</code> | Comma-separated<br>**Default**: <code>None</code> |
| <code>dietary</code> | <code>str \| None</code> | Comma-separated; e.g. vegan,gluten-free<br>**Default**: <code>None</code> |
| <code>occasion</code> | <code>str \| None</code> | Value for the occasion parameter.<br>**Default**: <code>None</code> |
| <code>max_price_minor</code> | <code>int \| None</code> | Value for the maxPriceMinor parameter.<br>**Default**: <code>None</code> |
| <code>match_mode</code> | <code>[MatchModeOrStr](ai_caf_pay_pal_commerce_agent_api/models/enums/match_mode.py) \| None</code> | Value for the matchMode parameter.<br>**Default**: <code>None</code> |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[CatalogResponse](ai_caf_pay_pal_commerce_agent_api/models/catalog_response.py)</code> -- Search results

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetCatalogSearchErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_search_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400-499 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## McpAgenticCommerce

> Source: [McpAgenticCommerce](ai_caf_pay_pal_commerce_agent_api/apis/mcp_agentic_commerce.py)

<details>
<summary><code>def mcp_end_session(mcp_session_id: str, *, request_options: RequestOptionsOrDict | None = None) -> None</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

End an MCP session.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    client.mcp_agentic_commerce.mcp_end_session("mcp_s_01HZX")
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type McpEndSessionErrorBody
```

**Async**

```python
try:
    await async_client.mcp_agentic_commerce.mcp_end_session("mcp_s_01HZX")
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type McpEndSessionErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>mcp_session_id</code> | <code>str</code> | Session header returned by MCP initialize; required for tools/call. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: No content

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[McpEndSessionErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/mcp_end_session_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 404 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def mcp_rpc(body: McpRequest | McpRequestDict, *, mcp_session_id: str | None = None, request_options: RequestOptionsOrDict | None = None) -> McpResponse</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Tools: `search_menu`, `prepare_cart`, `check_policy`, `start_checkout`, `get_order_status`. There is deliberately NO capture/pay/refund tool: `start_checkout` returns a PayPal sandbox approval URL that a human must approve. Call `initialize` first and send the returned `Mcp-Session-Id` header on every later request. A GET on this path returns 405 (the optional SSE stream is not offered).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.mcp_agentic_commerce.mcp_rpc(
        McpRequest(method=Method.VALUE_INITIALIZE_DESCRIPTION_ENUM_VALUE_INITIALIZE), mcp_session_id="mcp_s_01HZX"
    )
    # TODO: Handle 'response' of type McpResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type McpRpcErrorBody
```

**Async**

```python
try:
    response = await async_client.mcp_agentic_commerce.mcp_rpc(
        McpRequest(method=Method.VALUE_INITIALIZE_DESCRIPTION_ENUM_VALUE_INITIALIZE), mcp_session_id="mcp_s_01HZX"
    )
    # TODO: Handle 'response' of type McpResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type McpRpcErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[McpRequest](ai_caf_pay_pal_commerce_agent_api/models/mcp_request.py) \| [McpRequestDict](ai_caf_pay_pal_commerce_agent_api/models/mcp_request.py)</code> | An MCP JSON-RPC 2.0 request (initialize, tools/list, or tools/call). |
| <code>mcp_session_id</code> | <code>str \| None</code> | Returned by `initialize`.<br>**Default**: <code>None</code> |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[McpResponse](ai_caf_pay_pal_commerce_agent_api/models/mcp_response.py)</code> -- JSON-RPC result or error

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[McpRpcErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/mcp_rpc_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 403, 404, 429 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## Mandates

> Source: [Mandates](ai_caf_pay_pal_commerce_agent_api/apis/mandates.py)

<details>
<summary><code>def get_order_mandate(order_id: str, *, request_options: RequestOptionsOrDict | None = None) -> SignedCartMandate</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Ed25519-signed, deterministic record of what the shopper was asked to approve: items, server prices, total, origin (HUMAN / AI_AGENT) and the constraints (the agent may not authorize payment; payment authority is the buyer's approval at PayPal). Derived from the stored order, so it survives restarts when MANDATE_SIGNING_KEY is configured. Another session's order is a 404.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.mandates.get_order_mandate("ord_01HZX")
    # TODO: Handle 'response' of type SignedCartMandate
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetOrderMandateErrorBody
```

**Async**

```python
try:
    response = await async_client.mandates.get_order_mandate("ord_01HZX")
    # TODO: Handle 'response' of type SignedCartMandate
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetOrderMandateErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>order_id</code> | <code>str</code> | Value for the orderId parameter. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[SignedCartMandate](ai_caf_pay_pal_commerce_agent_api/models/signed_cart_mandate.py)</code> -- Signed mandate

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetOrderMandateErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_order_mandate_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 401, 404, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def post_mandates_verify(body: SignedCartMandate | SignedCartMandateDict, *, request_options: RequestOptionsOrDict | None = None) -> MandateVerification</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Checks the key id, the Ed25519 signature, the expiry window and, when the order is still known, that the mandate still matches it. Expiry is informational: a genuine but expired mandate stays valid.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.mandates.post_mandates_verify(
        SignedCartMandate(mandate={}, signature="some example string", kid="some example string")
    )
    # TODO: Handle 'response' of type MandateVerification
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostMandatesVerifyErrorBody
```

**Async**

```python
try:
    response = await async_client.mandates.post_mandates_verify(
        SignedCartMandate(mandate={}, signature="some example string", kid="some example string")
    )
    # TODO: Handle 'response' of type MandateVerification
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostMandatesVerifyErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[SignedCartMandate](ai_caf_pay_pal_commerce_agent_api/models/signed_cart_mandate.py) \| [SignedCartMandateDict](ai_caf_pay_pal_commerce_agent_api/models/signed_cart_mandate.py)</code> | The signed Cart Mandate to verify against the published signing key. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[MandateVerification](ai_caf_pay_pal_commerce_agent_api/models/mandate_verification.py)</code> -- Verification result

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[PostMandatesVerifyErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_mandates_verify_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## OpsCopilot

> Source: [OpsCopilot](ai_caf_pay_pal_commerce_agent_api/apis/ops_copilot.py)

<details>
<summary><code>def get_ops_status(*, request_options: RequestOptionsOrDict | None = None) -> OpsStatus</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Ops Copilot capability status.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.ops_copilot.get_ops_status()
    # TODO: Handle 'response' of type OpsStatus
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetOpsStatusErrorBody
```

**Async**

```python
try:
    response = await async_client.ops_copilot.get_ops_status()
    # TODO: Handle 'response' of type OpsStatus
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetOpsStatusErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[OpsStatus](ai_caf_pay_pal_commerce_agent_api/models/ops_status.py)</code> -- Status

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetOpsStatusErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_ops_status_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400-499 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def post_ops_ask(body: OpsAskRequest | OpsAskRequestDict, *, x_ops_key: str | None = None, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Ask the merchant copilot (read-only PayPal access; may only propose refunds).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.ops_copilot.post_ops_ask(OpsAskRequest(question="some example string"), x_ops_key="ops_key_demo")
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostOpsAskErrorBody
```

**Async**

```python
try:
    response = await async_client.ops_copilot.post_ops_ask(
        OpsAskRequest(question="some example string"), x_ops_key="ops_key_demo"
    )
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostOpsAskErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[OpsAskRequest](ai_caf_pay_pal_commerce_agent_api/models/ops_ask_request.py) \| [OpsAskRequestDict](ai_caf_pay_pal_commerce_agent_api/models/ops_ask_request.py)</code> | A natural-language question for the merchant Copilot (read-only; may only propose refunds). |
| <code>x_ops_key</code> | <code>str \| None</code> | Required when Ops Copilot is enabled.<br>**Default**: <code>None</code> |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- Answer (read-only)

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[PostOpsAskErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_ops_ask_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 401, 429, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## Orders

> Source: [Orders](ai_caf_pay_pal_commerce_agent_api/apis/orders.py)

<details>
<summary><code>def get_checkout_cancel(token: str, *, request_options: RequestOptionsOrDict | None = None) -> None</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

PayPal cancel redirect.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    client.orders.get_checkout_cancel("5O190127TN364715T")
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCheckoutCancelErrorBody
```

**Async**

```python
try:
    await async_client.orders.get_checkout_cancel("5O190127TN364715T")
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCheckoutCancelErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>token</code> | <code>str</code> | PayPal approval token returned when the order was created. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: No content

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetCheckoutCancelErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_checkout_cancel_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400-499 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_checkout_return(token: str, *, request_options: RequestOptionsOrDict | None = None) -> None</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

PayPal return redirect.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    client.orders.get_checkout_return("5O190127TN364715T")
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCheckoutReturnErrorBody
```

**Async**

```python
try:
    await async_client.orders.get_checkout_return("5O190127TN364715T")
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetCheckoutReturnErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>token</code> | <code>str</code> | PayPal approval token returned when the order was created. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: No content

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetCheckoutReturnErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_checkout_return_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400-499 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_orders(*, origin: Origin2OrStr | None = None, status: str | None = None, limit: int | None = None, request_options: RequestOptionsOrDict | None = None) -> OrdersListResponse</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open and returns a minimised view.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.orders.get_orders(status="CREATED", limit=20)
    # TODO: Handle 'response' of type OrdersListResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetOrdersErrorBody
```

**Async**

```python
try:
    response = await async_client.orders.get_orders(status="CREATED", limit=20)
    # TODO: Handle 'response' of type OrdersListResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetOrdersErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>origin</code> | <code>[Origin2OrStr](ai_caf_pay_pal_commerce_agent_api/models/enums/origin2.py) \| None</code> | Value for the origin parameter.<br>**Default**: <code>None</code> |
| <code>status</code> | <code>str \| None</code> | Value for the status parameter.<br>**Default**: <code>None</code> |
| <code>limit</code> | <code>int \| None</code> | Value for the limit parameter.<br>**Default**: <code>None</code> |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[OrdersListResponse](ai_caf_pay_pal_commerce_agent_api/models/orders_list_response.py)</code> -- Orders

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetOrdersErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_orders_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400, 401, 429, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_orders_stats(*, request_options: RequestOptionsOrDict | None = None) -> OrdersStats</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open and returns a minimised view.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.orders.get_orders_stats()
    # TODO: Handle 'response' of type OrdersStats
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetOrdersStatsErrorBody
```

**Async**

```python
try:
    response = await async_client.orders.get_orders_stats()
    # TODO: Handle 'response' of type OrdersStats
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetOrdersStatsErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[OrdersStats](ai_caf_pay_pal_commerce_agent_api/models/orders_stats.py)</code> -- Stats

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetOrdersStatsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_orders_stats_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 401, 429, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def post_orders_create(body: CreateOrderRequest | CreateOrderRequestDict, *, idempotency_key: str | None = None, request_options: RequestOptionsOrDict | None = None) -> CreateOrderResponse</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Create an order from items (server re-prices; policy enforced).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.orders.post_orders_create(
        CreateOrderRequest(items=[OrderItem(product_id="some example string", quantity=1)]),
        idempotency_key="idem_01HZX",
    )
    # TODO: Handle 'response' of type CreateOrderResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostOrdersCreateErrorBody
```

**Async**

```python
try:
    response = await async_client.orders.post_orders_create(
        CreateOrderRequest(items=[OrderItem(product_id="some example string", quantity=1)]),
        idempotency_key="idem_01HZX",
    )
    # TODO: Handle 'response' of type CreateOrderResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostOrdersCreateErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[CreateOrderRequest](ai_caf_pay_pal_commerce_agent_api/models/create_order_request.py) \| [CreateOrderRequestDict](ai_caf_pay_pal_commerce_agent_api/models/create_order_request.py)</code> | The items to order. The server re-prices authoritatively and enforces policy. |
| <code>idempotency_key</code> | <code>str \| None</code> | Client key; server hashes it with the session and reuses as PayPal-Request-Id.<br>**Default**: <code>None</code> |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[CreateOrderResponse](ai_caf_pay_pal_commerce_agent_api/models/create_order_response.py)</code> -- Order created

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[PostOrdersCreateErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_orders_create_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400, 403, 429, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def post_orders_order_id_cancel(order_id: str, *, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Cancel a not-yet-captured checkout.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.orders.post_orders_order_id_cancel("ord_01HZX")
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostOrdersOrderIdCancelErrorBody
```

**Async**

```python
try:
    response = await async_client.orders.post_orders_order_id_cancel("ord_01HZX")
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostOrdersOrderIdCancelErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>order_id</code> | <code>str</code> | Value for the orderId parameter. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- Cancelled

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[PostOrdersOrderIdCancelErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_orders_order_id_cancel_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 404, 409 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def post_orders_order_id_capture(order_id: str, *, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Capture the PayPal order (after human approval).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.orders.post_orders_order_id_capture("ord_01HZX")
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostOrdersOrderIdCaptureErrorBody
```

**Async**

```python
try:
    response = await async_client.orders.post_orders_order_id_capture("ord_01HZX")
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostOrdersOrderIdCaptureErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>order_id</code> | <code>str</code> | Value for the orderId parameter. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- Captured

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[PostOrdersOrderIdCaptureErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_orders_order_id_capture_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400, 402, 404, 409, 429, 502, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def post_webhooks_paypal(*, request_options: RequestOptionsOrDict | None = None) -> None</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

PayPal webhook receiver (signature-verified).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    client.orders.post_webhooks_paypal()
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostWebhooksPaypalErrorBody
```

**Async**

```python
try:
    await async_client.orders.post_webhooks_paypal()
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostWebhooksPaypalErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: No content

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[PostWebhooksPaypalErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_webhooks_paypal_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 401 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## Policy

> Source: [Policy](ai_caf_pay_pal_commerce_agent_api/apis/policy.py)

<details>
<summary><code>def post_policy_preview(body: PolicyPreviewRequest | PolicyPreviewRequestDict, *, request_options: RequestOptionsOrDict | None = None) -> PolicyPreviewResponse</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Preview the authoritative policy decision for a cart (side-effect free).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.policy.post_policy_preview(PolicyPreviewRequest())
    # TODO: Handle 'response' of type PolicyPreviewResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostPolicyPreviewErrorBody
```

**Async**

```python
try:
    response = await async_client.policy.post_policy_preview(PolicyPreviewRequest())
    # TODO: Handle 'response' of type PolicyPreviewResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostPolicyPreviewErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[PolicyPreviewRequest](ai_caf_pay_pal_commerce_agent_api/models/policy_preview_request.py) \| [PolicyPreviewRequestDict](ai_caf_pay_pal_commerce_agent_api/models/policy_preview_request.py)</code> | The cart items whose policy decision should be previewed (side-effect free). |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[PolicyPreviewResponse](ai_caf_pay_pal_commerce_agent_api/models/policy_preview_response.py)</code> -- Preview

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[PostPolicyPreviewErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_policy_preview_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400, 429 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## Refunds

> Source: [Refunds](ai_caf_pay_pal_commerce_agent_api/apis/refunds.py)

<details>
<summary><code>def approve_refund(id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None) -> RefundRequest</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

The only endpoint that calls PayPal's refund API. Uses a stable PayPal-Request-Id (`aicafe-refund-<id>`), but does not rely on its unverified retention window alone: an ambiguous outcome must be reconciled against the PayPal refund or capture before another request.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.refunds.approve_refund("coffee", "ops_key_demo")
    # TODO: Handle 'response' of type RefundRequest
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type ApproveRefundErrorBody
```

**Async**

```python
try:
    response = await async_client.refunds.approve_refund("coffee", "ops_key_demo")
    # TODO: Handle 'response' of type RefundRequest
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type ApproveRefundErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>id_</code> | <code>str</code> | Value for the id parameter. |
| <code>x_ops_key</code> | <code>str</code> | Merchant key. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py)</code> -- Refunded

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[ApproveRefundErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/approve_refund_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 401, 404, 409, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| 502 | <code>[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def list_refunds(x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiRefundsResponse</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

List refund requests (newest first).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.refunds.list_refunds("ops_key_demo")
    # TODO: Handle 'response' of type ApiRefundsResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type ListRefundsErrorBody
```

**Async**

```python
try:
    response = await async_client.refunds.list_refunds("ops_key_demo")
    # TODO: Handle 'response' of type ApiRefundsResponse
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type ListRefundsErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>x_ops_key</code> | <code>str</code> | Merchant key. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[ApiRefundsResponse](ai_caf_pay_pal_commerce_agent_api/models/api_refunds_response.py)</code> -- Refund queue

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[ListRefundsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/list_refunds_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 401, 429, 503 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def propose_refund(x_ops_key: str, body: ProposeRefundRequest | ProposeRefundRequestDict, *, request_options: RequestOptionsOrDict | None = None) -> RefundRequest</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Propose a refund (moves no money).

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.refunds.propose_refund(
        "ops_key_demo", ProposeRefundRequest(order_id="some example string", reason="some example string")
    )
    # TODO: Handle 'response' of type RefundRequest
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type ProposeRefundErrorBody
```

**Async**

```python
try:
    response = await async_client.refunds.propose_refund(
        "ops_key_demo", ProposeRefundRequest(order_id="some example string", reason="some example string")
    )
    # TODO: Handle 'response' of type RefundRequest
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type ProposeRefundErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>x_ops_key</code> | <code>str</code> | Merchant key. |
| <code>body</code> | <code>[ProposeRefundRequest](ai_caf_pay_pal_commerce_agent_api/models/propose_refund_request.py) \| [ProposeRefundRequestDict](ai_caf_pay_pal_commerce_agent_api/models/propose_refund_request.py)</code> | Details of the refund request to propose. Proposing moves no money. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py)</code> -- Proposed

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[ProposeRefundErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/propose_refund_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400, 401, 404, 409, 422 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def reject_refund(id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None) -> RefundRequest</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Reject a proposed refund.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.refunds.reject_refund("coffee", "ops_key_demo")
    # TODO: Handle 'response' of type RefundRequest
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type RejectRefundErrorBody
```

**Async**

```python
try:
    response = await async_client.refunds.reject_refund("coffee", "ops_key_demo")
    # TODO: Handle 'response' of type RefundRequest
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type RejectRefundErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>id_</code> | <code>str</code> | Value for the id parameter. |
| <code>x_ops_key</code> | <code>str</code> | Merchant key. |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py)</code> -- Rejected

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[RejectRefundErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/reject_refund_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 401, 404, 409 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

## Sessions

> Source: [Sessions](ai_caf_pay_pal_commerce_agent_api/apis/sessions.py)

<details>
<summary><code>def delete_sessions_current(*, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

End the current session.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.sessions.delete_sessions_current()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type DeleteSessionsCurrentErrorBody
```

**Async**

```python
try:
    response = await async_client.sessions.delete_sessions_current()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type DeleteSessionsCurrentErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- Session ended

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[DeleteSessionsCurrentErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/delete_sessions_current_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 400-499 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def get_health(*, request_options: RequestOptionsOrDict | None = None) -> Any</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Health and readiness check.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.sessions.get_health()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetHealthErrorBody
```

**Async**

```python
try:
    response = await async_client.sessions.get_health()
    # TODO: Handle 'response' of type Any
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type GetHealthErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>Any</code> -- OK

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[GetHealthErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_health_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 503 | <code>Any</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>def post_sessions(*, request_options: RequestOptionsOrDict | None = None) -> IssuedSession</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Mint a server-side session.

</dd>
</dl>

### Usage

<dl>
<dd>

**Sync**

```python
try:
    response = client.sessions.post_sessions()
    # TODO: Handle 'response' of type IssuedSession
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostSessionsErrorBody
```

**Async**

```python
try:
    response = await async_client.sessions.post_sessions()
    # TODO: Handle 'response' of type IssuedSession
except ApiError as e:
    ...  # TODO: Handle 'e.error' of type PostSessionsErrorBody
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>request_options</code> | <code>[RequestOptionsOrDict](ai_caf_pay_pal_commerce_agent_api/core/request_options.py) \| None</code> | Per-call overrides for this one request, such as a timeout, extra headers, or its retry count and statuses. |

</dd>
</dl>

### Response

<dl>
<dd>

**OnSuccess**: <code>[IssuedSession](ai_caf_pay_pal_commerce_agent_api/models/issued_session.py)</code> -- Session issued

**OnError**: <code>[ApiError](ai_caf_pay_pal_commerce_agent_api/core/exceptions.py)&#91;[PostSessionsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_sessions_error.py)&#93;</code>

Mapped in first-match order -- an earlier row wins over a later range that also covers the status:

| Status | `error` is |
| --- | --- |
| 429 | <code>[Error](ai_caf_pay_pal_commerce_agent_api/models/error.py)</code> |
| anything unmapped | <code>[RawError](ai_caf_pay_pal_commerce_agent_api/core/results.py)</code> |

</dd>
</dl>

</dd>
</dl>

</details>


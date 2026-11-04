# Raw Reference

**Raw** endpoints, reached through `with_raw_response`, return `ApiResult[T, E]` and never raise for an API error. For the parsed endpoints, see [API Reference](api-reference.md).

> Source: [AiCafPayPalCommerceAgentApiClient](ai_caf_pay_pal_commerce_agent_api/client.py)

## AiAgent

> Source: [AiAgent](ai_caf_pay_pal_commerce_agent_api/apis/ai_agent.py)

<details>
<summary><code>def delete_ai_cart_session_id(session_id: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, DeleteAiCartSessionIdErrorBody]</code></summary>

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
result = client.ai_agent.with_raw_response.delete_ai_cart_session_id("s_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type DeleteAiCartSessionIdErrorBody
```

**Async**

```python
result = await async_client.ai_agent.with_raw_response.delete_ai_cart_session_id("s_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type DeleteAiCartSessionIdErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [DeleteAiCartSessionIdErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/delete_ai_cart_session_id_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- Cleared

**On `Failure`**: `error` is <code>[DeleteAiCartSessionIdErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/delete_ai_cart_session_id_error.py)</code>

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
<summary><code>def delete_ai_chat_session_id(session_id: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, DeleteAiChatSessionIdErrorBody]</code></summary>

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
result = client.ai_agent.with_raw_response.delete_ai_chat_session_id("s_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type DeleteAiChatSessionIdErrorBody
```

**Async**

```python
result = await async_client.ai_agent.with_raw_response.delete_ai_chat_session_id("s_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type DeleteAiChatSessionIdErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [DeleteAiChatSessionIdErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/delete_ai_chat_session_id_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- Cleared

**On `Failure`**: `error` is <code>[DeleteAiChatSessionIdErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/delete_ai_chat_session_id_error.py)</code>

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
<summary><code>def post_ai_chat(body: AiChatRequest | AiChatRequestDict, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[AiChatResponse, PostAiChatErrorBody]</code></summary>

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
result = client.ai_agent.with_raw_response.post_ai_chat(AiChatRequest(message="some example string"))
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type AiChatResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostAiChatErrorBody
```

**Async**

```python
result = await async_client.ai_agent.with_raw_response.post_ai_chat(AiChatRequest(message="some example string"))
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type AiChatResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostAiChatErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[AiChatResponse](ai_caf_pay_pal_commerce_agent_api/models/ai_chat_response.py), [PostAiChatErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_ai_chat_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[AiChatResponse](ai_caf_pay_pal_commerce_agent_api/models/ai_chat_response.py)</code> -- Agent reply + prepared cart

**On `Failure`**: `error` is <code>[PostAiChatErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_ai_chat_error.py)</code>

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
<summary><code>def get_agent_card(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, GetAgentCardErrorBody]</code></summary>

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
result = client.agent_discovery.with_raw_response.get_agent_card()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetAgentCardErrorBody
```

**Async**

```python
result = await async_client.agent_discovery.with_raw_response.get_agent_card()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetAgentCardErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [GetAgentCardErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_agent_card_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- OK

**On `Failure`**: `error` is <code>[GetAgentCardErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_agent_card_error.py)</code>

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
<summary><code>def get_agent_commerce_manifest(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, GetAgentCommerceManifestErrorBody]</code></summary>

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
result = client.agent_discovery.with_raw_response.get_agent_commerce_manifest()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetAgentCommerceManifestErrorBody
```

**Async**

```python
result = await async_client.agent_discovery.with_raw_response.get_agent_commerce_manifest()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetAgentCommerceManifestErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [GetAgentCommerceManifestErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_agent_commerce_manifest_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- OK

**On `Failure`**: `error` is <code>[GetAgentCommerceManifestErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_agent_commerce_manifest_error.py)</code>

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
<summary><code>def get_feed_products(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, GetFeedProductsErrorBody]</code></summary>

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
result = client.agent_discovery.with_raw_response.get_feed_products()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetFeedProductsErrorBody
```

**Async**

```python
result = await async_client.agent_discovery.with_raw_response.get_feed_products()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetFeedProductsErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [GetFeedProductsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_feed_products_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- OK

**On `Failure`**: `error` is <code>[GetFeedProductsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_feed_products_error.py)</code>

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
<summary><code>def get_llms_txt(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[str, GetLlmsTxtErrorBody]</code></summary>

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
result = client.agent_discovery.with_raw_response.get_llms_txt()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type str
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetLlmsTxtErrorBody
```

**Async**

```python
result = await async_client.agent_discovery.with_raw_response.get_llms_txt()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type str
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetLlmsTxtErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;str, [GetLlmsTxtErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_llms_txt_error.py)&#93;</code>

**On `Success`**: `payload` is <code>str</code> -- OK

**On `Failure`**: `error` is <code>[GetLlmsTxtErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_llms_txt_error.py)</code>

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
<summary><code>def get_mandate_keys(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, GetMandateKeysErrorBody]</code></summary>

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
result = client.agent_discovery.with_raw_response.get_mandate_keys()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetMandateKeysErrorBody
```

**Async**

```python
result = await async_client.agent_discovery.with_raw_response.get_mandate_keys()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetMandateKeysErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [GetMandateKeysErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_mandate_keys_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- JWK set

**On `Failure`**: `error` is <code>[GetMandateKeysErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_mandate_keys_error.py)</code>

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
<summary><code>def get_policy_events(*, decision: PolicyDecisionOrStr | None = None, user_id: str | None = None, limit: int | None = None, request_options: RequestOptionsOrDict | None = None) -> ApiResult[PolicyEventsResponse, GetPolicyEventsErrorBody]</code></summary>

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
result = client.audit.with_raw_response.get_policy_events(user_id="demo", limit=20)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type PolicyEventsResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetPolicyEventsErrorBody
```

**Async**

```python
result = await async_client.audit.with_raw_response.get_policy_events(user_id="demo", limit=20)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type PolicyEventsResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetPolicyEventsErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[PolicyEventsResponse](ai_caf_pay_pal_commerce_agent_api/models/policy_events_response.py), [GetPolicyEventsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_policy_events_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[PolicyEventsResponse](ai_caf_pay_pal_commerce_agent_api/models/policy_events_response.py)</code> -- Events

**On `Failure`**: `error` is <code>[GetPolicyEventsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_policy_events_error.py)</code>

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
<summary><code>def get_policy_events_stats(*, user_id: str | None = None, request_options: RequestOptionsOrDict | None = None) -> ApiResult[PolicyEventsStats, GetPolicyEventsStatsErrorBody]</code></summary>

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
result = client.audit.with_raw_response.get_policy_events_stats(user_id="demo")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type PolicyEventsStats
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetPolicyEventsStatsErrorBody
```

**Async**

```python
result = await async_client.audit.with_raw_response.get_policy_events_stats(user_id="demo")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type PolicyEventsStats
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetPolicyEventsStatsErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[PolicyEventsStats](ai_caf_pay_pal_commerce_agent_api/models/policy_events_stats.py), [GetPolicyEventsStatsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_policy_events_stats_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[PolicyEventsStats](ai_caf_pay_pal_commerce_agent_api/models/policy_events_stats.py)</code> -- Stats

**On `Failure`**: `error` is <code>[GetPolicyEventsStatsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_policy_events_stats_error.py)</code>

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
<summary><code>def get_catalog(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[CatalogResponse, GetCatalogErrorBody]</code></summary>

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
result = client.catalog.with_raw_response.get_catalog()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type CatalogResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCatalogErrorBody
```

**Async**

```python
result = await async_client.catalog.with_raw_response.get_catalog()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type CatalogResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCatalogErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[CatalogResponse](ai_caf_pay_pal_commerce_agent_api/models/catalog_response.py), [GetCatalogErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[CatalogResponse](ai_caf_pay_pal_commerce_agent_api/models/catalog_response.py)</code> -- Catalog

**On `Failure`**: `error` is <code>[GetCatalogErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_error.py)</code>

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
<summary><code>def get_catalog_id(id_: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Product, GetCatalogIdErrorBody]</code></summary>

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
result = client.catalog.with_raw_response.get_catalog_id("coffee")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Product
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCatalogIdErrorBody
```

**Async**

```python
result = await async_client.catalog.with_raw_response.get_catalog_id("coffee")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Product
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCatalogIdErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[Product](ai_caf_pay_pal_commerce_agent_api/models/product.py), [GetCatalogIdErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_id_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[Product](ai_caf_pay_pal_commerce_agent_api/models/product.py)</code> -- Product

**On `Failure`**: `error` is <code>[GetCatalogIdErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_id_error.py)</code>

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
<summary><code>def get_catalog_search(*, query: str | None = None, category: str | None = None, tags: str | None = None, dietary: str | None = None, occasion: str | None = None, max_price_minor: int | None = None, match_mode: MatchModeOrStr | None = None, request_options: RequestOptionsOrDict | None = None) -> ApiResult[CatalogResponse, GetCatalogSearchErrorBody]</code></summary>

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
result = client.catalog.with_raw_response.get_catalog_search(
    query="flat white", category="drinks", tags="coffee", dietary="vegetarian", occasion="morning", max_price_minor=1000
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type CatalogResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCatalogSearchErrorBody
```

**Async**

```python
result = await async_client.catalog.with_raw_response.get_catalog_search(
    query="flat white", category="drinks", tags="coffee", dietary="vegetarian", occasion="morning", max_price_minor=1000
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type CatalogResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCatalogSearchErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[CatalogResponse](ai_caf_pay_pal_commerce_agent_api/models/catalog_response.py), [GetCatalogSearchErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_search_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[CatalogResponse](ai_caf_pay_pal_commerce_agent_api/models/catalog_response.py)</code> -- Search results

**On `Failure`**: `error` is <code>[GetCatalogSearchErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_catalog_search_error.py)</code>

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
<summary><code>def mcp_end_session(mcp_session_id: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[None, McpEndSessionErrorBody]</code></summary>

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
result = client.mcp_agentic_commerce.with_raw_response.mcp_end_session("mcp_s_01HZX")
match result:
    case Success():
        ...  # 2xx, no content
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type McpEndSessionErrorBody
```

**Async**

```python
result = await async_client.mcp_agentic_commerce.with_raw_response.mcp_end_session("mcp_s_01HZX")
match result:
    case Success():
        ...  # 2xx, no content
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type McpEndSessionErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;None, [McpEndSessionErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/mcp_end_session_error.py)&#93;</code>

**On `Success`**: the 2xx carries no content; `payload` is <code>None</code>

**On `Failure`**: `error` is <code>[McpEndSessionErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/mcp_end_session_error.py)</code>

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
<summary><code>def mcp_rpc(body: McpRequest | McpRequestDict, *, mcp_session_id: str | None = None, request_options: RequestOptionsOrDict | None = None) -> ApiResult[McpResponse, McpRpcErrorBody]</code></summary>

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
result = client.mcp_agentic_commerce.with_raw_response.mcp_rpc(
    McpRequest(method=Method.VALUE_INITIALIZE_DESCRIPTION_ENUM_VALUE_INITIALIZE), mcp_session_id="mcp_s_01HZX"
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type McpResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type McpRpcErrorBody
```

**Async**

```python
result = await async_client.mcp_agentic_commerce.with_raw_response.mcp_rpc(
    McpRequest(method=Method.VALUE_INITIALIZE_DESCRIPTION_ENUM_VALUE_INITIALIZE), mcp_session_id="mcp_s_01HZX"
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type McpResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type McpRpcErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[McpResponse](ai_caf_pay_pal_commerce_agent_api/models/mcp_response.py), [McpRpcErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/mcp_rpc_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[McpResponse](ai_caf_pay_pal_commerce_agent_api/models/mcp_response.py)</code> -- JSON-RPC result or error

**On `Failure`**: `error` is <code>[McpRpcErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/mcp_rpc_error.py)</code>

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
<summary><code>def get_order_mandate(order_id: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[SignedCartMandate, GetOrderMandateErrorBody]</code></summary>

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
result = client.mandates.with_raw_response.get_order_mandate("ord_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type SignedCartMandate
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetOrderMandateErrorBody
```

**Async**

```python
result = await async_client.mandates.with_raw_response.get_order_mandate("ord_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type SignedCartMandate
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetOrderMandateErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[SignedCartMandate](ai_caf_pay_pal_commerce_agent_api/models/signed_cart_mandate.py), [GetOrderMandateErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_order_mandate_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[SignedCartMandate](ai_caf_pay_pal_commerce_agent_api/models/signed_cart_mandate.py)</code> -- Signed mandate

**On `Failure`**: `error` is <code>[GetOrderMandateErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_order_mandate_error.py)</code>

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
<summary><code>def post_mandates_verify(body: SignedCartMandate | SignedCartMandateDict, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[MandateVerification, PostMandatesVerifyErrorBody]</code></summary>

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
result = client.mandates.with_raw_response.post_mandates_verify(
    SignedCartMandate(mandate={}, signature="some example string", kid="some example string")
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type MandateVerification
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostMandatesVerifyErrorBody
```

**Async**

```python
result = await async_client.mandates.with_raw_response.post_mandates_verify(
    SignedCartMandate(mandate={}, signature="some example string", kid="some example string")
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type MandateVerification
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostMandatesVerifyErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[MandateVerification](ai_caf_pay_pal_commerce_agent_api/models/mandate_verification.py), [PostMandatesVerifyErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_mandates_verify_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[MandateVerification](ai_caf_pay_pal_commerce_agent_api/models/mandate_verification.py)</code> -- Verification result

**On `Failure`**: `error` is <code>[PostMandatesVerifyErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_mandates_verify_error.py)</code>

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
<summary><code>def get_ops_status(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[OpsStatus, GetOpsStatusErrorBody]</code></summary>

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
result = client.ops_copilot.with_raw_response.get_ops_status()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type OpsStatus
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetOpsStatusErrorBody
```

**Async**

```python
result = await async_client.ops_copilot.with_raw_response.get_ops_status()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type OpsStatus
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetOpsStatusErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[OpsStatus](ai_caf_pay_pal_commerce_agent_api/models/ops_status.py), [GetOpsStatusErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_ops_status_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[OpsStatus](ai_caf_pay_pal_commerce_agent_api/models/ops_status.py)</code> -- Status

**On `Failure`**: `error` is <code>[GetOpsStatusErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_ops_status_error.py)</code>

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
<summary><code>def post_ops_ask(body: OpsAskRequest | OpsAskRequestDict, *, x_ops_key: str | None = None, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, PostOpsAskErrorBody]</code></summary>

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
result = client.ops_copilot.with_raw_response.post_ops_ask(
    OpsAskRequest(question="some example string"), x_ops_key="ops_key_demo"
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostOpsAskErrorBody
```

**Async**

```python
result = await async_client.ops_copilot.with_raw_response.post_ops_ask(
    OpsAskRequest(question="some example string"), x_ops_key="ops_key_demo"
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostOpsAskErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [PostOpsAskErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_ops_ask_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- Answer (read-only)

**On `Failure`**: `error` is <code>[PostOpsAskErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_ops_ask_error.py)</code>

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
<summary><code>def get_checkout_cancel(token: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[None, GetCheckoutCancelErrorBody]</code></summary>

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
result = client.orders.with_raw_response.get_checkout_cancel("5O190127TN364715T")
match result:
    case Success():
        ...  # 2xx, no content
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCheckoutCancelErrorBody
```

**Async**

```python
result = await async_client.orders.with_raw_response.get_checkout_cancel("5O190127TN364715T")
match result:
    case Success():
        ...  # 2xx, no content
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCheckoutCancelErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;None, [GetCheckoutCancelErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_checkout_cancel_error.py)&#93;</code>

**On `Success`**: the 2xx carries no content; `payload` is <code>None</code>

**On `Failure`**: `error` is <code>[GetCheckoutCancelErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_checkout_cancel_error.py)</code>

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
<summary><code>def get_checkout_return(token: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[None, GetCheckoutReturnErrorBody]</code></summary>

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
result = client.orders.with_raw_response.get_checkout_return("5O190127TN364715T")
match result:
    case Success():
        ...  # 2xx, no content
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCheckoutReturnErrorBody
```

**Async**

```python
result = await async_client.orders.with_raw_response.get_checkout_return("5O190127TN364715T")
match result:
    case Success():
        ...  # 2xx, no content
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetCheckoutReturnErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;None, [GetCheckoutReturnErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_checkout_return_error.py)&#93;</code>

**On `Success`**: the 2xx carries no content; `payload` is <code>None</code>

**On `Failure`**: `error` is <code>[GetCheckoutReturnErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_checkout_return_error.py)</code>

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
<summary><code>def get_orders(*, origin: Origin2OrStr | None = None, status: str | None = None, limit: int | None = None, request_options: RequestOptionsOrDict | None = None) -> ApiResult[OrdersListResponse, GetOrdersErrorBody]</code></summary>

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
result = client.orders.with_raw_response.get_orders(status="CREATED", limit=20)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type OrdersListResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetOrdersErrorBody
```

**Async**

```python
result = await async_client.orders.with_raw_response.get_orders(status="CREATED", limit=20)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type OrdersListResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetOrdersErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[OrdersListResponse](ai_caf_pay_pal_commerce_agent_api/models/orders_list_response.py), [GetOrdersErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_orders_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[OrdersListResponse](ai_caf_pay_pal_commerce_agent_api/models/orders_list_response.py)</code> -- Orders

**On `Failure`**: `error` is <code>[GetOrdersErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_orders_error.py)</code>

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
<summary><code>def get_orders_stats(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[OrdersStats, GetOrdersStatsErrorBody]</code></summary>

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
result = client.orders.with_raw_response.get_orders_stats()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type OrdersStats
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetOrdersStatsErrorBody
```

**Async**

```python
result = await async_client.orders.with_raw_response.get_orders_stats()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type OrdersStats
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetOrdersStatsErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[OrdersStats](ai_caf_pay_pal_commerce_agent_api/models/orders_stats.py), [GetOrdersStatsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_orders_stats_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[OrdersStats](ai_caf_pay_pal_commerce_agent_api/models/orders_stats.py)</code> -- Stats

**On `Failure`**: `error` is <code>[GetOrdersStatsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_orders_stats_error.py)</code>

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
<summary><code>def post_orders_create(body: CreateOrderRequest | CreateOrderRequestDict, *, idempotency_key: str | None = None, request_options: RequestOptionsOrDict | None = None) -> ApiResult[CreateOrderResponse, PostOrdersCreateErrorBody]</code></summary>

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
result = client.orders.with_raw_response.post_orders_create(
    CreateOrderRequest(items=[OrderItem(product_id="some example string", quantity=1)]), idempotency_key="idem_01HZX"
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type CreateOrderResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostOrdersCreateErrorBody
```

**Async**

```python
result = await async_client.orders.with_raw_response.post_orders_create(
    CreateOrderRequest(items=[OrderItem(product_id="some example string", quantity=1)]), idempotency_key="idem_01HZX"
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type CreateOrderResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostOrdersCreateErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[CreateOrderResponse](ai_caf_pay_pal_commerce_agent_api/models/create_order_response.py), [PostOrdersCreateErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_orders_create_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[CreateOrderResponse](ai_caf_pay_pal_commerce_agent_api/models/create_order_response.py)</code> -- Order created

**On `Failure`**: `error` is <code>[PostOrdersCreateErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_orders_create_error.py)</code>

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
<summary><code>def post_orders_order_id_cancel(order_id: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, PostOrdersOrderIdCancelErrorBody]</code></summary>

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
result = client.orders.with_raw_response.post_orders_order_id_cancel("ord_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostOrdersOrderIdCancelErrorBody
```

**Async**

```python
result = await async_client.orders.with_raw_response.post_orders_order_id_cancel("ord_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostOrdersOrderIdCancelErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [PostOrdersOrderIdCancelErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_orders_order_id_cancel_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- Cancelled

**On `Failure`**: `error` is <code>[PostOrdersOrderIdCancelErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_orders_order_id_cancel_error.py)</code>

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
<summary><code>def post_orders_order_id_capture(order_id: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, PostOrdersOrderIdCaptureErrorBody]</code></summary>

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
result = client.orders.with_raw_response.post_orders_order_id_capture("ord_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostOrdersOrderIdCaptureErrorBody
```

**Async**

```python
result = await async_client.orders.with_raw_response.post_orders_order_id_capture("ord_01HZX")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostOrdersOrderIdCaptureErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [PostOrdersOrderIdCaptureErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_orders_order_id_capture_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- Captured

**On `Failure`**: `error` is <code>[PostOrdersOrderIdCaptureErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_orders_order_id_capture_error.py)</code>

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
<summary><code>def post_webhooks_paypal(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[None, PostWebhooksPaypalErrorBody]</code></summary>

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
result = client.orders.with_raw_response.post_webhooks_paypal()
match result:
    case Success():
        ...  # 2xx, no content
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostWebhooksPaypalErrorBody
```

**Async**

```python
result = await async_client.orders.with_raw_response.post_webhooks_paypal()
match result:
    case Success():
        ...  # 2xx, no content
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostWebhooksPaypalErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;None, [PostWebhooksPaypalErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_webhooks_paypal_error.py)&#93;</code>

**On `Success`**: the 2xx carries no content; `payload` is <code>None</code>

**On `Failure`**: `error` is <code>[PostWebhooksPaypalErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_webhooks_paypal_error.py)</code>

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
<summary><code>def post_policy_preview(body: PolicyPreviewRequest | PolicyPreviewRequestDict, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[PolicyPreviewResponse, PostPolicyPreviewErrorBody]</code></summary>

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
result = client.policy.with_raw_response.post_policy_preview(PolicyPreviewRequest())
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type PolicyPreviewResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostPolicyPreviewErrorBody
```

**Async**

```python
result = await async_client.policy.with_raw_response.post_policy_preview(PolicyPreviewRequest())
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type PolicyPreviewResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostPolicyPreviewErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[PolicyPreviewResponse](ai_caf_pay_pal_commerce_agent_api/models/policy_preview_response.py), [PostPolicyPreviewErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_policy_preview_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[PolicyPreviewResponse](ai_caf_pay_pal_commerce_agent_api/models/policy_preview_response.py)</code> -- Preview

**On `Failure`**: `error` is <code>[PostPolicyPreviewErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_policy_preview_error.py)</code>

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
<summary><code>def approve_refund(id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[RefundRequest, ApproveRefundErrorBody]</code></summary>

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
result = client.refunds.with_raw_response.approve_refund("coffee", "ops_key_demo")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type RefundRequest
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type ApproveRefundErrorBody
```

**Async**

```python
result = await async_client.refunds.with_raw_response.approve_refund("coffee", "ops_key_demo")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type RefundRequest
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type ApproveRefundErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py), [ApproveRefundErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/approve_refund_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py)</code> -- Refunded

**On `Failure`**: `error` is <code>[ApproveRefundErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/approve_refund_error.py)</code>

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
<summary><code>def list_refunds(x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[ApiRefundsResponse, ListRefundsErrorBody]</code></summary>

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
result = client.refunds.with_raw_response.list_refunds("ops_key_demo")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type ApiRefundsResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type ListRefundsErrorBody
```

**Async**

```python
result = await async_client.refunds.with_raw_response.list_refunds("ops_key_demo")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type ApiRefundsResponse
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type ListRefundsErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[ApiRefundsResponse](ai_caf_pay_pal_commerce_agent_api/models/api_refunds_response.py), [ListRefundsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/list_refunds_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[ApiRefundsResponse](ai_caf_pay_pal_commerce_agent_api/models/api_refunds_response.py)</code> -- Refund queue

**On `Failure`**: `error` is <code>[ListRefundsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/list_refunds_error.py)</code>

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
<summary><code>def propose_refund(x_ops_key: str, body: ProposeRefundRequest | ProposeRefundRequestDict, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[RefundRequest, ProposeRefundErrorBody]</code></summary>

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
result = client.refunds.with_raw_response.propose_refund(
    "ops_key_demo", ProposeRefundRequest(order_id="some example string", reason="some example string")
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type RefundRequest
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type ProposeRefundErrorBody
```

**Async**

```python
result = await async_client.refunds.with_raw_response.propose_refund(
    "ops_key_demo", ProposeRefundRequest(order_id="some example string", reason="some example string")
)
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type RefundRequest
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type ProposeRefundErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py), [ProposeRefundErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/propose_refund_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py)</code> -- Proposed

**On `Failure`**: `error` is <code>[ProposeRefundErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/propose_refund_error.py)</code>

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
<summary><code>def reject_refund(id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[RefundRequest, RejectRefundErrorBody]</code></summary>

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
result = client.refunds.with_raw_response.reject_refund("coffee", "ops_key_demo")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type RefundRequest
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type RejectRefundErrorBody
```

**Async**

```python
result = await async_client.refunds.with_raw_response.reject_refund("coffee", "ops_key_demo")
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type RefundRequest
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type RejectRefundErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py), [RejectRefundErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/reject_refund_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[RefundRequest](ai_caf_pay_pal_commerce_agent_api/models/refund_request.py)</code> -- Rejected

**On `Failure`**: `error` is <code>[RejectRefundErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/reject_refund_error.py)</code>

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
<summary><code>def delete_sessions_current(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, DeleteSessionsCurrentErrorBody]</code></summary>

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
result = client.sessions.with_raw_response.delete_sessions_current()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type DeleteSessionsCurrentErrorBody
```

**Async**

```python
result = await async_client.sessions.with_raw_response.delete_sessions_current()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type DeleteSessionsCurrentErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [DeleteSessionsCurrentErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/delete_sessions_current_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- Session ended

**On `Failure`**: `error` is <code>[DeleteSessionsCurrentErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/delete_sessions_current_error.py)</code>

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
<summary><code>def get_health(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, GetHealthErrorBody]</code></summary>

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
result = client.sessions.with_raw_response.get_health()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetHealthErrorBody
```

**Async**

```python
result = await async_client.sessions.with_raw_response.get_health()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type Any
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type GetHealthErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;Any, [GetHealthErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_health_error.py)&#93;</code>

**On `Success`**: `payload` is <code>Any</code> -- OK

**On `Failure`**: `error` is <code>[GetHealthErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/get_health_error.py)</code>

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
<summary><code>def post_sessions(*, request_options: RequestOptionsOrDict | None = None) -> ApiResult[IssuedSession, PostSessionsErrorBody]</code></summary>

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
result = client.sessions.with_raw_response.post_sessions()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type IssuedSession
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostSessionsErrorBody
```

**Async**

```python
result = await async_client.sessions.with_raw_response.post_sessions()
match result:
    case Success(payload=payload):
        ...  # TODO: Handle 'payload' of type IssuedSession
    case Failure(error=error):
        ...  # TODO: Handle 'error' of type PostSessionsErrorBody
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

**Returns**: <code>[ApiResult](ai_caf_pay_pal_commerce_agent_api/core/results.py)&#91;[IssuedSession](ai_caf_pay_pal_commerce_agent_api/models/issued_session.py), [PostSessionsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_sessions_error.py)&#93;</code>

**On `Success`**: `payload` is <code>[IssuedSession](ai_caf_pay_pal_commerce_agent_api/models/issued_session.py)</code> -- Session issued

**On `Failure`**: `error` is <code>[PostSessionsErrorBody](ai_caf_pay_pal_commerce_agent_api/errors/post_sessions_error.py)</code>

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


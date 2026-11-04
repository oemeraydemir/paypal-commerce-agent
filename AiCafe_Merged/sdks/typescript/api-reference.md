# Reference

> Source: [AiCafPayPalCommerceAgentApiClient](src/client.ts)

## Sessions

> Source: [Sessions](src/resources/sessions.ts)

<details>
<summary><code>deleteSessionsCurrent(options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, Sessions.DeleteSessionsCurrentError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

End the current session.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.sessions.deleteSessionsCurrent();
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type Sessions.DeleteSessionsCurrentError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.sessions.deleteSessionsCurrent().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.sessions.deleteSessionsCurrent()`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[Sessions.DeleteSessionsCurrentError](src/resources/sessions.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.sessions.deleteSessionsCurrent().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, Sessions.DeleteSessionsCurrentError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getHealth(options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, Sessions.GetHealthError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Health and readiness check.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.sessions.getHealth();
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type Sessions.GetHealthError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.sessions.getHealth().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.sessions.getHealth()`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[Sessions.GetHealthError](src/resources/sessions.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.sessions.getHealth().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, Sessions.GetHealthError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postSessions(options?: RequestOptions): ApiPromise&lt;IssuedSession, Sessions.PostSessionsError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Mint a server-side session.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.sessions.postSessions();
  // TODO: Handle 'response' of type IssuedSession
} catch (err) {
  // TODO: Handle 'err' of type Sessions.PostSessionsError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.sessions.postSessions().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type IssuedSession
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.sessions.postSessions()`

- **OnSuccess**: <code>[IssuedSession](src/models/issued-session.ts)</code>
- **OnError**: throws <code>[Sessions.PostSessionsError](src/resources/sessions.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.sessions.postSessions().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;IssuedSession, Sessions.PostSessionsError&gt;</code>, with `result.value` of type <code>[IssuedSession](src/models/issued-session.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## Catalog

> Source: [Catalog](src/resources/catalog.ts)

<details>
<summary><code>getCatalog(options?: RequestOptions): ApiPromise&lt;CatalogResponse, Catalog.GetCatalogError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

List all products.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.catalog.getCatalog();
  // TODO: Handle 'response' of type CatalogResponse
} catch (err) {
  // TODO: Handle 'err' of type Catalog.GetCatalogError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.catalog.getCatalog().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type CatalogResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.catalog.getCatalog()`

- **OnSuccess**: <code>[CatalogResponse](src/models/catalog-response.ts)</code>
- **OnError**: throws <code>[Catalog.GetCatalogError](src/resources/catalog.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.catalog.getCatalog().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;CatalogResponse, Catalog.GetCatalogError&gt;</code>, with `result.value` of type <code>[CatalogResponse](src/models/catalog-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getCatalogId(request: Catalog.GetCatalogIdRequest, options?: RequestOptions): ApiPromise&lt;Product, Catalog.GetCatalogIdError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Get a product by id.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.catalog.getCatalogId({ id: "coffee" });
  // TODO: Handle 'response' of type Product
} catch (err) {
  // TODO: Handle 'err' of type Catalog.GetCatalogIdError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.catalog.getCatalogId({ id: "coffee" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Product
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>id</code> | <code>string</code> | Value for the id parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.catalog.getCatalogId(request)`

- **OnSuccess**: <code>[Product](src/models/product.ts)</code>
- **OnError**: throws <code>[Catalog.GetCatalogIdError](src/resources/catalog.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.catalog.getCatalogId(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Product, Catalog.GetCatalogIdError&gt;</code>, with `result.value` of type <code>[Product](src/models/product.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getCatalogSearch(request?: Catalog.GetCatalogSearchRequest, options?: RequestOptions): ApiPromise&lt;CatalogResponse, Catalog.GetCatalogSearchError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Search the catalog (server-side filtering).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.catalog.getCatalogSearch({
    query: "flat white",
    category: "drinks",
    tags: "coffee",
    dietary: "vegetarian",
    occasion: "morning",
    maxPriceMinor: 1000,
  });
  // TODO: Handle 'response' of type CatalogResponse
} catch (err) {
  // TODO: Handle 'err' of type Catalog.GetCatalogSearchError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.catalog.getCatalogSearch({
  query: "flat white",
  category: "drinks",
  tags: "coffee",
  dietary: "vegetarian",
  occasion: "morning",
  maxPriceMinor: 1000,
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type CatalogResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>query?</code> | <code>string</code> | Value for the query parameter. |
| <code>category?</code> | <code>string</code> | Value for the category parameter. |
| <code>tags?</code> | <code>string</code> | Comma-separated |
| <code>dietary?</code> | <code>string</code> | Comma-separated; e.g. vegan,gluten-free |
| <code>occasion?</code> | <code>string</code> | Value for the occasion parameter. |
| <code>maxPriceMinor?</code> | <code>number</code> | Value for the maxPriceMinor parameter. |
| <code>matchMode?</code> | <code>[MatchMode](src/models/match-mode.ts)</code> | Value for the matchMode parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.catalog.getCatalogSearch(request)`

- **OnSuccess**: <code>[CatalogResponse](src/models/catalog-response.ts)</code>
- **OnError**: throws <code>[Catalog.GetCatalogSearchError](src/resources/catalog.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.catalog.getCatalogSearch(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;CatalogResponse, Catalog.GetCatalogSearchError&gt;</code>, with `result.value` of type <code>[CatalogResponse](src/models/catalog-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## AiAgent

> Source: [AiAgent](src/resources/ai-agent.ts)

<details>
<summary><code>deleteAiCartSessionId(request: AiAgent.DeleteAiCartSessionIdRequest, options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, AiAgent.DeleteAiCartSessionIdError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Clear the AI-prepared cart for this session.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.aiAgent.deleteAiCartSessionId({ sessionId: "s_01HZX" });
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type AiAgent.DeleteAiCartSessionIdError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.aiAgent.deleteAiCartSessionId({ sessionId: "s_01HZX" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>sessionId</code> | <code>string</code> | Value for the sessionId parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.aiAgent.deleteAiCartSessionId(request)`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[AiAgent.DeleteAiCartSessionIdError](src/resources/ai-agent.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.aiAgent.deleteAiCartSessionId(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, AiAgent.DeleteAiCartSessionIdError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>deleteAiChatSessionId(request: AiAgent.DeleteAiChatSessionIdRequest, options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, AiAgent.DeleteAiChatSessionIdError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Clear conversation history for this session.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.aiAgent.deleteAiChatSessionId({ sessionId: "s_01HZX" });
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type AiAgent.DeleteAiChatSessionIdError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.aiAgent.deleteAiChatSessionId({ sessionId: "s_01HZX" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>sessionId</code> | <code>string</code> | Value for the sessionId parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.aiAgent.deleteAiChatSessionId(request)`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[AiAgent.DeleteAiChatSessionIdError](src/resources/ai-agent.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.aiAgent.deleteAiChatSessionId(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, AiAgent.DeleteAiChatSessionIdError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postAiChat(request: AiAgent.PostAiChatRequest, options?: RequestOptions): ApiPromise&lt;AiChatResponse, AiAgent.PostAiChatError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Chat with the shopping agent (builds a cart).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.aiAgent.postAiChat({ body: { message: "some example string" } });
  // TODO: Handle 'response' of type AiChatResponse
} catch (err) {
  // TODO: Handle 'err' of type AiAgent.PostAiChatError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.aiAgent.postAiChat({ body: { message: "some example string" } }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type AiChatResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[AiChatRequest](src/models/ai-chat-request.ts)</code> | The user's chat message plus optional shopper preferences used to prepare a cart. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.aiAgent.postAiChat(request)`

- **OnSuccess**: <code>[AiChatResponse](src/models/ai-chat-response.ts)</code>
- **OnError**: throws <code>[AiAgent.PostAiChatError](src/resources/ai-agent.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.aiAgent.postAiChat(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;AiChatResponse, AiAgent.PostAiChatError&gt;</code>, with `result.value` of type <code>[AiChatResponse](src/models/ai-chat-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## Policy

> Source: [Policy](src/resources/policy.ts)

<details>
<summary><code>getPolicyScope(request: Policy.GetPolicyScopeRequest, options?: RequestOptions): ApiPromise&lt;AllowanceScopeDetailResponse, Policy.GetPolicyScopeError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Returns the scope plus its event trail. Only the owning session may read it.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.policy.getPolicyScope({ scopeId: "some example string" });
  // TODO: Handle 'response' of type AllowanceScopeDetailResponse
} catch (err) {
  // TODO: Handle 'err' of type Policy.GetPolicyScopeError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.policy.getPolicyScope({ scopeId: "some example string" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type AllowanceScopeDetailResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>scopeId</code> | <code>string</code> | - |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.policy.getPolicyScope(request)`

- **OnSuccess**: <code>[AllowanceScopeDetailResponse](src/models/allowance-scope-detail-response.ts)</code>
- **OnError**: throws <code>[Policy.GetPolicyScopeError](src/resources/policy.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.policy.getPolicyScope(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;AllowanceScopeDetailResponse, Policy.GetPolicyScopeError&gt;</code>, with `result.value` of type <code>[AllowanceScopeDetailResponse](src/models/allowance-scope-detail-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getPolicyScopes(options?: RequestOptions): ApiPromise&lt;AllowanceScopeListResponse, Policy.GetPolicyScopesError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Returns all scopes owned by the authenticated session.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.policy.getPolicyScopes();
  // TODO: Handle 'response' of type AllowanceScopeListResponse
} catch (err) {
  // TODO: Handle 'err' of type Policy.GetPolicyScopesError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.policy.getPolicyScopes().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type AllowanceScopeListResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.policy.getPolicyScopes()`

- **OnSuccess**: <code>[AllowanceScopeListResponse](src/models/allowance-scope-list-response.ts)</code>
- **OnError**: throws <code>[Policy.GetPolicyScopesError](src/resources/policy.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.policy.getPolicyScopes().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;AllowanceScopeListResponse, Policy.GetPolicyScopesError&gt;</code>, with `result.value` of type <code>[AllowanceScopeListResponse](src/models/allowance-scope-list-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postPolicyPreview(request: Policy.PostPolicyPreviewRequest, options?: RequestOptions): ApiPromise&lt;PolicyPreviewResponse, Policy.PostPolicyPreviewError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Preview the authoritative policy decision for a cart (side-effect free).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.policy.postPolicyPreview({ body: {} });
  // TODO: Handle 'response' of type PolicyPreviewResponse
} catch (err) {
  // TODO: Handle 'err' of type Policy.PostPolicyPreviewError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.policy.postPolicyPreview({ body: {} }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type PolicyPreviewResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[PolicyPreviewRequest](src/models/policy-preview-request.ts)</code> | The cart items whose policy decision should be previewed (side-effect free). |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.policy.postPolicyPreview(request)`

- **OnSuccess**: <code>[PolicyPreviewResponse](src/models/policy-preview-response.ts)</code>
- **OnError**: throws <code>[Policy.PostPolicyPreviewError](src/resources/policy.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.policy.postPolicyPreview(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;PolicyPreviewResponse, Policy.PostPolicyPreviewError&gt;</code>, with `result.value` of type <code>[PolicyPreviewResponse](src/models/policy-preview-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postPolicyScopeApprove(request: Policy.PostPolicyScopeApproveRequest, options?: RequestOptions): ApiPromise&lt;AllowanceScope, Policy.PostPolicyScopeApproveError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Activates a PENDING scope, or records a fresh shopper approval for a limit increase. Limits remain capped by the global ceiling.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.policy.postPolicyScopeApprove({ scopeId: "some example string", body: {} });
  // TODO: Handle 'response' of type AllowanceScope
} catch (err) {
  // TODO: Handle 'err' of type Policy.PostPolicyScopeApproveError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.policy.postPolicyScopeApprove({
  scopeId: "some example string",
  body: {},
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type AllowanceScope
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>scopeId</code> | <code>string</code> | - |
| <code>body</code> | <code>[AllowanceScopeApproveInput](src/models/allowance-scope-approve-input.ts)</code> | - |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.policy.postPolicyScopeApprove(request)`

- **OnSuccess**: <code>[AllowanceScope](src/models/allowance-scope.ts)</code>
- **OnError**: throws <code>[Policy.PostPolicyScopeApproveError](src/resources/policy.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.policy.postPolicyScopeApprove(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;AllowanceScope, Policy.PostPolicyScopeApproveError&gt;</code>, with `result.value` of type <code>[AllowanceScope](src/models/allowance-scope.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postPolicyScopeRevoke(request: Policy.PostPolicyScopeRevokeRequest, options?: RequestOptions): ApiPromise&lt;AllowanceScope, Policy.PostPolicyScopeRevokeError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Revokes a scope. Subsequent checkouts bound to it fail closed.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.policy.postPolicyScopeRevoke({ scopeId: "some example string" });
  // TODO: Handle 'response' of type AllowanceScope
} catch (err) {
  // TODO: Handle 'err' of type Policy.PostPolicyScopeRevokeError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.policy.postPolicyScopeRevoke({ scopeId: "some example string" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type AllowanceScope
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>scopeId</code> | <code>string</code> | - |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.policy.postPolicyScopeRevoke(request)`

- **OnSuccess**: <code>[AllowanceScope](src/models/allowance-scope.ts)</code>
- **OnError**: throws <code>[Policy.PostPolicyScopeRevokeError](src/resources/policy.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.policy.postPolicyScopeRevoke(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;AllowanceScope, Policy.PostPolicyScopeRevokeError&gt;</code>, with `result.value` of type <code>[AllowanceScope](src/models/allowance-scope.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postPolicyScopes(request: Policy.PostPolicyScopesRequest, options?: RequestOptions): ApiPromise&lt;AllowanceScope, Policy.PostPolicyScopesError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Creates a scope. A HUMAN issuer yields an ACTIVE scope; an AI-prepared session yields a PENDING (agent-proposed) scope awaiting shopper approval.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.policy.postPolicyScopes({
    body: { label: "some example string", currency: "some example string" },
  });
  // TODO: Handle 'response' of type AllowanceScope
} catch (err) {
  // TODO: Handle 'err' of type Policy.PostPolicyScopesError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.policy.postPolicyScopes({
  body: { label: "some example string", currency: "some example string" },
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type AllowanceScope
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[AllowanceScopeCreateInput](src/models/allowance-scope-create-input.ts)</code> | - |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.policy.postPolicyScopes(request)`

- **OnSuccess**: <code>[AllowanceScope](src/models/allowance-scope.ts)</code>
- **OnError**: throws <code>[Policy.PostPolicyScopesError](src/resources/policy.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.policy.postPolicyScopes(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;AllowanceScope, Policy.PostPolicyScopesError&gt;</code>, with `result.value` of type <code>[AllowanceScope](src/models/allowance-scope.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postTakeHomeSuggestions(request: Policy.PostTakeHomeSuggestionsRequest, options?: RequestOptions): ApiPromise&lt;TakeHomeResponse, Policy.PostTakeHomeSuggestionsError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Read-only product discovery through Channel3. The query is built on the server from the catalog category of the cart items; no client text is forwarded. Results are outbound retailer links: not part of the PayPal cart, not covered by the spending allowance, never paid through this API. Returns enabled=false when no Channel3 key is configured.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.policy.postTakeHomeSuggestions({
    body: { items: [{ productId: "some example string" }] },
  });
  // TODO: Handle 'response' of type TakeHomeResponse
} catch (err) {
  // TODO: Handle 'err' of type Policy.PostTakeHomeSuggestionsError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.policy.postTakeHomeSuggestions({
  body: { items: [{ productId: "some example string" }] },
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type TakeHomeResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[TakeHomeRequest](src/models/take-home-request.ts)</code> | - |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.policy.postTakeHomeSuggestions(request)`

- **OnSuccess**: <code>[TakeHomeResponse](src/models/take-home-response.ts)</code>
- **OnError**: throws <code>[Policy.PostTakeHomeSuggestionsError](src/resources/policy.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.policy.postTakeHomeSuggestions(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;TakeHomeResponse, Policy.PostTakeHomeSuggestionsError&gt;</code>, with `result.value` of type <code>[TakeHomeResponse](src/models/take-home-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## Orders

> Source: [Orders](src/resources/orders.ts)

<details>
<summary><code>getCheckoutCancel(request: Orders.GetCheckoutCancelRequest, options?: RequestOptions): ApiPromise&lt;undefined, Orders.GetCheckoutCancelError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

PayPal cancel redirect.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  await client.orders.getCheckoutCancel({ token: "5O190127TN364715T" });
} catch (err) {
  // TODO: Handle 'err' of type Orders.GetCheckoutCancelError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.orders.getCheckoutCancel({ token: "5O190127TN364715T" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: The call succeeded and resolves to no body
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>token</code> | <code>string</code> | PayPal approval token returned when the order was created. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.orders.getCheckoutCancel(request)`

- **OnSuccess**: <code>undefined</code>
- **OnError**: throws <code>[Orders.GetCheckoutCancelError](src/resources/orders.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.orders.getCheckoutCancel(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;undefined, Orders.GetCheckoutCancelError&gt;</code>, with `result.value` of type <code>undefined</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getCheckoutReturn(request: Orders.GetCheckoutReturnRequest, options?: RequestOptions): ApiPromise&lt;undefined, Orders.GetCheckoutReturnError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

PayPal return redirect.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  await client.orders.getCheckoutReturn({ token: "5O190127TN364715T" });
} catch (err) {
  // TODO: Handle 'err' of type Orders.GetCheckoutReturnError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.orders.getCheckoutReturn({ token: "5O190127TN364715T" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: The call succeeded and resolves to no body
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>token</code> | <code>string</code> | PayPal approval token returned when the order was created. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.orders.getCheckoutReturn(request)`

- **OnSuccess**: <code>undefined</code>
- **OnError**: throws <code>[Orders.GetCheckoutReturnError](src/resources/orders.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.orders.getCheckoutReturn(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;undefined, Orders.GetCheckoutReturnError&gt;</code>, with `result.value` of type <code>undefined</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getOrders(request?: Orders.GetOrdersRequest, options?: RequestOptions): ApiPromise&lt;OrdersListResponse, Orders.GetOrdersError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open and returns a minimised view.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.orders.getOrders({ status: "CREATED", limit: 20 });
  // TODO: Handle 'response' of type OrdersListResponse
} catch (err) {
  // TODO: Handle 'err' of type Orders.GetOrdersError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.orders.getOrders({ status: "CREATED", limit: 20 }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type OrdersListResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>origin?</code> | <code>[Origin2](src/models/origin2.ts)</code> | Value for the origin parameter. |
| <code>status?</code> | <code>string</code> | Value for the status parameter. |
| <code>limit?</code> | <code>number</code> | Value for the limit parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.orders.getOrders(request)`

- **OnSuccess**: <code>[OrdersListResponse](src/models/orders-list-response.ts)</code>
- **OnError**: throws <code>[Orders.GetOrdersError](src/resources/orders.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.orders.getOrders(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;OrdersListResponse, Orders.GetOrdersError&gt;</code>, with `result.value` of type <code>[OrdersListResponse](src/models/orders-list-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getOrdersStats(options?: RequestOptions): ApiPromise&lt;OrdersStats, Orders.GetOrdersStatsError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open and returns a minimised view.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.orders.getOrdersStats();
  // TODO: Handle 'response' of type OrdersStats
} catch (err) {
  // TODO: Handle 'err' of type Orders.GetOrdersStatsError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.orders.getOrdersStats().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type OrdersStats
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.orders.getOrdersStats()`

- **OnSuccess**: <code>[OrdersStats](src/models/orders-stats.ts)</code>
- **OnError**: throws <code>[Orders.GetOrdersStatsError](src/resources/orders.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.orders.getOrdersStats().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;OrdersStats, Orders.GetOrdersStatsError&gt;</code>, with `result.value` of type <code>[OrdersStats](src/models/orders-stats.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postOrdersCreate(request: Orders.PostOrdersCreateRequest, options?: RequestOptions): ApiPromise&lt;CreateOrderResponse, Orders.PostOrdersCreateError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Create an order from items (server re-prices; policy enforced).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.orders.postOrdersCreate({
    idempotencyKey: "idem_01HZX",
    body: { items: [{ productId: "some example string", quantity: 1 }] },
  });
  // TODO: Handle 'response' of type CreateOrderResponse
} catch (err) {
  // TODO: Handle 'err' of type Orders.PostOrdersCreateError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.orders.postOrdersCreate({
  idempotencyKey: "idem_01HZX",
  body: { items: [{ productId: "some example string", quantity: 1 }] },
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type CreateOrderResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>idempotencyKey?</code> | <code>string</code> | Client key; server hashes it with the session and reuses as PayPal-Request-Id. |
| <code>body</code> | <code>[CreateOrderRequest](src/models/create-order-request.ts)</code> | The items to order. The server re-prices authoritatively and enforces policy. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.orders.postOrdersCreate(request)`

- **OnSuccess**: <code>[CreateOrderResponse](src/models/create-order-response.ts)</code>
- **OnError**: throws <code>[Orders.PostOrdersCreateError](src/resources/orders.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.orders.postOrdersCreate(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;CreateOrderResponse, Orders.PostOrdersCreateError&gt;</code>, with `result.value` of type <code>[CreateOrderResponse](src/models/create-order-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postOrdersOrderIdCancel(request: Orders.PostOrdersOrderIdCancelRequest, options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, Orders.PostOrdersOrderIdCancelError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Cancel a not-yet-captured checkout.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.orders.postOrdersOrderIdCancel({ orderId: "ord_01HZX" });
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type Orders.PostOrdersOrderIdCancelError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.orders.postOrdersOrderIdCancel({ orderId: "ord_01HZX" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>orderId</code> | <code>string</code> | Value for the orderId parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.orders.postOrdersOrderIdCancel(request)`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[Orders.PostOrdersOrderIdCancelError](src/resources/orders.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.orders.postOrdersOrderIdCancel(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, Orders.PostOrdersOrderIdCancelError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postOrdersOrderIdCapture(request: Orders.PostOrdersOrderIdCaptureRequest, options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, Orders.PostOrdersOrderIdCaptureError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Capture the PayPal order (after human approval).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.orders.postOrdersOrderIdCapture({ orderId: "ord_01HZX" });
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type Orders.PostOrdersOrderIdCaptureError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.orders.postOrdersOrderIdCapture({ orderId: "ord_01HZX" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>orderId</code> | <code>string</code> | Value for the orderId parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.orders.postOrdersOrderIdCapture(request)`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[Orders.PostOrdersOrderIdCaptureError](src/resources/orders.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.orders.postOrdersOrderIdCapture(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, Orders.PostOrdersOrderIdCaptureError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postWebhooksPaypal(options?: RequestOptions): ApiPromise&lt;undefined, Orders.PostWebhooksPaypalError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

PayPal webhook receiver (signature-verified).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  await client.orders.postWebhooksPaypal();
} catch (err) {
  // TODO: Handle 'err' of type Orders.PostWebhooksPaypalError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.orders.postWebhooksPaypal().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: The call succeeded and resolves to no body
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.orders.postWebhooksPaypal()`

- **OnSuccess**: <code>undefined</code>
- **OnError**: throws <code>[Orders.PostWebhooksPaypalError](src/resources/orders.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.orders.postWebhooksPaypal().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;undefined, Orders.PostWebhooksPaypalError&gt;</code>, with `result.value` of type <code>undefined</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## OpsCopilot

> Source: [OpsCopilot](src/resources/ops-copilot.ts)

<details>
<summary><code>getOpsStatus(options?: RequestOptions): ApiPromise&lt;OpsStatus, OpsCopilot.GetOpsStatusError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Ops Copilot capability status.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.opsCopilot.getOpsStatus();
  // TODO: Handle 'response' of type OpsStatus
} catch (err) {
  // TODO: Handle 'err' of type OpsCopilot.GetOpsStatusError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.opsCopilot.getOpsStatus().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type OpsStatus
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.opsCopilot.getOpsStatus()`

- **OnSuccess**: <code>[OpsStatus](src/models/ops-status.ts)</code>
- **OnError**: throws <code>[OpsCopilot.GetOpsStatusError](src/resources/ops-copilot.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.opsCopilot.getOpsStatus().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;OpsStatus, OpsCopilot.GetOpsStatusError&gt;</code>, with `result.value` of type <code>[OpsStatus](src/models/ops-status.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postOpsAsk(request: OpsCopilot.PostOpsAskRequest, options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, OpsCopilot.PostOpsAskError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Ask the merchant copilot (read-only PayPal access; may only propose refunds).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.opsCopilot.postOpsAsk({
    xOpsKey: "ops_key_demo",
    body: { question: "some example string" },
  });
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type OpsCopilot.PostOpsAskError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.opsCopilot.postOpsAsk({
  xOpsKey: "ops_key_demo",
  body: { question: "some example string" },
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>xOpsKey?</code> | <code>string</code> | Required when Ops Copilot is enabled. |
| <code>body</code> | <code>[OpsAskRequest](src/models/ops-ask-request.ts)</code> | A natural-language question for the merchant Copilot (read-only; may only propose refunds). |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.opsCopilot.postOpsAsk(request)`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[OpsCopilot.PostOpsAskError](src/resources/ops-copilot.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.opsCopilot.postOpsAsk(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, OpsCopilot.PostOpsAskError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## Audit

> Source: [Audit](src/resources/audit.ts)

<details>
<summary><code>getPolicyEvents(request?: Audit.GetPolicyEventsRequest, options?: RequestOptions): ApiPromise&lt;PolicyEventsResponse, Audit.GetPolicyEventsError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open and returns a minimised view.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.audit.getPolicyEvents({ userId: "demo", limit: 20 });
  // TODO: Handle 'response' of type PolicyEventsResponse
} catch (err) {
  // TODO: Handle 'err' of type Audit.GetPolicyEventsError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.audit.getPolicyEvents({ userId: "demo", limit: 20 }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type PolicyEventsResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>decision?</code> | <code>[PolicyDecision](src/models/policy-decision.ts)</code> | Value for the decision parameter. |
| <code>userId?</code> | <code>string</code> | Value for the userId parameter. |
| <code>limit?</code> | <code>number</code> | Value for the limit parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.audit.getPolicyEvents(request)`

- **OnSuccess**: <code>[PolicyEventsResponse](src/models/policy-events-response.ts)</code>
- **OnError**: throws <code>[Audit.GetPolicyEventsError](src/resources/audit.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.audit.getPolicyEvents(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;PolicyEventsResponse, Audit.GetPolicyEventsError&gt;</code>, with `result.value` of type <code>[PolicyEventsResponse](src/models/policy-events-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getPolicyEventsStats(request?: Audit.GetPolicyEventsStatsRequest, options?: RequestOptions): ApiPromise&lt;PolicyEventsStats, Audit.GetPolicyEventsStatsError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open and returns a minimised view.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.audit.getPolicyEventsStats({ userId: "demo" });
  // TODO: Handle 'response' of type PolicyEventsStats
} catch (err) {
  // TODO: Handle 'err' of type Audit.GetPolicyEventsStatsError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.audit.getPolicyEventsStats({ userId: "demo" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type PolicyEventsStats
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>userId?</code> | <code>string</code> | Value for the userId parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.audit.getPolicyEventsStats(request)`

- **OnSuccess**: <code>[PolicyEventsStats](src/models/policy-events-stats.ts)</code>
- **OnError**: throws <code>[Audit.GetPolicyEventsStatsError](src/resources/audit.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.audit.getPolicyEventsStats(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;PolicyEventsStats, Audit.GetPolicyEventsStatsError&gt;</code>, with `result.value` of type <code>[PolicyEventsStats](src/models/policy-events-stats.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## McpAgenticCommerce

> Source: [McpAgenticCommerce](src/resources/mcp-agentic-commerce.ts)

<details>
<summary><code>mcpEndSession(request: McpAgenticCommerce.McpEndSessionRequest, options?: RequestOptions): ApiPromise&lt;undefined, McpAgenticCommerce.McpEndSessionError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

End an MCP session.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  await client.mcpAgenticCommerce.mcpEndSession({ mcpSessionId: "mcp_s_01HZX" });
} catch (err) {
  // TODO: Handle 'err' of type McpAgenticCommerce.McpEndSessionError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.mcpAgenticCommerce.mcpEndSession({ mcpSessionId: "mcp_s_01HZX" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: The call succeeded and resolves to no body
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>mcpSessionId</code> | <code>string</code> | Session header returned by MCP initialize; required for tools/call. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.mcpAgenticCommerce.mcpEndSession(request)`

- **OnSuccess**: <code>undefined</code>
- **OnError**: throws <code>[McpAgenticCommerce.McpEndSessionError](src/resources/mcp-agentic-commerce.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.mcpAgenticCommerce.mcpEndSession(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;undefined, McpAgenticCommerce.McpEndSessionError&gt;</code>, with `result.value` of type <code>undefined</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>mcpRpc(request: McpAgenticCommerce.McpRpcRequest, options?: RequestOptions): ApiPromise&lt;McpResponse, McpAgenticCommerce.McpRpcError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Tools: `search_menu`, `prepare_cart`, `check_policy`, `start_checkout`, `get_order_status`. There is deliberately NO capture/pay/refund tool: `start_checkout` returns a PayPal sandbox approval URL that a human must approve. Call `initialize` first and send the returned `Mcp-Session-Id` header on every later request. A GET on this path returns 405 (the optional SSE stream is not offered).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.mcpAgenticCommerce.mcpRpc({
    mcpSessionId: "mcp_s_01HZX",
    body: { method: Method.ValueInitializeDescriptionEnumValueInitialize },
  });
  // TODO: Handle 'response' of type McpResponse
} catch (err) {
  // TODO: Handle 'err' of type McpAgenticCommerce.McpRpcError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.mcpAgenticCommerce.mcpRpc({
  mcpSessionId: "mcp_s_01HZX",
  body: { method: Method.ValueInitializeDescriptionEnumValueInitialize },
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type McpResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>mcpSessionId?</code> | <code>string</code> | Returned by `initialize`. |
| <code>body</code> | <code>[McpRequest](src/models/mcp-request.ts)</code> | An MCP JSON-RPC 2.0 request (initialize, tools/list, or tools/call). |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.mcpAgenticCommerce.mcpRpc(request)`

- **OnSuccess**: <code>[McpResponse](src/models/mcp-response.ts)</code>
- **OnError**: throws <code>[McpAgenticCommerce.McpRpcError](src/resources/mcp-agentic-commerce.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.mcpAgenticCommerce.mcpRpc(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;McpResponse, McpAgenticCommerce.McpRpcError&gt;</code>, with `result.value` of type <code>[McpResponse](src/models/mcp-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## Refunds

> Source: [Refunds](src/resources/refunds.ts)

<details>
<summary><code>approveRefund(request: Refunds.ApproveRefundRequest, options?: RequestOptions): ApiPromise&lt;RefundRequest, Refunds.ApproveRefundError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

The only endpoint that calls PayPal's refund API. Uses a stable PayPal-Request-Id (`aicafe-refund-<id>`), but does not rely on its unverified retention window alone: an ambiguous outcome must be reconciled against the PayPal refund or capture before another request.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.refunds.approveRefund({ id: "coffee", xOpsKey: "ops_key_demo" });
  // TODO: Handle 'response' of type RefundRequest
} catch (err) {
  // TODO: Handle 'err' of type Refunds.ApproveRefundError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.refunds.approveRefund({ id: "coffee", xOpsKey: "ops_key_demo" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type RefundRequest
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>id</code> | <code>string</code> | Value for the id parameter. |
| <code>xOpsKey</code> | <code>string</code> | Merchant key. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.refunds.approveRefund(request)`

- **OnSuccess**: <code>[RefundRequest](src/models/refund-request.ts)</code>
- **OnError**: throws <code>[Refunds.ApproveRefundError](src/resources/refunds.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.refunds.approveRefund(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;RefundRequest, Refunds.ApproveRefundError&gt;</code>, with `result.value` of type <code>[RefundRequest](src/models/refund-request.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>listRefunds(request: Refunds.ListRefundsRequest, options?: RequestOptions): ApiPromise&lt;ApiRefundsResponse, Refunds.ListRefundsError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

List refund requests (newest first).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.refunds.listRefunds({ xOpsKey: "ops_key_demo" });
  // TODO: Handle 'response' of type ApiRefundsResponse
} catch (err) {
  // TODO: Handle 'err' of type Refunds.ListRefundsError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.refunds.listRefunds({ xOpsKey: "ops_key_demo" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type ApiRefundsResponse
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>xOpsKey</code> | <code>string</code> | Merchant key. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.refunds.listRefunds(request)`

- **OnSuccess**: <code>[ApiRefundsResponse](src/models/api-refunds-response.ts)</code>
- **OnError**: throws <code>[Refunds.ListRefundsError](src/resources/refunds.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.refunds.listRefunds(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;ApiRefundsResponse, Refunds.ListRefundsError&gt;</code>, with `result.value` of type <code>[ApiRefundsResponse](src/models/api-refunds-response.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>proposeRefund(request: Refunds.ProposeRefundRequestParams, options?: RequestOptions): ApiPromise&lt;RefundRequest, Refunds.ProposeRefundError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Propose a refund (moves no money).

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.refunds.proposeRefund({
    xOpsKey: "ops_key_demo",
    body: { orderId: "some example string", reason: "some example string" },
  });
  // TODO: Handle 'response' of type RefundRequest
} catch (err) {
  // TODO: Handle 'err' of type Refunds.ProposeRefundError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.refunds.proposeRefund({
  xOpsKey: "ops_key_demo",
  body: { orderId: "some example string", reason: "some example string" },
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type RefundRequest
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>xOpsKey</code> | <code>string</code> | Merchant key. |
| <code>body</code> | <code>[ProposeRefundRequest](src/models/propose-refund-request.ts)</code> | Details of the refund request to propose. Proposing moves no money. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.refunds.proposeRefund(request)`

- **OnSuccess**: <code>[RefundRequest](src/models/refund-request.ts)</code>
- **OnError**: throws <code>[Refunds.ProposeRefundError](src/resources/refunds.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.refunds.proposeRefund(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;RefundRequest, Refunds.ProposeRefundError&gt;</code>, with `result.value` of type <code>[RefundRequest](src/models/refund-request.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>rejectRefund(request: Refunds.RejectRefundRequest, options?: RequestOptions): ApiPromise&lt;RefundRequest, Refunds.RejectRefundError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Reject a proposed refund.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.refunds.rejectRefund({ id: "coffee", xOpsKey: "ops_key_demo" });
  // TODO: Handle 'response' of type RefundRequest
} catch (err) {
  // TODO: Handle 'err' of type Refunds.RejectRefundError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.refunds.rejectRefund({ id: "coffee", xOpsKey: "ops_key_demo" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type RefundRequest
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>id</code> | <code>string</code> | Value for the id parameter. |
| <code>xOpsKey</code> | <code>string</code> | Merchant key. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.refunds.rejectRefund(request)`

- **OnSuccess**: <code>[RefundRequest](src/models/refund-request.ts)</code>
- **OnError**: throws <code>[Refunds.RejectRefundError](src/resources/refunds.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.refunds.rejectRefund(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;RefundRequest, Refunds.RejectRefundError&gt;</code>, with `result.value` of type <code>[RefundRequest](src/models/refund-request.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## Mandates

> Source: [Mandates](src/resources/mandates.ts)

<details>
<summary><code>getOrderMandate(request: Mandates.GetOrderMandateRequest, options?: RequestOptions): ApiPromise&lt;SignedCartMandate, Mandates.GetOrderMandateError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Ed25519-signed, deterministic record of what the shopper was asked to approve: items, server prices, total, origin (HUMAN / AI_AGENT) and the constraints (the agent may not authorize payment; payment authority is the buyer's approval at PayPal). Derived from the stored order, so it survives restarts when MANDATE_SIGNING_KEY is configured. Another session's order is a 404.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.mandates.getOrderMandate({ orderId: "ord_01HZX" });
  // TODO: Handle 'response' of type SignedCartMandate
} catch (err) {
  // TODO: Handle 'err' of type Mandates.GetOrderMandateError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.mandates.getOrderMandate({ orderId: "ord_01HZX" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type SignedCartMandate
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>orderId</code> | <code>string</code> | Value for the orderId parameter. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.mandates.getOrderMandate(request)`

- **OnSuccess**: <code>[SignedCartMandate](src/models/signed-cart-mandate.ts)</code>
- **OnError**: throws <code>[Mandates.GetOrderMandateError](src/resources/mandates.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.mandates.getOrderMandate(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;SignedCartMandate, Mandates.GetOrderMandateError&gt;</code>, with `result.value` of type <code>[SignedCartMandate](src/models/signed-cart-mandate.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>postMandatesVerify(request: Mandates.PostMandatesVerifyRequest, options?: RequestOptions): ApiPromise&lt;MandateVerification, Mandates.PostMandatesVerifyError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Checks the key id, the Ed25519 signature, the expiry window and, when the order is still known, that the mandate still matches it. Expiry is informational: a genuine but expired mandate stays valid.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.mandates.postMandatesVerify({
    body: { mandate: {}, signature: "some example string", kid: "some example string" },
  });
  // TODO: Handle 'response' of type MandateVerification
} catch (err) {
  // TODO: Handle 'err' of type Mandates.PostMandatesVerifyError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.mandates.postMandatesVerify({
  body: { mandate: {}, signature: "some example string", kid: "some example string" },
}).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type MandateVerification
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>body</code> | <code>[SignedCartMandate](src/models/signed-cart-mandate.ts)</code> | The signed Cart Mandate to verify against the published signing key. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.mandates.postMandatesVerify(request)`

- **OnSuccess**: <code>[MandateVerification](src/models/mandate-verification.ts)</code>
- **OnError**: throws <code>[Mandates.PostMandatesVerifyError](src/resources/mandates.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.mandates.postMandatesVerify(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;MandateVerification, Mandates.PostMandatesVerifyError&gt;</code>, with `result.value` of type <code>[MandateVerification](src/models/mandate-verification.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## AgentDiscovery

> Source: [AgentDiscovery](src/resources/agent-discovery.ts)

<details>
<summary><code>getAgentCard(options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, AgentDiscovery.GetAgentCardError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Compact card generated from /.well-known/agent-commerce.json; cannot disagree with it.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.agentDiscovery.getAgentCard();
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type AgentDiscovery.GetAgentCardError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.agentDiscovery.getAgentCard().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.agentDiscovery.getAgentCard()`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[AgentDiscovery.GetAgentCardError](src/resources/agent-discovery.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.agentDiscovery.getAgentCard().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, AgentDiscovery.GetAgentCardError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getAgentCommerceManifest(options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, AgentDiscovery.GetAgentCommerceManifestError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Single source of truth for AI agents: merchant, endpoints, MCP tool names (derived from the real MCP registry), guardrails (agentCanPay/Capture/Refund = false), policy limits, Cart Mandate verification info and disclaimers. Custom aicafe.* format; not an official PayPal Agent Ready, Store Sync or AP2 integration. URLs come from PUBLIC_BASE_URL (required in production); public cache only when it is configured.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.agentDiscovery.getAgentCommerceManifest();
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type AgentDiscovery.GetAgentCommerceManifestError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.agentDiscovery.getAgentCommerceManifest().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.agentDiscovery.getAgentCommerceManifest()`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[AgentDiscovery.GetAgentCommerceManifestError](src/resources/agent-discovery.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.agentDiscovery.getAgentCommerceManifest().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, AgentDiscovery.GetAgentCommerceManifestError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getFeedProducts(options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, AgentDiscovery.GetFeedProductsError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Custom schema.org-style JSON-LD ItemList of Product/Offer entries with server catalog prices (price decimal string, additionalProperty priceMinor/dietary). Not an official PayPal Store Sync feed. Read-only, ETag-revalidatable.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.agentDiscovery.getFeedProducts();
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type AgentDiscovery.GetFeedProductsError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.agentDiscovery.getFeedProducts().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.agentDiscovery.getFeedProducts()`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[AgentDiscovery.GetFeedProductsError](src/resources/agent-discovery.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.agentDiscovery.getFeedProducts().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, AgentDiscovery.GetFeedProductsError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getLlmsTxt(options?: RequestOptions): ApiPromise&lt;string, AgentDiscovery.GetLlmsTxtError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Plain-text summary generated from /.well-known/agent-commerce.json.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.agentDiscovery.getLlmsTxt();
  // TODO: Handle 'response' of type string
} catch (err) {
  // TODO: Handle 'err' of type AgentDiscovery.GetLlmsTxtError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.agentDiscovery.getLlmsTxt().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type string
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.agentDiscovery.getLlmsTxt()`

- **OnSuccess**: <code>string</code>
- **OnError**: throws <code>[AgentDiscovery.GetLlmsTxtError](src/resources/agent-discovery.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.agentDiscovery.getLlmsTxt().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;string, AgentDiscovery.GetLlmsTxtError&gt;</code>, with `result.value` of type <code>string</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getMandateKeys(options?: RequestOptions): ApiPromise&lt;Record&lt;string, unknown&gt;, AgentDiscovery.GetMandateKeysError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Active and previous Ed25519 PUBLIC keys (status: active|previous), keyPersistence (configured|ephemeral) and the canonicalization label. 503 if the key configuration is invalid.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.agentDiscovery.getMandateKeys();
  // TODO: Handle 'response' of type Record<string, unknown>
} catch (err) {
  // TODO: Handle 'err' of type AgentDiscovery.GetMandateKeysError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.agentDiscovery.getMandateKeys().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Record<string, unknown>
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.agentDiscovery.getMandateKeys()`

- **OnSuccess**: <code>Record&lt;string, unknown&gt;</code>
- **OnError**: throws <code>[AgentDiscovery.GetMandateKeysError](src/resources/agent-discovery.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.agentDiscovery.getMandateKeys().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Record&lt;string, unknown&gt;, AgentDiscovery.GetMandateKeysError&gt;</code>, with `result.value` of type <code>Record&lt;string, unknown&gt;</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[AiCafPayPalCommerceAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>


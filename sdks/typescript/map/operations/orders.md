<!-- Generated file — do not edit; regenerated with the SDK. -->

# Orders — operations

Accessor: `client.orders` · Source: `src/resources/orders.ts` · 8 operations · Request and error types: namespace `Orders`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `ai-caf-pay-pal-commerce-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getCheckoutCancel

- **Signature**: `getCheckoutCancel(request: Orders.GetCheckoutCancelRequest, options?: RequestOptions): ApiPromise<undefined, Orders.GetCheckoutCancelError>`
- **Wire**: `GET /api/checkout/cancel`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `undefined` — the operation resolves to nothing
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Orders.GetCheckoutCancelError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [4XX wildcard] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Orders.GetCheckoutCancelRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `token` | `query` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |

### getCheckoutReturn

- **Signature**: `getCheckoutReturn(request: Orders.GetCheckoutReturnRequest, options?: RequestOptions): ApiPromise<undefined, Orders.GetCheckoutReturnError>`
- **Wire**: `GET /api/checkout/return`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `undefined` — the operation resolves to nothing
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Orders.GetCheckoutReturnError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [4XX wildcard] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Orders.GetCheckoutReturnRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `token` | `query` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |

### getOrders

- **Signature**: `getOrders(request?: Orders.GetOrdersRequest, options?: RequestOptions): ApiPromise<OrdersListResponse, Orders.GetOrdersError>`
- **Wire**: `GET /api/orders`
- **Auth**: `opsKey`
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `OrdersListResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Orders.GetOrdersError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [401] `Error` · `"error3"` [429] `Error` · `"error4"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Orders.GetOrdersRequest` (3):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `origin` | `query` | `Origin2` | no |
| `status` | `query` | `string` | no |
| `limit` | `query` | `number` | no |

| Type | Schema value | Source |
| --- | --- | --- |
| `Origin2` | `origin2Schema` | `src/models/origin2.ts` |
| `OrdersListResponse` | `ordersListResponseSchema` | `src/models/orders-list-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### getOrdersStats

- **Signature**: `getOrdersStats(options?: RequestOptions): ApiPromise<OrdersStats, Orders.GetOrdersStatsError>`
- **Wire**: `GET /api/orders/stats`
- **Auth**: `opsKey`
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `OrdersStats`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Orders.GetOrdersStatsError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [429] `Error` · `"error3"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `OrdersStats` | `ordersStatsSchema` | `src/models/orders-stats.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postOrdersCreate

- **Signature**: `postOrdersCreate(request: Orders.PostOrdersCreateRequest, options?: RequestOptions): ApiPromise<CreateOrderResponse, Orders.PostOrdersCreateError>`
- **Wire**: `POST /api/orders/create`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: `application/json` — the `body` field
- **Returns**: `CreateOrderResponse`
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Orders.PostOrdersCreateError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [403] `Error` · `"error3"` [429] `Error` · `"error4"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Orders.PostOrdersCreateRequest` (2):

| Field | Channel | Wire | Type | Req |
| --- | --- | --- | --- | --- |
| `idempotencyKey` | `header` | `Idempotency-Key` | `string` | no |
| `body` | `body` | — | `CreateOrderRequest` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `CreateOrderRequest` | `createOrderRequestSchema` | `src/models/create-order-request.ts` |
| `CreateOrderResponse` | `createOrderResponseSchema` | `src/models/create-order-response.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postOrdersOrderIdCancel

- **Signature**: `postOrdersOrderIdCancel(request: Orders.PostOrdersOrderIdCancelRequest, options?: RequestOptions): ApiPromise<Record<string, unknown>, Orders.PostOrdersOrderIdCancelError>`
- **Wire**: `POST /api/orders/{orderId}/cancel`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Orders.PostOrdersOrderIdCancelError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [404] `Error` · `"error2"` [409] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Orders.PostOrdersOrderIdCancelRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `orderId` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postOrdersOrderIdCapture

- **Signature**: `postOrdersOrderIdCapture(request: Orders.PostOrdersOrderIdCaptureRequest, options?: RequestOptions): ApiPromise<Record<string, unknown>, Orders.PostOrdersOrderIdCaptureError>`
- **Wire**: `POST /api/orders/{orderId}/capture`
- **Auth**: all of `sessionId`, `bearerAuth` — both are sent
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `Record<string, unknown>` — a bare `application/json` map; the success type *is* the map
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Orders.PostOrdersOrderIdCaptureError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [402] `Error` · `"error3"` [404] `Error` · `"error4"` [409] `Error` · `"error5"` [429] `Error` · `"error6"` [502] `Error` · `"error7"` [503] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `Orders.PostOrdersOrderIdCaptureRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `orderId` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |

### postWebhooksPaypal

- **Signature**: `postWebhooksPaypal(options?: RequestOptions): ApiPromise<undefined, Orders.PostWebhooksPaypalError>`
- **Wire**: `POST /api/webhooks/paypal`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **SDK-sent**: `header Idempotency-Key` (minted per call)
- **Returns**: `undefined` — the operation resolves to nothing
- **Error**: `AiCafPayPalCommerceAgentApiError` with `kind: "api"`, an instance of `Orders.PostWebhooksPaypalError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `Error` | `errorSchema` | `src/models/error.ts` |


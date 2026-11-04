<!-- Generated file — do not edit; regenerated with the SDK. -->

# Orders — operations

Accessor: `client.orders` · Source: `ai_caf_pay_pal_commerce_agent_api/apis/orders.py` · 8 operations

Each `###` block is one operation and assumes `sdk-map.md` is loaded: blocks omit what its invariants table covers and are otherwise self-contained, so chunk at block level. Signatures are the sync parsed spelling; the async and raw spellings take the same parameters (see sdk-map.md). **Type sources** names the module declaring each type an operation mentions, so resolving a body, return or error payload is a lookup rather than a search; the runtime types `RawError` and `ApiResult` are excluded.

### client.orders.get_checkout_cancel

- **Route**: `GET /api/checkout/cancel`
- **Signature**: `def get_checkout_cancel(token: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `token`
- **Params**: `token` — query
- **Returns (parsed)**: `None`
- **Returns (raw)**: `ApiResult[None, GetCheckoutCancelErrorBody]`
- **Error**: `GetCheckoutCancelErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [4XX] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `GetCheckoutCancelErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_checkout_cancel_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.orders.get_checkout_return

- **Route**: `GET /api/checkout/return`
- **Signature**: `def get_checkout_return(token: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `token`
- **Params**: `token` — query
- **Returns (parsed)**: `None`
- **Returns (raw)**: `ApiResult[None, GetCheckoutReturnErrorBody]`
- **Error**: `GetCheckoutReturnErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [4XX] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `GetCheckoutReturnErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_checkout_return_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.orders.get_orders

- **Route**: `GET /api/orders`
- **Auth**: `ops_key`
- **Signature**: `def get_orders(*, origin: Origin2OrStr | None = None, status: str | None = None, limit: int | None = None, request_options: RequestOptionsOrDict | None = None)`
- **Params**: `origin` — query · `status` — query · `limit` — query
- **Returns (parsed)**: `OrdersListResponse`
- **Returns (raw)**: `ApiResult[OrdersListResponse, GetOrdersErrorBody]`
- **Error**: `GetOrdersErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [400, 401, 429, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `Origin2OrStr` | `ai_caf_pay_pal_commerce_agent_api/models/enums/origin2.py` |
| `OrdersListResponse` | `ai_caf_pay_pal_commerce_agent_api/models/orders_list_response.py` |
| `GetOrdersErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_orders_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.orders.get_orders_stats

- **Route**: `GET /api/orders/stats`
- **Auth**: `ops_key`
- **Signature**: `def get_orders_stats(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `OrdersStats`
- **Returns (raw)**: `ApiResult[OrdersStats, GetOrdersStatsErrorBody]`
- **Error**: `GetOrdersStatsErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [401, 429, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `OrdersStats` | `ai_caf_pay_pal_commerce_agent_api/models/orders_stats.py` |
| `GetOrdersStatsErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/get_orders_stats_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.orders.post_orders_create

- **Route**: `POST /api/orders/create`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def post_orders_create(body: CreateOrderRequest | CreateOrderRequestDict, *, idempotency_key: str | None = None, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `body`
- **Params**: `idempotency_key` — header `Idempotency-Key` · `body` — JSON body
- **Returns (parsed)**: `CreateOrderResponse`
- **Returns (raw)**: `ApiResult[CreateOrderResponse, PostOrdersCreateErrorBody]`
- **Error**: `PostOrdersCreateErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [400, 403, 429, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `CreateOrderRequest` | `ai_caf_pay_pal_commerce_agent_api/models/create_order_request.py` |
| `CreateOrderRequestDict` | `ai_caf_pay_pal_commerce_agent_api/models/create_order_request.py` |
| `CreateOrderResponse` | `ai_caf_pay_pal_commerce_agent_api/models/create_order_response.py` |
| `PostOrdersCreateErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/post_orders_create_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.orders.post_orders_order_id_cancel

- **Route**: `POST /api/orders/{orderId}/cancel`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def post_orders_order_id_cancel(order_id: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `order_id`
- **Params**: `order_id` — path `orderId`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, PostOrdersOrderIdCancelErrorBody]`
- **Error**: `PostOrdersOrderIdCancelErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [404, 409] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `PostOrdersOrderIdCancelErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/post_orders_order_id_cancel_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.orders.post_orders_order_id_capture

- **Route**: `POST /api/orders/{orderId}/capture`
- **Auth**: `session_id` AND `bearer_auth`
- **Signature**: `def post_orders_order_id_capture(order_id: str, *, request_options: RequestOptionsOrDict | None = None)`
  - required, positional: `order_id`
- **Params**: `order_id` — path `orderId`
- **Returns (parsed)**: `Any`
- **Returns (raw)**: `ApiResult[Any, PostOrdersOrderIdCaptureErrorBody]`
- **Error**: `PostOrdersOrderIdCaptureErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [400, 402, 404, 409, 429, 502, 503] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `PostOrdersOrderIdCaptureErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/post_orders_order_id_capture_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |

### client.orders.post_webhooks_paypal

- **Route**: `POST /api/webhooks/paypal`
- **Signature**: `def post_webhooks_paypal(*, request_options: RequestOptionsOrDict | None = None)`
- **Returns (parsed)**: `None`
- **Returns (raw)**: `ApiResult[None, PostWebhooksPaypalErrorBody]`
- **Error**: `PostWebhooksPaypalErrorBody` — **Case A (typed)**
- **Error arms**: `Error` [401] · `RawError` [anything unmapped]

| Type | Source |
| --- | --- |
| `PostWebhooksPaypalErrorBody` | `ai_caf_pay_pal_commerce_agent_api/errors/post_webhooks_paypal_error.py` |
| `Error` | `ai_caf_pay_pal_commerce_agent_api/models/error.py` |


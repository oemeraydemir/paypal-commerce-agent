from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from ..auth import AsyncAuthSchemes, AuthSchemes
from ..core import (
    AllSchemes,
    ApiResult,
    AsyncAllSchemes,
    AsyncRawClient,
    RawClient,
    RequestOptionsOrDict,
    SecuredRawResponse,
    async_empty_response,
    async_json_decoder,
    empty_response,
    json_body,
    json_decoder,
    param,
    unwrap,
)
from ..errors.get_checkout_cancel_error import GetCheckoutCancelErrorBody, get_checkout_cancel_error_mapper
from ..errors.get_checkout_return_error import GetCheckoutReturnErrorBody, get_checkout_return_error_mapper
from ..errors.get_orders_error import GetOrdersErrorBody, get_orders_error_mapper
from ..errors.get_orders_stats_error import GetOrdersStatsErrorBody, get_orders_stats_error_mapper
from ..errors.post_orders_create_error import PostOrdersCreateErrorBody, post_orders_create_error_mapper
from ..errors.post_orders_order_id_cancel_error import (
    PostOrdersOrderIdCancelErrorBody,
    post_orders_order_id_cancel_error_mapper,
)
from ..errors.post_orders_order_id_capture_error import (
    PostOrdersOrderIdCaptureErrorBody,
    post_orders_order_id_capture_error_mapper,
)
from ..errors.post_webhooks_paypal_error import PostWebhooksPaypalErrorBody, post_webhooks_paypal_error_mapper
from ..models.create_order_request import CreateOrderRequest, CreateOrderRequestDict
from ..models.create_order_response import CreateOrderResponse
from ..models.enums.origin2 import Origin2OrStr
from ..models.orders_list_response import OrdersListResponse
from ..models.orders_stats import OrdersStats
from ..server.server import Server


class Orders:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = OrdersWithRawResponse(client, server, auth)

    def get_checkout_cancel(self, token: str, *, request_options: RequestOptionsOrDict | None = None) -> None:
        """PayPal cancel redirect.

        Args:
            token: PayPal approval token returned when the order was created.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            HTML redirect page

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_checkout_cancel(token, request_options=request_options))

    def get_checkout_return(self, token: str, *, request_options: RequestOptionsOrDict | None = None) -> None:
        """PayPal return redirect.

        Args:
            token: PayPal approval token returned when the order was created.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            HTML redirect page

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_checkout_return(token, request_options=request_options))

    def get_orders(
        self,
        *,
        origin: Origin2OrStr | None = None,
        status: str | None = None,
        limit: int | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> OrdersListResponse:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            origin: Value for the origin parameter.
            status: Value for the status parameter.
            limit: Value for the limit parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Orders

        Raises:
            ApiError: Invalid filter Private mode: missing or wrong X-Ops-Key. Private mode: too many attempts. Private
                mode without a configured OPS_COPILOT_KEY. ``error`` is ``Error | RawError``."""
        return unwrap(
            self._with_raw_response.get_orders(
                origin=origin, status=status, limit=limit, request_options=request_options
            ),
        )

    def get_orders_stats(self, *, request_options: RequestOptionsOrDict | None = None) -> OrdersStats:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Stats

        Raises:
            ApiError: Private mode: missing or wrong X-Ops-Key. Private mode: too many attempts. Private mode without a
                configured OPS_COPILOT_KEY. ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_orders_stats(request_options=request_options))

    def post_orders_create(
        self,
        body: CreateOrderRequest | CreateOrderRequestDict,
        *,
        idempotency_key: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> CreateOrderResponse:
        """Create an order from items (server re-prices; policy enforced).

        Args:
            body: The items to order. The server re-prices authoritatively and enforces policy.
            idempotency_key: Client key; server hashes it with the session and reuses as PayPal-Request-Id.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Order created

        Raises:
            ApiError: Invalid input (quantity must be a JSON integer 1-100, unknown product, order total above the
                limit). Validated before PayPal configuration is checked. Blocked by policy Rate limit exceeded (policy
                preview 120/min per session and 600/min per IP; order create and capture 30/min per session and 120/min
                per IP). Retry-After header gives the wait in seconds. PayPal not configured, refund status could not be
                verified, or storage is unavailable; no blind retry is sent ``error`` is ``Error | RawError``."""
        return unwrap(
            self._with_raw_response.post_orders_create(
                body, idempotency_key=idempotency_key, request_options=request_options
            ),
        )

    def post_orders_order_id_cancel(self, order_id: str, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Cancel a not-yet-captured checkout.

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Cancelled

        Raises:
            ApiError: Order not found Already captured / capture in progress ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.post_orders_order_id_cancel(order_id, request_options=request_options))

    def post_orders_order_id_capture(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> Any:
        """Capture the PayPal order (after human approval).

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Captured

        Raises:
            ApiError: Not approved yet / not payable Payment declined Order not found Already captured / in progress
                Rate limit exceeded (policy preview 120/min per session and 600/min per IP; order create and capture
                30/min per session and 120/min per IP). Retry-After header gives the wait in seconds. PayPal transport
                error PayPal not configured ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.post_orders_order_id_capture(order_id, request_options=request_options))

    def post_webhooks_paypal(self, *, request_options: RequestOptionsOrDict | None = None) -> None:
        """PayPal webhook receiver (signature-verified).

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Processed / duplicate acknowledged

        Raises:
            ApiError: Invalid signature / missing headers ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.post_webhooks_paypal(request_options=request_options))

    @property
    def with_raw_response(self) -> OrdersWithRawResponse:
        return self._with_raw_response


class AsyncOrders:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncOrdersWithRawResponse(client, server, auth)

    async def get_checkout_cancel(self, token: str, *, request_options: RequestOptionsOrDict | None = None) -> None:
        """PayPal cancel redirect.

        Args:
            token: PayPal approval token returned when the order was created.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            HTML redirect page

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_checkout_cancel(token, request_options=request_options))

    async def get_checkout_return(self, token: str, *, request_options: RequestOptionsOrDict | None = None) -> None:
        """PayPal return redirect.

        Args:
            token: PayPal approval token returned when the order was created.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            HTML redirect page

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_checkout_return(token, request_options=request_options))

    async def get_orders(
        self,
        *,
        origin: Origin2OrStr | None = None,
        status: str | None = None,
        limit: int | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> OrdersListResponse:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            origin: Value for the origin parameter.
            status: Value for the status parameter.
            limit: Value for the limit parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Orders

        Raises:
            ApiError: Invalid filter Private mode: missing or wrong X-Ops-Key. Private mode: too many attempts. Private
                mode without a configured OPS_COPILOT_KEY. ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.get_orders(
                origin=origin, status=status, limit=limit, request_options=request_options
            ),
        )

    async def get_orders_stats(self, *, request_options: RequestOptionsOrDict | None = None) -> OrdersStats:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Stats

        Raises:
            ApiError: Private mode: missing or wrong X-Ops-Key. Private mode: too many attempts. Private mode without a
                configured OPS_COPILOT_KEY. ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_orders_stats(request_options=request_options))

    async def post_orders_create(
        self,
        body: CreateOrderRequest | CreateOrderRequestDict,
        *,
        idempotency_key: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> CreateOrderResponse:
        """Create an order from items (server re-prices; policy enforced).

        Args:
            body: The items to order. The server re-prices authoritatively and enforces policy.
            idempotency_key: Client key; server hashes it with the session and reuses as PayPal-Request-Id.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Order created

        Raises:
            ApiError: Invalid input (quantity must be a JSON integer 1-100, unknown product, order total above the
                limit). Validated before PayPal configuration is checked. Blocked by policy Rate limit exceeded (policy
                preview 120/min per session and 600/min per IP; order create and capture 30/min per session and 120/min
                per IP). Retry-After header gives the wait in seconds. PayPal not configured, refund status could not be
                verified, or storage is unavailable; no blind retry is sent ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.post_orders_create(
                body, idempotency_key=idempotency_key, request_options=request_options
            ),
        )

    async def post_orders_order_id_cancel(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> Any:
        """Cancel a not-yet-captured checkout.

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Cancelled

        Raises:
            ApiError: Order not found Already captured / capture in progress ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.post_orders_order_id_cancel(order_id, request_options=request_options)
        )

    async def post_orders_order_id_capture(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> Any:
        """Capture the PayPal order (after human approval).

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Captured

        Raises:
            ApiError: Not approved yet / not payable Payment declined Order not found Already captured / in progress
                Rate limit exceeded (policy preview 120/min per session and 600/min per IP; order create and capture
                30/min per session and 120/min per IP). Retry-After header gives the wait in seconds. PayPal transport
                error PayPal not configured ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.post_orders_order_id_capture(order_id, request_options=request_options)
        )

    async def post_webhooks_paypal(self, *, request_options: RequestOptionsOrDict | None = None) -> None:
        """PayPal webhook receiver (signature-verified).

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Processed / duplicate acknowledged

        Raises:
            ApiError: Invalid signature / missing headers ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.post_webhooks_paypal(request_options=request_options))

    @property
    def with_raw_response(self) -> AsyncOrdersWithRawResponse:
        return self._with_raw_response


class OrdersWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def get_checkout_cancel(
        self, token: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[None, GetCheckoutCancelErrorBody]:
        """PayPal cancel redirect.

        Args:
            token: PayPal approval token returned when the order was created.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/checkout/cancel"),
            query_params=[param[str]("token", token)],
            decoder=empty_response,
            error_mapper=get_checkout_cancel_error_mapper,
            request_options=request_options,
        )

    def get_checkout_return(
        self, token: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[None, GetCheckoutReturnErrorBody]:
        """PayPal return redirect.

        Args:
            token: PayPal approval token returned when the order was created.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/checkout/return"),
            query_params=[param[str]("token", token)],
            decoder=empty_response,
            error_mapper=get_checkout_return_error_mapper,
            request_options=request_options,
        )

    def get_orders(
        self,
        *,
        origin: Origin2OrStr | None = None,
        status: str | None = None,
        limit: int | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[OrdersListResponse, GetOrdersErrorBody]:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            origin: Value for the origin parameter.
            status: Value for the status parameter.
            limit: Value for the limit parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/orders"),
            query_params=[
                param[Origin2OrStr | None]("origin", origin),
                param[str | None]("status", status),
                param[int | None]("limit", limit),
            ],
            auth_scheme=self._auth.ops_key,
            decoder=json_decoder[OrdersListResponse],
            error_mapper=get_orders_error_mapper,
            request_options=request_options,
        )

    def get_orders_stats(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[OrdersStats, GetOrdersStatsErrorBody]:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/orders/stats"),
            auth_scheme=self._auth.ops_key,
            decoder=json_decoder[OrdersStats],
            error_mapper=get_orders_stats_error_mapper,
            request_options=request_options,
        )

    def post_orders_create(
        self,
        body: CreateOrderRequest | CreateOrderRequestDict,
        *,
        idempotency_key: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[CreateOrderResponse, PostOrdersCreateErrorBody]:
        """Create an order from items (server re-prices; policy enforced).

        Args:
            body: The items to order. The server re-prices authoritatively and enforces policy.
            idempotency_key: Client key; server hashes it with the session and reuses as PayPal-Request-Id.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/orders/create"),
            headers=[param[str | None]("Idempotency-Key", idempotency_key)],
            body=json_body[CreateOrderRequest | CreateOrderRequestDict](body),
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[CreateOrderResponse],
            error_mapper=post_orders_create_error_mapper,
            request_options=request_options,
        )

    def post_orders_order_id_cancel(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, PostOrdersOrderIdCancelErrorBody]:
        """Cancel a not-yet-captured checkout.

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/orders/{orderId}/cancel"),
            path_params=[param[str]("orderId", order_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[Any],
            error_mapper=post_orders_order_id_cancel_error_mapper,
            request_options=request_options,
        )

    def post_orders_order_id_capture(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, PostOrdersOrderIdCaptureErrorBody]:
        """Capture the PayPal order (after human approval).

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/orders/{orderId}/capture"),
            path_params=[param[str]("orderId", order_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[Any],
            error_mapper=post_orders_order_id_capture_error_mapper,
            request_options=request_options,
        )

    def post_webhooks_paypal(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[None, PostWebhooksPaypalErrorBody]:
        """PayPal webhook receiver (signature-verified).

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/webhooks/paypal"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            decoder=empty_response,
            error_mapper=post_webhooks_paypal_error_mapper,
            request_options=request_options,
        )


class AsyncOrdersWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def get_checkout_cancel(
        self, token: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[None, GetCheckoutCancelErrorBody]:
        """PayPal cancel redirect.

        Args:
            token: PayPal approval token returned when the order was created.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/checkout/cancel"),
            query_params=[param[str]("token", token)],
            decoder=async_empty_response,
            error_mapper=get_checkout_cancel_error_mapper,
            request_options=request_options,
        )

    async def get_checkout_return(
        self, token: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[None, GetCheckoutReturnErrorBody]:
        """PayPal return redirect.

        Args:
            token: PayPal approval token returned when the order was created.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/checkout/return"),
            query_params=[param[str]("token", token)],
            decoder=async_empty_response,
            error_mapper=get_checkout_return_error_mapper,
            request_options=request_options,
        )

    async def get_orders(
        self,
        *,
        origin: Origin2OrStr | None = None,
        status: str | None = None,
        limit: int | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[OrdersListResponse, GetOrdersErrorBody]:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            origin: Value for the origin parameter.
            status: Value for the status parameter.
            limit: Value for the limit parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/orders"),
            query_params=[
                param[Origin2OrStr | None]("origin", origin),
                param[str | None]("status", status),
                param[int | None]("limit", limit),
            ],
            auth_scheme=self._auth.ops_key,
            decoder=async_json_decoder[OrdersListResponse],
            error_mapper=get_orders_error_mapper,
            request_options=request_options,
        )

    async def get_orders_stats(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[OrdersStats, GetOrdersStatsErrorBody]:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/orders/stats"),
            auth_scheme=self._auth.ops_key,
            decoder=async_json_decoder[OrdersStats],
            error_mapper=get_orders_stats_error_mapper,
            request_options=request_options,
        )

    async def post_orders_create(
        self,
        body: CreateOrderRequest | CreateOrderRequestDict,
        *,
        idempotency_key: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[CreateOrderResponse, PostOrdersCreateErrorBody]:
        """Create an order from items (server re-prices; policy enforced).

        Args:
            body: The items to order. The server re-prices authoritatively and enforces policy.
            idempotency_key: Client key; server hashes it with the session and reuses as PayPal-Request-Id.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/orders/create"),
            headers=[param[str | None]("Idempotency-Key", idempotency_key)],
            body=json_body[CreateOrderRequest | CreateOrderRequestDict](body),
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[CreateOrderResponse],
            error_mapper=post_orders_create_error_mapper,
            request_options=request_options,
        )

    async def post_orders_order_id_cancel(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, PostOrdersOrderIdCancelErrorBody]:
        """Cancel a not-yet-captured checkout.

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/orders/{orderId}/cancel"),
            path_params=[param[str]("orderId", order_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[Any],
            error_mapper=post_orders_order_id_cancel_error_mapper,
            request_options=request_options,
        )

    async def post_orders_order_id_capture(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, PostOrdersOrderIdCaptureErrorBody]:
        """Capture the PayPal order (after human approval).

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/orders/{orderId}/capture"),
            path_params=[param[str]("orderId", order_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[Any],
            error_mapper=post_orders_order_id_capture_error_mapper,
            request_options=request_options,
        )

    async def post_webhooks_paypal(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[None, PostWebhooksPaypalErrorBody]:
        """PayPal webhook receiver (signature-verified).

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/webhooks/paypal"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            decoder=async_empty_response,
            error_mapper=post_webhooks_paypal_error_mapper,
            request_options=request_options,
        )

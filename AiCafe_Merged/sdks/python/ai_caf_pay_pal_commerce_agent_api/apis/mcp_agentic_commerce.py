from __future__ import annotations

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
from ..errors.mcp_end_session_error import McpEndSessionErrorBody, mcp_end_session_error_mapper
from ..errors.mcp_rpc_error import McpRpcErrorBody, mcp_rpc_error_mapper
from ..models.mcp_request import McpRequest, McpRequestDict
from ..models.mcp_response import McpResponse
from ..server.server import Server


class McpAgenticCommerce:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = McpAgenticCommerceWithRawResponse(client, server, auth)

    def mcp_end_session(self, mcp_session_id: str, *, request_options: RequestOptionsOrDict | None = None) -> None:
        """End an MCP session.

        Args:
            mcp_session_id: Session header returned by MCP initialize; required for tools/call.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Ended

        Raises:
            ApiError: Unknown session ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.mcp_end_session(mcp_session_id, request_options=request_options))

    def mcp_rpc(
        self,
        body: McpRequest | McpRequestDict,
        *,
        mcp_session_id: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> McpResponse:
        """Tools: ``search_menu``, ``prepare_cart``, ``check_policy``, ``start_checkout``, ``get_order_status``. There
        is deliberately NO capture/pay/refund tool: ``start_checkout`` returns a PayPal sandbox approval URL that a
        human must approve. Call ``initialize`` first and send the returned ``Mcp-Session-Id`` header on every later
        request. A GET on this path returns 405 (the optional SSE stream is not offered).

        Args:
            body: An MCP JSON-RPC 2.0 request (initialize, tools/list, or tools/call).
            mcp_session_id: Returned by ``initialize``.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            JSON-RPC result or error

        Raises:
            ApiError: Origin not allowed Unknown session — send initialize again Rate limit ``error`` is ``Error |
                RawError``."""
        return unwrap(
            self._with_raw_response.mcp_rpc(body, mcp_session_id=mcp_session_id, request_options=request_options)
        )

    @property
    def with_raw_response(self) -> McpAgenticCommerceWithRawResponse:
        return self._with_raw_response


class AsyncMcpAgenticCommerce:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncMcpAgenticCommerceWithRawResponse(client, server, auth)

    async def mcp_end_session(
        self, mcp_session_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> None:
        """End an MCP session.

        Args:
            mcp_session_id: Session header returned by MCP initialize; required for tools/call.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Ended

        Raises:
            ApiError: Unknown session ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.mcp_end_session(mcp_session_id, request_options=request_options))

    async def mcp_rpc(
        self,
        body: McpRequest | McpRequestDict,
        *,
        mcp_session_id: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> McpResponse:
        """Tools: ``search_menu``, ``prepare_cart``, ``check_policy``, ``start_checkout``, ``get_order_status``. There
        is deliberately NO capture/pay/refund tool: ``start_checkout`` returns a PayPal sandbox approval URL that a
        human must approve. Call ``initialize`` first and send the returned ``Mcp-Session-Id`` header on every later
        request. A GET on this path returns 405 (the optional SSE stream is not offered).

        Args:
            body: An MCP JSON-RPC 2.0 request (initialize, tools/list, or tools/call).
            mcp_session_id: Returned by ``initialize``.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            JSON-RPC result or error

        Raises:
            ApiError: Origin not allowed Unknown session — send initialize again Rate limit ``error`` is ``Error |
                RawError``."""
        return unwrap(
            await self._with_raw_response.mcp_rpc(body, mcp_session_id=mcp_session_id, request_options=request_options)
        )

    @property
    def with_raw_response(self) -> AsyncMcpAgenticCommerceWithRawResponse:
        return self._with_raw_response


class McpAgenticCommerceWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def mcp_end_session(
        self, mcp_session_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[None, McpEndSessionErrorBody]:
        """End an MCP session.

        Args:
            mcp_session_id: Session header returned by MCP initialize; required for tools/call.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="DELETE",
            url_template=self._server.default("/api/mcp"),
            headers=[param[str]("Mcp-Session-Id", mcp_session_id), param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=empty_response,
            error_mapper=mcp_end_session_error_mapper,
            request_options=request_options,
        )

    def mcp_rpc(
        self,
        body: McpRequest | McpRequestDict,
        *,
        mcp_session_id: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[McpResponse, McpRpcErrorBody]:
        """Tools: ``search_menu``, ``prepare_cart``, ``check_policy``, ``start_checkout``, ``get_order_status``. There
        is deliberately NO capture/pay/refund tool: ``start_checkout`` returns a PayPal sandbox approval URL that a
        human must approve. Call ``initialize`` first and send the returned ``Mcp-Session-Id`` header on every later
        request. A GET on this path returns 405 (the optional SSE stream is not offered).

        Args:
            body: An MCP JSON-RPC 2.0 request (initialize, tools/list, or tools/call).
            mcp_session_id: Returned by ``initialize``.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/mcp"),
            headers=[param[str | None]("Mcp-Session-Id", mcp_session_id), param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[McpRequest | McpRequestDict](body),
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[McpResponse],
            error_mapper=mcp_rpc_error_mapper,
            request_options=request_options,
        )


class AsyncMcpAgenticCommerceWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def mcp_end_session(
        self, mcp_session_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[None, McpEndSessionErrorBody]:
        """End an MCP session.

        Args:
            mcp_session_id: Session header returned by MCP initialize; required for tools/call.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="DELETE",
            url_template=self._server.default("/api/mcp"),
            headers=[param[str]("Mcp-Session-Id", mcp_session_id), param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_empty_response,
            error_mapper=mcp_end_session_error_mapper,
            request_options=request_options,
        )

    async def mcp_rpc(
        self,
        body: McpRequest | McpRequestDict,
        *,
        mcp_session_id: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[McpResponse, McpRpcErrorBody]:
        """Tools: ``search_menu``, ``prepare_cart``, ``check_policy``, ``start_checkout``, ``get_order_status``. There
        is deliberately NO capture/pay/refund tool: ``start_checkout`` returns a PayPal sandbox approval URL that a
        human must approve. Call ``initialize`` first and send the returned ``Mcp-Session-Id`` header on every later
        request. A GET on this path returns 405 (the optional SSE stream is not offered).

        Args:
            body: An MCP JSON-RPC 2.0 request (initialize, tools/list, or tools/call).
            mcp_session_id: Returned by ``initialize``.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/mcp"),
            headers=[param[str | None]("Mcp-Session-Id", mcp_session_id), param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[McpRequest | McpRequestDict](body),
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[McpResponse],
            error_mapper=mcp_rpc_error_mapper,
            request_options=request_options,
        )

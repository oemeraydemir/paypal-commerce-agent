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
    async_json_decoder,
    json_body,
    json_decoder,
    param,
    unwrap,
)
from ..errors.get_ops_status_error import GetOpsStatusErrorBody, get_ops_status_error_mapper
from ..errors.post_ops_ask_error import PostOpsAskErrorBody, post_ops_ask_error_mapper
from ..models.ops_ask_request import OpsAskRequest, OpsAskRequestDict
from ..models.ops_status import OpsStatus
from ..server.server import Server


class OpsCopilot:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = OpsCopilotWithRawResponse(client, server, auth)

    def get_ops_status(self, *, request_options: RequestOptionsOrDict | None = None) -> OpsStatus:
        """Ops Copilot capability status.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Status

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_ops_status(request_options=request_options))

    def post_ops_ask(
        self,
        body: OpsAskRequest | OpsAskRequestDict,
        *,
        x_ops_key: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> Any:
        """Ask the merchant copilot (read-only PayPal access; may only propose refunds).

        Args:
            body: A natural-language question for the merchant Copilot (read-only; may only propose refunds).
            x_ops_key: Required when Ops Copilot is enabled.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Answer (read-only)

        Raises:
            ApiError: Missing/invalid X-Ops-Key Rate limited Ops Copilot disabled ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.post_ops_ask(body, x_ops_key=x_ops_key, request_options=request_options))

    @property
    def with_raw_response(self) -> OpsCopilotWithRawResponse:
        return self._with_raw_response


class AsyncOpsCopilot:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncOpsCopilotWithRawResponse(client, server, auth)

    async def get_ops_status(self, *, request_options: RequestOptionsOrDict | None = None) -> OpsStatus:
        """Ops Copilot capability status.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Status

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_ops_status(request_options=request_options))

    async def post_ops_ask(
        self,
        body: OpsAskRequest | OpsAskRequestDict,
        *,
        x_ops_key: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> Any:
        """Ask the merchant copilot (read-only PayPal access; may only propose refunds).

        Args:
            body: A natural-language question for the merchant Copilot (read-only; may only propose refunds).
            x_ops_key: Required when Ops Copilot is enabled.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Answer (read-only)

        Raises:
            ApiError: Missing/invalid X-Ops-Key Rate limited Ops Copilot disabled ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.post_ops_ask(body, x_ops_key=x_ops_key, request_options=request_options)
        )

    @property
    def with_raw_response(self) -> AsyncOpsCopilotWithRawResponse:
        return self._with_raw_response


class OpsCopilotWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def get_ops_status(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[OpsStatus, GetOpsStatusErrorBody]:
        """Ops Copilot capability status.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/ops/status"),
            decoder=json_decoder[OpsStatus],
            error_mapper=get_ops_status_error_mapper,
            request_options=request_options,
        )

    def post_ops_ask(
        self,
        body: OpsAskRequest | OpsAskRequestDict,
        *,
        x_ops_key: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[Any, PostOpsAskErrorBody]:
        """Ask the merchant copilot (read-only PayPal access; may only propose refunds).

        Args:
            body: A natural-language question for the merchant Copilot (read-only; may only propose refunds).
            x_ops_key: Required when Ops Copilot is enabled.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/ops/ask"),
            headers=[param[str | None]("X-Ops-Key", x_ops_key), param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[OpsAskRequest | OpsAskRequestDict](body),
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[Any],
            error_mapper=post_ops_ask_error_mapper,
            request_options=request_options,
        )


class AsyncOpsCopilotWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def get_ops_status(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[OpsStatus, GetOpsStatusErrorBody]:
        """Ops Copilot capability status.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/ops/status"),
            decoder=async_json_decoder[OpsStatus],
            error_mapper=get_ops_status_error_mapper,
            request_options=request_options,
        )

    async def post_ops_ask(
        self,
        body: OpsAskRequest | OpsAskRequestDict,
        *,
        x_ops_key: str | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[Any, PostOpsAskErrorBody]:
        """Ask the merchant copilot (read-only PayPal access; may only propose refunds).

        Args:
            body: A natural-language question for the merchant Copilot (read-only; may only propose refunds).
            x_ops_key: Required when Ops Copilot is enabled.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/ops/ask"),
            headers=[param[str | None]("X-Ops-Key", x_ops_key), param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[OpsAskRequest | OpsAskRequestDict](body),
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[Any],
            error_mapper=post_ops_ask_error_mapper,
            request_options=request_options,
        )

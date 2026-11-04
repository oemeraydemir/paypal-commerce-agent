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
    json_decoder,
    param,
    unwrap,
)
from ..errors.delete_sessions_current_error import DeleteSessionsCurrentErrorBody, delete_sessions_current_error_mapper
from ..errors.get_health_error import GetHealthErrorBody, get_health_error_mapper
from ..errors.post_sessions_error import PostSessionsErrorBody, post_sessions_error_mapper
from ..models.issued_session import IssuedSession
from ..server.server import Server


class Sessions:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = SessionsWithRawResponse(client, server, auth)

    def delete_sessions_current(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """End the current session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Session ended

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.delete_sessions_current(request_options=request_options))

    def get_health(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Health and readiness check.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Configured but unusable mandate key: status "misconfigured" with mandates.error (no key material)
                ``error`` is ``Any | RawError``."""
        return unwrap(self._with_raw_response.get_health(request_options=request_options))

    def post_sessions(self, *, request_options: RequestOptionsOrDict | None = None) -> IssuedSession:
        """Mint a server-side session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Session issued

        Raises:
            ApiError: Per-IP session rate limit reached ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.post_sessions(request_options=request_options))

    @property
    def with_raw_response(self) -> SessionsWithRawResponse:
        return self._with_raw_response


class AsyncSessions:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncSessionsWithRawResponse(client, server, auth)

    async def delete_sessions_current(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """End the current session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Session ended

        Raises:
            ApiError: Client error ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.delete_sessions_current(request_options=request_options))

    async def get_health(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Health and readiness check.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Configured but unusable mandate key: status "misconfigured" with mandates.error (no key material)
                ``error`` is ``Any | RawError``."""
        return unwrap(await self._with_raw_response.get_health(request_options=request_options))

    async def post_sessions(self, *, request_options: RequestOptionsOrDict | None = None) -> IssuedSession:
        """Mint a server-side session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Session issued

        Raises:
            ApiError: Per-IP session rate limit reached ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.post_sessions(request_options=request_options))

    @property
    def with_raw_response(self) -> AsyncSessionsWithRawResponse:
        return self._with_raw_response


class SessionsWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def delete_sessions_current(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, DeleteSessionsCurrentErrorBody]:
        """End the current session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="DELETE",
            url_template=self._server.default("/api/sessions/current"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[Any],
            error_mapper=delete_sessions_current_error_mapper,
            request_options=request_options,
        )

    def get_health(self, *, request_options: RequestOptionsOrDict | None = None) -> ApiResult[Any, GetHealthErrorBody]:
        """Health and readiness check.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/health"),
            decoder=json_decoder[Any],
            error_mapper=get_health_error_mapper,
            request_options=request_options,
        )

    def post_sessions(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[IssuedSession, PostSessionsErrorBody]:
        """Mint a server-side session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/sessions"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            decoder=json_decoder[IssuedSession],
            error_mapper=post_sessions_error_mapper,
            request_options=request_options,
        )


class AsyncSessionsWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def delete_sessions_current(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, DeleteSessionsCurrentErrorBody]:
        """End the current session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="DELETE",
            url_template=self._server.default("/api/sessions/current"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[Any],
            error_mapper=delete_sessions_current_error_mapper,
            request_options=request_options,
        )

    async def get_health(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, GetHealthErrorBody]:
        """Health and readiness check.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/health"),
            decoder=async_json_decoder[Any],
            error_mapper=get_health_error_mapper,
            request_options=request_options,
        )

    async def post_sessions(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[IssuedSession, PostSessionsErrorBody]:
        """Mint a server-side session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/sessions"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            decoder=async_json_decoder[IssuedSession],
            error_mapper=post_sessions_error_mapper,
            request_options=request_options,
        )

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
from ..errors.delete_ai_cart_session_id_error import (
    DeleteAiCartSessionIdErrorBody,
    delete_ai_cart_session_id_error_mapper,
)
from ..errors.delete_ai_chat_session_id_error import (
    DeleteAiChatSessionIdErrorBody,
    delete_ai_chat_session_id_error_mapper,
)
from ..errors.post_ai_chat_error import PostAiChatErrorBody, post_ai_chat_error_mapper
from ..models.ai_chat_request import AiChatRequest, AiChatRequestDict
from ..models.ai_chat_response import AiChatResponse
from ..server.server import Server


class AiAgent:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = AiAgentWithRawResponse(client, server, auth)

    def delete_ai_cart_session_id(self, session_id: str, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Clear the AI-prepared cart for this session.

        Args:
            session_id: Value for the sessionId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Cleared

        Raises:
            ApiError: Not your session ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.delete_ai_cart_session_id(session_id, request_options=request_options))

    def delete_ai_chat_session_id(self, session_id: str, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Clear conversation history for this session.

        Args:
            session_id: Value for the sessionId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Cleared

        Raises:
            ApiError: Not your session ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.delete_ai_chat_session_id(session_id, request_options=request_options))

    def post_ai_chat(
        self, body: AiChatRequest | AiChatRequestDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> AiChatResponse:
        """Chat with the shopping agent (builds a cart).

        Args:
            body: The user's chat message plus optional shopper preferences used to prepare a cart.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Agent reply + prepared cart

        Raises:
            ApiError: Invalid input AI rate limit AI provider not configured ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.post_ai_chat(body, request_options=request_options))

    @property
    def with_raw_response(self) -> AiAgentWithRawResponse:
        return self._with_raw_response


class AsyncAiAgent:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncAiAgentWithRawResponse(client, server, auth)

    async def delete_ai_cart_session_id(
        self, session_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> Any:
        """Clear the AI-prepared cart for this session.

        Args:
            session_id: Value for the sessionId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Cleared

        Raises:
            ApiError: Not your session ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.delete_ai_cart_session_id(session_id, request_options=request_options)
        )

    async def delete_ai_chat_session_id(
        self, session_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> Any:
        """Clear conversation history for this session.

        Args:
            session_id: Value for the sessionId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Cleared

        Raises:
            ApiError: Not your session ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.delete_ai_chat_session_id(session_id, request_options=request_options)
        )

    async def post_ai_chat(
        self, body: AiChatRequest | AiChatRequestDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> AiChatResponse:
        """Chat with the shopping agent (builds a cart).

        Args:
            body: The user's chat message plus optional shopper preferences used to prepare a cart.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Agent reply + prepared cart

        Raises:
            ApiError: Invalid input AI rate limit AI provider not configured ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.post_ai_chat(body, request_options=request_options))

    @property
    def with_raw_response(self) -> AsyncAiAgentWithRawResponse:
        return self._with_raw_response


class AiAgentWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def delete_ai_cart_session_id(
        self, session_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, DeleteAiCartSessionIdErrorBody]:
        """Clear the AI-prepared cart for this session.

        Args:
            session_id: Value for the sessionId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="DELETE",
            url_template=self._server.default("/api/ai/cart/{sessionId}"),
            path_params=[param[str]("sessionId", session_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[Any],
            error_mapper=delete_ai_cart_session_id_error_mapper,
            request_options=request_options,
        )

    def delete_ai_chat_session_id(
        self, session_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, DeleteAiChatSessionIdErrorBody]:
        """Clear conversation history for this session.

        Args:
            session_id: Value for the sessionId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="DELETE",
            url_template=self._server.default("/api/ai/chat/{sessionId}"),
            path_params=[param[str]("sessionId", session_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[Any],
            error_mapper=delete_ai_chat_session_id_error_mapper,
            request_options=request_options,
        )

    def post_ai_chat(
        self, body: AiChatRequest | AiChatRequestDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[AiChatResponse, PostAiChatErrorBody]:
        """Chat with the shopping agent (builds a cart).

        Args:
            body: The user's chat message plus optional shopper preferences used to prepare a cart.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/ai/chat"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[AiChatRequest | AiChatRequestDict](body),
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[AiChatResponse],
            error_mapper=post_ai_chat_error_mapper,
            request_options=request_options,
        )


class AsyncAiAgentWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def delete_ai_cart_session_id(
        self, session_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, DeleteAiCartSessionIdErrorBody]:
        """Clear the AI-prepared cart for this session.

        Args:
            session_id: Value for the sessionId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="DELETE",
            url_template=self._server.default("/api/ai/cart/{sessionId}"),
            path_params=[param[str]("sessionId", session_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[Any],
            error_mapper=delete_ai_cart_session_id_error_mapper,
            request_options=request_options,
        )

    async def delete_ai_chat_session_id(
        self, session_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, DeleteAiChatSessionIdErrorBody]:
        """Clear conversation history for this session.

        Args:
            session_id: Value for the sessionId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="DELETE",
            url_template=self._server.default("/api/ai/chat/{sessionId}"),
            path_params=[param[str]("sessionId", session_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[Any],
            error_mapper=delete_ai_chat_session_id_error_mapper,
            request_options=request_options,
        )

    async def post_ai_chat(
        self, body: AiChatRequest | AiChatRequestDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[AiChatResponse, PostAiChatErrorBody]:
        """Chat with the shopping agent (builds a cart).

        Args:
            body: The user's chat message plus optional shopper preferences used to prepare a cart.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/ai/chat"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[AiChatRequest | AiChatRequestDict](body),
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[AiChatResponse],
            error_mapper=post_ai_chat_error_mapper,
            request_options=request_options,
        )

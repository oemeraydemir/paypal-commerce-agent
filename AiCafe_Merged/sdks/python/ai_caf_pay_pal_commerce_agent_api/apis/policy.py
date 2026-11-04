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
    async_json_decoder,
    json_body,
    json_decoder,
    param,
    unwrap,
)
from ..errors.post_policy_preview_error import PostPolicyPreviewErrorBody, post_policy_preview_error_mapper
from ..models.policy_preview_request import PolicyPreviewRequest, PolicyPreviewRequestDict
from ..models.policy_preview_response import PolicyPreviewResponse
from ..server.server import Server


class Policy:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = PolicyWithRawResponse(client, server, auth)

    def post_policy_preview(
        self,
        body: PolicyPreviewRequest | PolicyPreviewRequestDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> PolicyPreviewResponse:
        """Preview the authoritative policy decision for a cart (side-effect free).

        Args:
            body: The cart items whose policy decision should be previewed (side-effect free).
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Preview

        Raises:
            ApiError: Invalid items Rate limit exceeded (policy preview 120/min per session and 600/min per IP; order
                create and capture 30/min per session and 120/min per IP). Retry-After header gives the wait in seconds.
                ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.post_policy_preview(body, request_options=request_options))

    @property
    def with_raw_response(self) -> PolicyWithRawResponse:
        return self._with_raw_response


class AsyncPolicy:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncPolicyWithRawResponse(client, server, auth)

    async def post_policy_preview(
        self,
        body: PolicyPreviewRequest | PolicyPreviewRequestDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> PolicyPreviewResponse:
        """Preview the authoritative policy decision for a cart (side-effect free).

        Args:
            body: The cart items whose policy decision should be previewed (side-effect free).
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Preview

        Raises:
            ApiError: Invalid items Rate limit exceeded (policy preview 120/min per session and 600/min per IP; order
                create and capture 30/min per session and 120/min per IP). Retry-After header gives the wait in seconds.
                ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.post_policy_preview(body, request_options=request_options))

    @property
    def with_raw_response(self) -> AsyncPolicyWithRawResponse:
        return self._with_raw_response


class PolicyWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def post_policy_preview(
        self,
        body: PolicyPreviewRequest | PolicyPreviewRequestDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[PolicyPreviewResponse, PostPolicyPreviewErrorBody]:
        """Preview the authoritative policy decision for a cart (side-effect free).

        Args:
            body: The cart items whose policy decision should be previewed (side-effect free).
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/policy/preview"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[PolicyPreviewRequest | PolicyPreviewRequestDict](body),
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[PolicyPreviewResponse],
            error_mapper=post_policy_preview_error_mapper,
            request_options=request_options,
        )


class AsyncPolicyWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def post_policy_preview(
        self,
        body: PolicyPreviewRequest | PolicyPreviewRequestDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[PolicyPreviewResponse, PostPolicyPreviewErrorBody]:
        """Preview the authoritative policy decision for a cart (side-effect free).

        Args:
            body: The cart items whose policy decision should be previewed (side-effect free).
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/policy/preview"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[PolicyPreviewRequest | PolicyPreviewRequestDict](body),
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[PolicyPreviewResponse],
            error_mapper=post_policy_preview_error_mapper,
            request_options=request_options,
        )

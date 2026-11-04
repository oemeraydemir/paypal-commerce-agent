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
from ..errors.get_order_mandate_error import GetOrderMandateErrorBody, get_order_mandate_error_mapper
from ..errors.post_mandates_verify_error import PostMandatesVerifyErrorBody, post_mandates_verify_error_mapper
from ..models.mandate_verification import MandateVerification
from ..models.signed_cart_mandate import SignedCartMandate, SignedCartMandateDict
from ..server.server import Server


class Mandates:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = MandatesWithRawResponse(client, server, auth)

    def get_order_mandate(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> SignedCartMandate:
        """Ed25519-signed, deterministic record of what the shopper was asked to approve: items, server prices, total,
        origin (HUMAN / AI_AGENT) and the constraints (the agent may not authorize payment; payment authority is the
        buyer's approval at PayPal). Derived from the stored order, so it survives restarts when MANDATE_SIGNING_KEY is
        configured. Another session's order is a 404.

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Signed mandate

        Raises:
            ApiError: Missing or invalid session Order not found Mandate key configuration is invalid (reported, never a
                500) ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_order_mandate(order_id, request_options=request_options))

    def post_mandates_verify(
        self, body: SignedCartMandate | SignedCartMandateDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> MandateVerification:
        """Checks the key id, the Ed25519 signature, the expiry window and, when the order is still known, that the
        mandate still matches it. Expiry is informational: a genuine but expired mandate stays valid.

        Args:
            body: The signed Cart Mandate to verify against the published signing key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Verification result

        Raises:
            ApiError: Mandate key configuration is invalid (reported, never a 500) ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.post_mandates_verify(body, request_options=request_options))

    @property
    def with_raw_response(self) -> MandatesWithRawResponse:
        return self._with_raw_response


class AsyncMandates:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncMandatesWithRawResponse(client, server, auth)

    async def get_order_mandate(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> SignedCartMandate:
        """Ed25519-signed, deterministic record of what the shopper was asked to approve: items, server prices, total,
        origin (HUMAN / AI_AGENT) and the constraints (the agent may not authorize payment; payment authority is the
        buyer's approval at PayPal). Derived from the stored order, so it survives restarts when MANDATE_SIGNING_KEY is
        configured. Another session's order is a 404.

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Signed mandate

        Raises:
            ApiError: Missing or invalid session Order not found Mandate key configuration is invalid (reported, never a
                500) ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_order_mandate(order_id, request_options=request_options))

    async def post_mandates_verify(
        self, body: SignedCartMandate | SignedCartMandateDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> MandateVerification:
        """Checks the key id, the Ed25519 signature, the expiry window and, when the order is still known, that the
        mandate still matches it. Expiry is informational: a genuine but expired mandate stays valid.

        Args:
            body: The signed Cart Mandate to verify against the published signing key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Verification result

        Raises:
            ApiError: Mandate key configuration is invalid (reported, never a 500) ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.post_mandates_verify(body, request_options=request_options))

    @property
    def with_raw_response(self) -> AsyncMandatesWithRawResponse:
        return self._with_raw_response


class MandatesWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def get_order_mandate(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[SignedCartMandate, GetOrderMandateErrorBody]:
        """Ed25519-signed, deterministic record of what the shopper was asked to approve: items, server prices, total,
        origin (HUMAN / AI_AGENT) and the constraints (the agent may not authorize payment; payment authority is the
        buyer's approval at PayPal). Derived from the stored order, so it survives restarts when MANDATE_SIGNING_KEY is
        configured. Another session's order is a 404.

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/orders/{orderId}/mandate"),
            path_params=[param[str]("orderId", order_id)],
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[SignedCartMandate],
            error_mapper=get_order_mandate_error_mapper,
            request_options=request_options,
        )

    def post_mandates_verify(
        self, body: SignedCartMandate | SignedCartMandateDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[MandateVerification, PostMandatesVerifyErrorBody]:
        """Checks the key id, the Ed25519 signature, the expiry window and, when the order is still known, that the
        mandate still matches it. Expiry is informational: a genuine but expired mandate stays valid.

        Args:
            body: The signed Cart Mandate to verify against the published signing key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/mandates/verify"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[SignedCartMandate | SignedCartMandateDict](body),
            decoder=json_decoder[MandateVerification],
            error_mapper=post_mandates_verify_error_mapper,
            request_options=request_options,
        )


class AsyncMandatesWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def get_order_mandate(
        self, order_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[SignedCartMandate, GetOrderMandateErrorBody]:
        """Ed25519-signed, deterministic record of what the shopper was asked to approve: items, server prices, total,
        origin (HUMAN / AI_AGENT) and the constraints (the agent may not authorize payment; payment authority is the
        buyer's approval at PayPal). Derived from the stored order, so it survives restarts when MANDATE_SIGNING_KEY is
        configured. Another session's order is a 404.

        Args:
            order_id: Value for the orderId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/orders/{orderId}/mandate"),
            path_params=[param[str]("orderId", order_id)],
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[SignedCartMandate],
            error_mapper=get_order_mandate_error_mapper,
            request_options=request_options,
        )

    async def post_mandates_verify(
        self, body: SignedCartMandate | SignedCartMandateDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[MandateVerification, PostMandatesVerifyErrorBody]:
        """Checks the key id, the Ed25519 signature, the expiry window and, when the order is still known, that the
        mandate still matches it. Expiry is informational: a genuine but expired mandate stays valid.

        Args:
            body: The signed Cart Mandate to verify against the published signing key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/mandates/verify"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[SignedCartMandate | SignedCartMandateDict](body),
            decoder=async_json_decoder[MandateVerification],
            error_mapper=post_mandates_verify_error_mapper,
            request_options=request_options,
        )

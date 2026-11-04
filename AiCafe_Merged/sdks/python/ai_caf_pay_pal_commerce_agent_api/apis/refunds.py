from __future__ import annotations

from uuid import UUID, uuid4

from ..auth import AsyncAuthSchemes, AuthSchemes
from ..core import (
    ApiResult,
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
from ..errors.approve_refund_error import ApproveRefundErrorBody, approve_refund_error_mapper
from ..errors.list_refunds_error import ListRefundsErrorBody, list_refunds_error_mapper
from ..errors.propose_refund_error import ProposeRefundErrorBody, propose_refund_error_mapper
from ..errors.reject_refund_error import RejectRefundErrorBody, reject_refund_error_mapper
from ..models.api_refunds_response import ApiRefundsResponse
from ..models.propose_refund_request import ProposeRefundRequest, ProposeRefundRequestDict
from ..models.refund_request import RefundRequest
from ..server.server import Server


class Refunds:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = RefundsWithRawResponse(client, server, auth)

    def approve_refund(
        self, id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> RefundRequest:
        """The only endpoint that calls PayPal's refund API. Uses a stable PayPal-Request-Id (``aicafe-refund-<id>``),
        but does not rely on its unverified retention window alone: an ambiguous outcome must be reconciled against the
        PayPal refund or capture before another request.

        Args:
            id_: Value for the id parameter.
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Refunded

        Raises:
            ApiError: Missing/invalid X-Ops-Key Unknown refund request Not in PROPOSED state or PayPal refund status is
                indeterminate PayPal returned a definitive failure or the refund outcome is unknown; request remains
                PROPOSED and is reconciled before retry PayPal not configured ``error`` is ``Error | RefundRequest |
                RawError``."""
        return unwrap(self._with_raw_response.approve_refund(id_, x_ops_key, request_options=request_options))

    def list_refunds(
        self, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiRefundsResponse:
        """List refund requests (newest first).

        Args:
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Refund queue

        Raises:
            ApiError: Missing/invalid X-Ops-Key Rate limited Refund queue disabled (no OPS_COPILOT_KEY) ``error`` is
                ``Error | RawError``."""
        return unwrap(self._with_raw_response.list_refunds(x_ops_key, request_options=request_options))

    def propose_refund(
        self,
        x_ops_key: str,
        body: ProposeRefundRequest | ProposeRefundRequestDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> RefundRequest:
        """Propose a refund (moves no money).

        Args:
            x_ops_key: Merchant key.
            body: Details of the refund request to propose. Proposing moves no money.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Proposed

        Raises:
            ApiError: Invalid input Missing/invalid X-Ops-Key Order not found Order not paid, fully refunded, or already
                has an open request Amount exceeds the refundable amount ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.propose_refund(x_ops_key, body, request_options=request_options))

    def reject_refund(
        self, id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> RefundRequest:
        """Reject a proposed refund.

        Args:
            id_: Value for the id parameter.
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Rejected

        Raises:
            ApiError: Missing/invalid X-Ops-Key Unknown refund request Not in PROPOSED state ``error`` is ``Error |
                RawError``."""
        return unwrap(self._with_raw_response.reject_refund(id_, x_ops_key, request_options=request_options))

    @property
    def with_raw_response(self) -> RefundsWithRawResponse:
        return self._with_raw_response


class AsyncRefunds:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncRefundsWithRawResponse(client, server, auth)

    async def approve_refund(
        self, id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> RefundRequest:
        """The only endpoint that calls PayPal's refund API. Uses a stable PayPal-Request-Id (``aicafe-refund-<id>``),
        but does not rely on its unverified retention window alone: an ambiguous outcome must be reconciled against the
        PayPal refund or capture before another request.

        Args:
            id_: Value for the id parameter.
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Refunded

        Raises:
            ApiError: Missing/invalid X-Ops-Key Unknown refund request Not in PROPOSED state or PayPal refund status is
                indeterminate PayPal returned a definitive failure or the refund outcome is unknown; request remains
                PROPOSED and is reconciled before retry PayPal not configured ``error`` is ``Error | RefundRequest |
                RawError``."""
        return unwrap(await self._with_raw_response.approve_refund(id_, x_ops_key, request_options=request_options))

    async def list_refunds(
        self, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiRefundsResponse:
        """List refund requests (newest first).

        Args:
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Refund queue

        Raises:
            ApiError: Missing/invalid X-Ops-Key Rate limited Refund queue disabled (no OPS_COPILOT_KEY) ``error`` is
                ``Error | RawError``."""
        return unwrap(await self._with_raw_response.list_refunds(x_ops_key, request_options=request_options))

    async def propose_refund(
        self,
        x_ops_key: str,
        body: ProposeRefundRequest | ProposeRefundRequestDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> RefundRequest:
        """Propose a refund (moves no money).

        Args:
            x_ops_key: Merchant key.
            body: Details of the refund request to propose. Proposing moves no money.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Proposed

        Raises:
            ApiError: Invalid input Missing/invalid X-Ops-Key Order not found Order not paid, fully refunded, or already
                has an open request Amount exceeds the refundable amount ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.propose_refund(x_ops_key, body, request_options=request_options))

    async def reject_refund(
        self, id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> RefundRequest:
        """Reject a proposed refund.

        Args:
            id_: Value for the id parameter.
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Rejected

        Raises:
            ApiError: Missing/invalid X-Ops-Key Unknown refund request Not in PROPOSED state ``error`` is ``Error |
                RawError``."""
        return unwrap(await self._with_raw_response.reject_refund(id_, x_ops_key, request_options=request_options))

    @property
    def with_raw_response(self) -> AsyncRefundsWithRawResponse:
        return self._with_raw_response


class RefundsWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def approve_refund(
        self, id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[RefundRequest, ApproveRefundErrorBody]:
        """The only endpoint that calls PayPal's refund API. Uses a stable PayPal-Request-Id (``aicafe-refund-<id>``),
        but does not rely on its unverified retention window alone: an ambiguous outcome must be reconciled against the
        PayPal refund or capture before another request.

        Args:
            id_: Value for the id parameter.
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/refunds/{id}/approve"),
            path_params=[param[str]("id", id_)],
            headers=[param[str]("X-Ops-Key", x_ops_key), param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=self._auth.ops_key,
            decoder=json_decoder[RefundRequest],
            error_mapper=approve_refund_error_mapper,
            request_options=request_options,
        )

    def list_refunds(
        self, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[ApiRefundsResponse, ListRefundsErrorBody]:
        """List refund requests (newest first).

        Args:
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/refunds"),
            headers=[param[str]("X-Ops-Key", x_ops_key)],
            auth_scheme=self._auth.ops_key,
            decoder=json_decoder[ApiRefundsResponse],
            error_mapper=list_refunds_error_mapper,
            request_options=request_options,
        )

    def propose_refund(
        self,
        x_ops_key: str,
        body: ProposeRefundRequest | ProposeRefundRequestDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[RefundRequest, ProposeRefundErrorBody]:
        """Propose a refund (moves no money).

        Args:
            x_ops_key: Merchant key.
            body: Details of the refund request to propose. Proposing moves no money.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/refunds/propose"),
            headers=[param[str]("X-Ops-Key", x_ops_key), param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[ProposeRefundRequest | ProposeRefundRequestDict](body),
            auth_scheme=self._auth.ops_key,
            decoder=json_decoder[RefundRequest],
            error_mapper=propose_refund_error_mapper,
            request_options=request_options,
        )

    def reject_refund(
        self, id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[RefundRequest, RejectRefundErrorBody]:
        """Reject a proposed refund.

        Args:
            id_: Value for the id parameter.
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/refunds/{id}/reject"),
            path_params=[param[str]("id", id_)],
            headers=[param[str]("X-Ops-Key", x_ops_key), param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=self._auth.ops_key,
            decoder=json_decoder[RefundRequest],
            error_mapper=reject_refund_error_mapper,
            request_options=request_options,
        )


class AsyncRefundsWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def approve_refund(
        self, id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[RefundRequest, ApproveRefundErrorBody]:
        """The only endpoint that calls PayPal's refund API. Uses a stable PayPal-Request-Id (``aicafe-refund-<id>``),
        but does not rely on its unverified retention window alone: an ambiguous outcome must be reconciled against the
        PayPal refund or capture before another request.

        Args:
            id_: Value for the id parameter.
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/refunds/{id}/approve"),
            path_params=[param[str]("id", id_)],
            headers=[param[str]("X-Ops-Key", x_ops_key), param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=self._auth.ops_key,
            decoder=async_json_decoder[RefundRequest],
            error_mapper=approve_refund_error_mapper,
            request_options=request_options,
        )

    async def list_refunds(
        self, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[ApiRefundsResponse, ListRefundsErrorBody]:
        """List refund requests (newest first).

        Args:
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/refunds"),
            headers=[param[str]("X-Ops-Key", x_ops_key)],
            auth_scheme=self._auth.ops_key,
            decoder=async_json_decoder[ApiRefundsResponse],
            error_mapper=list_refunds_error_mapper,
            request_options=request_options,
        )

    async def propose_refund(
        self,
        x_ops_key: str,
        body: ProposeRefundRequest | ProposeRefundRequestDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[RefundRequest, ProposeRefundErrorBody]:
        """Propose a refund (moves no money).

        Args:
            x_ops_key: Merchant key.
            body: Details of the refund request to propose. Proposing moves no money.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/refunds/propose"),
            headers=[param[str]("X-Ops-Key", x_ops_key), param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[ProposeRefundRequest | ProposeRefundRequestDict](body),
            auth_scheme=self._auth.ops_key,
            decoder=async_json_decoder[RefundRequest],
            error_mapper=propose_refund_error_mapper,
            request_options=request_options,
        )

    async def reject_refund(
        self, id_: str, x_ops_key: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[RefundRequest, RejectRefundErrorBody]:
        """Reject a proposed refund.

        Args:
            id_: Value for the id parameter.
            x_ops_key: Merchant key.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/refunds/{id}/reject"),
            path_params=[param[str]("id", id_)],
            headers=[param[str]("X-Ops-Key", x_ops_key), param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=self._auth.ops_key,
            decoder=async_json_decoder[RefundRequest],
            error_mapper=reject_refund_error_mapper,
            request_options=request_options,
        )

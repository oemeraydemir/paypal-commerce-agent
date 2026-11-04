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
from ..errors.get_policy_scope_error import GetPolicyScopeErrorBody, get_policy_scope_error_mapper
from ..errors.get_policy_scopes_error import GetPolicyScopesErrorBody, get_policy_scopes_error_mapper
from ..errors.post_policy_preview_error import PostPolicyPreviewErrorBody, post_policy_preview_error_mapper
from ..errors.post_policy_scope_approve_error import (
    PostPolicyScopeApproveErrorBody,
    post_policy_scope_approve_error_mapper,
)
from ..errors.post_policy_scope_revoke_error import (
    PostPolicyScopeRevokeErrorBody,
    post_policy_scope_revoke_error_mapper,
)
from ..errors.post_policy_scopes_error import PostPolicyScopesErrorBody, post_policy_scopes_error_mapper
from ..errors.post_take_home_suggestions_error import (
    PostTakeHomeSuggestionsErrorBody,
    post_take_home_suggestions_error_mapper,
)
from ..models.allowance_scope import AllowanceScope
from ..models.allowance_scope_approve_input import AllowanceScopeApproveInput, AllowanceScopeApproveInputDict
from ..models.allowance_scope_create_input import AllowanceScopeCreateInput, AllowanceScopeCreateInputDict
from ..models.allowance_scope_detail_response import AllowanceScopeDetailResponse
from ..models.allowance_scope_list_response import AllowanceScopeListResponse
from ..models.policy_preview_request import PolicyPreviewRequest, PolicyPreviewRequestDict
from ..models.policy_preview_response import PolicyPreviewResponse
from ..models.take_home_request import TakeHomeRequest, TakeHomeRequestDict
from ..models.take_home_response import TakeHomeResponse
from ..server.server import Server


class Policy:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = PolicyWithRawResponse(client, server, auth)

    def get_policy_scope(
        self, scope_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> AllowanceScopeDetailResponse:
        """Returns the scope plus its event trail. Only the owning session may read it.

        Args:
            scope_id: Value sent with the request.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Scope with audit

        Raises:
            ApiError: Not found Session required ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_policy_scope(scope_id, request_options=request_options))

    def get_policy_scopes(self, *, request_options: RequestOptionsOrDict | None = None) -> AllowanceScopeListResponse:
        """Returns all scopes owned by the authenticated session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Scopes

        Raises:
            ApiError: Bad request Session required ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_policy_scopes(request_options=request_options))

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

    def post_policy_scope_approve(
        self,
        scope_id: str,
        body: AllowanceScopeApproveInput | AllowanceScopeApproveInputDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> AllowanceScope:
        """Activates a PENDING scope, or records a fresh shopper approval for a limit increase. Limits remain capped by
        the global ceiling.

        Args:
            scope_id: Value sent with the request.
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Approved

        Raises:
            ApiError: Not found Session required Conflict Unprocessable (ceiling) ``error`` is ``Error | RawError``."""
        return unwrap(
            self._with_raw_response.post_policy_scope_approve(scope_id, body, request_options=request_options)
        )

    def post_policy_scope_revoke(
        self, scope_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> AllowanceScope:
        """Revokes a scope. Subsequent checkouts bound to it fail closed.

        Args:
            scope_id: Value sent with the request.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Revoked

        Raises:
            ApiError: Not found Session required ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.post_policy_scope_revoke(scope_id, request_options=request_options))

    def post_policy_scopes(
        self,
        body: AllowanceScopeCreateInput | AllowanceScopeCreateInputDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> AllowanceScope:
        """Creates a scope. A HUMAN issuer yields an ACTIVE scope; an AI-prepared session yields a PENDING
        (agent-proposed) scope awaiting shopper approval.

        Args:
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Created

        Raises:
            ApiError: Bad request Session required Unprocessable (currency/ceiling) ``error`` is ``Error |
                RawError``."""
        return unwrap(self._with_raw_response.post_policy_scopes(body, request_options=request_options))

    def post_take_home_suggestions(
        self, body: TakeHomeRequest | TakeHomeRequestDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> TakeHomeResponse:
        """Read-only product discovery through Channel3. The query is built on the server from the catalog category of
        the cart items; no client text is forwarded. Results are outbound retailer links: not part of the PayPal cart,
        not covered by the spending allowance, never paid through this API. Returns enabled=false when no Channel3 key
        is configured.

        Args:
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Suggestions (possibly empty or disabled)

        Raises:
            ApiError: Invalid items Missing or invalid session Rate limited Channel3 unavailable ``error`` is ``Error |
                RawError``."""
        return unwrap(self._with_raw_response.post_take_home_suggestions(body, request_options=request_options))

    @property
    def with_raw_response(self) -> PolicyWithRawResponse:
        return self._with_raw_response


class AsyncPolicy:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncPolicyWithRawResponse(client, server, auth)

    async def get_policy_scope(
        self, scope_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> AllowanceScopeDetailResponse:
        """Returns the scope plus its event trail. Only the owning session may read it.

        Args:
            scope_id: Value sent with the request.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Scope with audit

        Raises:
            ApiError: Not found Session required ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_policy_scope(scope_id, request_options=request_options))

    async def get_policy_scopes(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> AllowanceScopeListResponse:
        """Returns all scopes owned by the authenticated session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Scopes

        Raises:
            ApiError: Bad request Session required ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_policy_scopes(request_options=request_options))

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

    async def post_policy_scope_approve(
        self,
        scope_id: str,
        body: AllowanceScopeApproveInput | AllowanceScopeApproveInputDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> AllowanceScope:
        """Activates a PENDING scope, or records a fresh shopper approval for a limit increase. Limits remain capped by
        the global ceiling.

        Args:
            scope_id: Value sent with the request.
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Approved

        Raises:
            ApiError: Not found Session required Conflict Unprocessable (ceiling) ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.post_policy_scope_approve(scope_id, body, request_options=request_options)
        )

    async def post_policy_scope_revoke(
        self, scope_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> AllowanceScope:
        """Revokes a scope. Subsequent checkouts bound to it fail closed.

        Args:
            scope_id: Value sent with the request.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Revoked

        Raises:
            ApiError: Not found Session required ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.post_policy_scope_revoke(scope_id, request_options=request_options))

    async def post_policy_scopes(
        self,
        body: AllowanceScopeCreateInput | AllowanceScopeCreateInputDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> AllowanceScope:
        """Creates a scope. A HUMAN issuer yields an ACTIVE scope; an AI-prepared session yields a PENDING
        (agent-proposed) scope awaiting shopper approval.

        Args:
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Created

        Raises:
            ApiError: Bad request Session required Unprocessable (currency/ceiling) ``error`` is ``Error |
                RawError``."""
        return unwrap(await self._with_raw_response.post_policy_scopes(body, request_options=request_options))

    async def post_take_home_suggestions(
        self, body: TakeHomeRequest | TakeHomeRequestDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> TakeHomeResponse:
        """Read-only product discovery through Channel3. The query is built on the server from the catalog category of
        the cart items; no client text is forwarded. Results are outbound retailer links: not part of the PayPal cart,
        not covered by the spending allowance, never paid through this API. Returns enabled=false when no Channel3 key
        is configured.

        Args:
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Suggestions (possibly empty or disabled)

        Raises:
            ApiError: Invalid items Missing or invalid session Rate limited Channel3 unavailable ``error`` is ``Error |
                RawError``."""
        return unwrap(await self._with_raw_response.post_take_home_suggestions(body, request_options=request_options))

    @property
    def with_raw_response(self) -> AsyncPolicyWithRawResponse:
        return self._with_raw_response


class PolicyWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def get_policy_scope(
        self, scope_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[AllowanceScopeDetailResponse, GetPolicyScopeErrorBody]:
        """Returns the scope plus its event trail. Only the owning session may read it.

        Args:
            scope_id: Value sent with the request.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/policy/scopes/{scopeId}"),
            path_params=[param[str]("scopeId", scope_id)],
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[AllowanceScopeDetailResponse],
            error_mapper=get_policy_scope_error_mapper,
            request_options=request_options,
        )

    def get_policy_scopes(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[AllowanceScopeListResponse, GetPolicyScopesErrorBody]:
        """Returns all scopes owned by the authenticated session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/policy/scopes"),
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[AllowanceScopeListResponse],
            error_mapper=get_policy_scopes_error_mapper,
            request_options=request_options,
        )

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

    def post_policy_scope_approve(
        self,
        scope_id: str,
        body: AllowanceScopeApproveInput | AllowanceScopeApproveInputDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[AllowanceScope, PostPolicyScopeApproveErrorBody]:
        """Activates a PENDING scope, or records a fresh shopper approval for a limit increase. Limits remain capped by
        the global ceiling.

        Args:
            scope_id: Value sent with the request.
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/policy/scopes/{scopeId}/approve"),
            path_params=[param[str]("scopeId", scope_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[AllowanceScopeApproveInput | AllowanceScopeApproveInputDict](body),
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[AllowanceScope],
            error_mapper=post_policy_scope_approve_error_mapper,
            request_options=request_options,
        )

    def post_policy_scope_revoke(
        self, scope_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[AllowanceScope, PostPolicyScopeRevokeErrorBody]:
        """Revokes a scope. Subsequent checkouts bound to it fail closed.

        Args:
            scope_id: Value sent with the request.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/policy/scopes/{scopeId}/revoke"),
            path_params=[param[str]("scopeId", scope_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[AllowanceScope],
            error_mapper=post_policy_scope_revoke_error_mapper,
            request_options=request_options,
        )

    def post_policy_scopes(
        self,
        body: AllowanceScopeCreateInput | AllowanceScopeCreateInputDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[AllowanceScope, PostPolicyScopesErrorBody]:
        """Creates a scope. A HUMAN issuer yields an ACTIVE scope; an AI-prepared session yields a PENDING
        (agent-proposed) scope awaiting shopper approval.

        Args:
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/policy/scopes"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[AllowanceScopeCreateInput | AllowanceScopeCreateInputDict](body),
            auth_scheme=AllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=json_decoder[AllowanceScope],
            error_mapper=post_policy_scopes_error_mapper,
            request_options=request_options,
        )

    def post_take_home_suggestions(
        self, body: TakeHomeRequest | TakeHomeRequestDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[TakeHomeResponse, PostTakeHomeSuggestionsErrorBody]:
        """Read-only product discovery through Channel3. The query is built on the server from the catalog category of
        the cart items; no client text is forwarded. Results are outbound retailer links: not part of the PayPal cart,
        not covered by the spending allowance, never paid through this API. Returns enabled=false when no Channel3 key
        is configured.

        Args:
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/discover/take-home"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[TakeHomeRequest | TakeHomeRequestDict](body),
            decoder=json_decoder[TakeHomeResponse],
            error_mapper=post_take_home_suggestions_error_mapper,
            request_options=request_options,
        )


class AsyncPolicyWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def get_policy_scope(
        self, scope_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[AllowanceScopeDetailResponse, GetPolicyScopeErrorBody]:
        """Returns the scope plus its event trail. Only the owning session may read it.

        Args:
            scope_id: Value sent with the request.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/policy/scopes/{scopeId}"),
            path_params=[param[str]("scopeId", scope_id)],
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[AllowanceScopeDetailResponse],
            error_mapper=get_policy_scope_error_mapper,
            request_options=request_options,
        )

    async def get_policy_scopes(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[AllowanceScopeListResponse, GetPolicyScopesErrorBody]:
        """Returns all scopes owned by the authenticated session.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/policy/scopes"),
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[AllowanceScopeListResponse],
            error_mapper=get_policy_scopes_error_mapper,
            request_options=request_options,
        )

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

    async def post_policy_scope_approve(
        self,
        scope_id: str,
        body: AllowanceScopeApproveInput | AllowanceScopeApproveInputDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[AllowanceScope, PostPolicyScopeApproveErrorBody]:
        """Activates a PENDING scope, or records a fresh shopper approval for a limit increase. Limits remain capped by
        the global ceiling.

        Args:
            scope_id: Value sent with the request.
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/policy/scopes/{scopeId}/approve"),
            path_params=[param[str]("scopeId", scope_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[AllowanceScopeApproveInput | AllowanceScopeApproveInputDict](body),
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[AllowanceScope],
            error_mapper=post_policy_scope_approve_error_mapper,
            request_options=request_options,
        )

    async def post_policy_scope_revoke(
        self, scope_id: str, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[AllowanceScope, PostPolicyScopeRevokeErrorBody]:
        """Revokes a scope. Subsequent checkouts bound to it fail closed.

        Args:
            scope_id: Value sent with the request.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/policy/scopes/{scopeId}/revoke"),
            path_params=[param[str]("scopeId", scope_id)],
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[AllowanceScope],
            error_mapper=post_policy_scope_revoke_error_mapper,
            request_options=request_options,
        )

    async def post_policy_scopes(
        self,
        body: AllowanceScopeCreateInput | AllowanceScopeCreateInputDict,
        *,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[AllowanceScope, PostPolicyScopesErrorBody]:
        """Creates a scope. A HUMAN issuer yields an ACTIVE scope; an AI-prepared session yields a PENDING
        (agent-proposed) scope awaiting shopper approval.

        Args:
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/policy/scopes"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[AllowanceScopeCreateInput | AllowanceScopeCreateInputDict](body),
            auth_scheme=AsyncAllSchemes(self._auth.session_id, self._auth.bearer_auth),
            decoder=async_json_decoder[AllowanceScope],
            error_mapper=post_policy_scopes_error_mapper,
            request_options=request_options,
        )

    async def post_take_home_suggestions(
        self, body: TakeHomeRequest | TakeHomeRequestDict, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[TakeHomeResponse, PostTakeHomeSuggestionsErrorBody]:
        """Read-only product discovery through Channel3. The query is built on the server from the catalog category of
        the cart items; no client text is forwarded. Results are outbound retailer links: not part of the PayPal cart,
        not covered by the spending allowance, never paid through this API. Returns enabled=false when no Channel3 key
        is configured.

        Args:
            body: The request body.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="POST",
            url_template=self._server.default("/api/discover/take-home"),
            headers=[param[UUID]("Idempotency-Key", uuid4())],
            body=json_body[TakeHomeRequest | TakeHomeRequestDict](body),
            decoder=async_json_decoder[TakeHomeResponse],
            error_mapper=post_take_home_suggestions_error_mapper,
            request_options=request_options,
        )

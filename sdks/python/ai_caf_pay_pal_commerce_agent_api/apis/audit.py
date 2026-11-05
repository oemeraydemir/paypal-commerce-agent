from __future__ import annotations

from ..auth import AsyncAuthSchemes, AuthSchemes
from ..core import (
    ApiResult,
    AsyncRawClient,
    RawClient,
    RequestOptionsOrDict,
    SecuredRawResponse,
    async_json_decoder,
    json_decoder,
    param,
    unwrap,
)
from ..errors.get_policy_events_error import GetPolicyEventsErrorBody, get_policy_events_error_mapper
from ..errors.get_policy_events_stats_error import GetPolicyEventsStatsErrorBody, get_policy_events_stats_error_mapper
from ..models.enums.policy_decision import PolicyDecisionOrStr
from ..models.policy_events_response import PolicyEventsResponse
from ..models.policy_events_stats import PolicyEventsStats
from ..server.server import Server


class Audit:
    def __init__(self, client: RawClient, server: Server, auth: AuthSchemes) -> None:
        self._with_raw_response = AuditWithRawResponse(client, server, auth)

    def get_policy_events(
        self,
        *,
        decision: PolicyDecisionOrStr | None = None,
        user_id: str | None = None,
        limit: int | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> PolicyEventsResponse:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            decision: Value for the decision parameter.
            user_id: Value for the userId parameter.
            limit: Value for the limit parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Events

        Raises:
            ApiError: Invalid decision/limit Private mode: missing or wrong X-Ops-Key. Private mode: too many attempts.
                Private mode without a configured OPS_COPILOT_KEY. ``error`` is ``Error | RawError``."""
        return unwrap(
            self._with_raw_response.get_policy_events(
                decision=decision, user_id=user_id, limit=limit, request_options=request_options
            ),
        )

    def get_policy_events_stats(
        self, *, user_id: str | None = None, request_options: RequestOptionsOrDict | None = None
    ) -> PolicyEventsStats:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            user_id: Value for the userId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Stats

        Raises:
            ApiError: Private mode: missing or wrong X-Ops-Key. Private mode: too many attempts. Private mode without a
                configured OPS_COPILOT_KEY. ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_policy_events_stats(user_id=user_id, request_options=request_options))

    @property
    def with_raw_response(self) -> AuditWithRawResponse:
        return self._with_raw_response


class AsyncAudit:
    def __init__(self, client: AsyncRawClient, server: Server, auth: AsyncAuthSchemes) -> None:
        self._with_raw_response = AsyncAuditWithRawResponse(client, server, auth)

    async def get_policy_events(
        self,
        *,
        decision: PolicyDecisionOrStr | None = None,
        user_id: str | None = None,
        limit: int | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> PolicyEventsResponse:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            decision: Value for the decision parameter.
            user_id: Value for the userId parameter.
            limit: Value for the limit parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Events

        Raises:
            ApiError: Invalid decision/limit Private mode: missing or wrong X-Ops-Key. Private mode: too many attempts.
                Private mode without a configured OPS_COPILOT_KEY. ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.get_policy_events(
                decision=decision, user_id=user_id, limit=limit, request_options=request_options
            ),
        )

    async def get_policy_events_stats(
        self, *, user_id: str | None = None, request_options: RequestOptionsOrDict | None = None
    ) -> PolicyEventsStats:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            user_id: Value for the userId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            Stats

        Raises:
            ApiError: Private mode: missing or wrong X-Ops-Key. Private mode: too many attempts. Private mode without a
                configured OPS_COPILOT_KEY. ``error`` is ``Error | RawError``."""
        return unwrap(
            await self._with_raw_response.get_policy_events_stats(user_id=user_id, request_options=request_options)
        )

    @property
    def with_raw_response(self) -> AsyncAuditWithRawResponse:
        return self._with_raw_response


class AuditWithRawResponse(SecuredRawResponse[RawClient, Server, AuthSchemes]):
    def get_policy_events(
        self,
        *,
        decision: PolicyDecisionOrStr | None = None,
        user_id: str | None = None,
        limit: int | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[PolicyEventsResponse, GetPolicyEventsErrorBody]:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            decision: Value for the decision parameter.
            user_id: Value for the userId parameter.
            limit: Value for the limit parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/policy-events"),
            query_params=[
                param[PolicyDecisionOrStr | None]("decision", decision),
                param[str | None]("userId", user_id),
                param[int | None]("limit", limit),
            ],
            auth_scheme=self._auth.ops_key,
            decoder=json_decoder[PolicyEventsResponse],
            error_mapper=get_policy_events_error_mapper,
            request_options=request_options,
        )

    def get_policy_events_stats(
        self, *, user_id: str | None = None, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[PolicyEventsStats, GetPolicyEventsStatsErrorBody]:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            user_id: Value for the userId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/policy-events/stats"),
            query_params=[param[str | None]("userId", user_id)],
            auth_scheme=self._auth.ops_key,
            decoder=json_decoder[PolicyEventsStats],
            error_mapper=get_policy_events_stats_error_mapper,
            request_options=request_options,
        )


class AsyncAuditWithRawResponse(SecuredRawResponse[AsyncRawClient, Server, AsyncAuthSchemes]):
    async def get_policy_events(
        self,
        *,
        decision: PolicyDecisionOrStr | None = None,
        user_id: str | None = None,
        limit: int | None = None,
        request_options: RequestOptionsOrDict | None = None,
    ) -> ApiResult[PolicyEventsResponse, GetPolicyEventsErrorBody]:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            decision: Value for the decision parameter.
            user_id: Value for the userId parameter.
            limit: Value for the limit parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/policy-events"),
            query_params=[
                param[PolicyDecisionOrStr | None]("decision", decision),
                param[str | None]("userId", user_id),
                param[int | None]("limit", limit),
            ],
            auth_scheme=self._auth.ops_key,
            decoder=async_json_decoder[PolicyEventsResponse],
            error_mapper=get_policy_events_error_mapper,
            request_options=request_options,
        )

    async def get_policy_events_stats(
        self, *, user_id: str | None = None, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[PolicyEventsStats, GetPolicyEventsStatsErrorBody]:
        """Only when the server runs with DASHBOARD_PUBLIC=false: a valid X-Ops-Key is required (401 without it, 503 if
        no OPS_COPILOT_KEY is configured, 429 when guessing). With the default DASHBOARD_PUBLIC=true the route is open
        and returns a minimised view.

        Args:
            user_id: Value for the userId parameter.
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/policy-events/stats"),
            query_params=[param[str | None]("userId", user_id)],
            auth_scheme=self._auth.ops_key,
            decoder=async_json_decoder[PolicyEventsStats],
            error_mapper=get_policy_events_stats_error_mapper,
            request_options=request_options,
        )

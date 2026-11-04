from __future__ import annotations

from typing import Any

from ..core import (
    ApiResult,
    AsyncRawClient,
    BaseRawResponse,
    RawClient,
    RequestOptionsOrDict,
    async_json_decoder,
    async_text_decoder,
    json_decoder,
    text_decoder,
    unwrap,
)
from ..errors.get_agent_card_error import GetAgentCardErrorBody, get_agent_card_error_mapper
from ..errors.get_agent_commerce_manifest_error import (
    GetAgentCommerceManifestErrorBody,
    get_agent_commerce_manifest_error_mapper,
)
from ..errors.get_feed_products_error import GetFeedProductsErrorBody, get_feed_products_error_mapper
from ..errors.get_llms_txt_error import GetLlmsTxtErrorBody, get_llms_txt_error_mapper
from ..errors.get_mandate_keys_error import GetMandateKeysErrorBody, get_mandate_keys_error_mapper
from ..server.server import Server


class AgentDiscovery:
    def __init__(self, client: RawClient, server: Server) -> None:
        self._with_raw_response = AgentDiscoveryWithRawResponse(client, server)

    def get_agent_card(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Compact card generated from /.well-known/agent-commerce.json; cannot disagree with it.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Public base URL is not configured (production without PUBLIC_BASE_URL) or is unusable ``error`` is
                ``Any | RawError``."""
        return unwrap(self._with_raw_response.get_agent_card(request_options=request_options))

    def get_agent_commerce_manifest(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Single source of truth for AI agents: merchant, endpoints, MCP tool names (derived from the real MCP
        registry), guardrails (agentCanPay/Capture/Refund = false), policy limits, Cart Mandate verification info and
        disclaimers. Custom aicafe.* format; not an official PayPal Agent Ready, Store Sync or AP2 integration. URLs
        come from PUBLIC_BASE_URL (required in production); public cache only when it is configured.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Public base URL is not configured (production without PUBLIC_BASE_URL) or is unusable ``error`` is
                ``Any | RawError``."""
        return unwrap(self._with_raw_response.get_agent_commerce_manifest(request_options=request_options))

    def get_feed_products(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Custom schema.org-style JSON-LD ItemList of Product/Offer entries with server catalog prices (price decimal
        string, additionalProperty priceMinor/dietary). Not an official PayPal Store Sync feed. Read-only,
        ETag-revalidatable.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Public base URL is not configured (production without PUBLIC_BASE_URL) or is unusable ``error`` is
                ``Any | RawError``."""
        return unwrap(self._with_raw_response.get_feed_products(request_options=request_options))

    def get_llms_txt(self, *, request_options: RequestOptionsOrDict | None = None) -> str:
        """Plain-text summary generated from /.well-known/agent-commerce.json.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Public base URL is not configured (production without PUBLIC_BASE_URL) or is unusable ``error`` is
                ``Any | RawError``."""
        return unwrap(self._with_raw_response.get_llms_txt(request_options=request_options))

    def get_mandate_keys(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Active and previous Ed25519 PUBLIC keys (status: active|previous), keyPersistence (configured|ephemeral) and
        the canonicalization label. 503 if the key configuration is invalid.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            JWK set

        Raises:
            ApiError: Mandate key configuration is invalid (reported, never a 500) ``error`` is ``Error | RawError``."""
        return unwrap(self._with_raw_response.get_mandate_keys(request_options=request_options))

    @property
    def with_raw_response(self) -> AgentDiscoveryWithRawResponse:
        return self._with_raw_response


class AsyncAgentDiscovery:
    def __init__(self, client: AsyncRawClient, server: Server) -> None:
        self._with_raw_response = AsyncAgentDiscoveryWithRawResponse(client, server)

    async def get_agent_card(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Compact card generated from /.well-known/agent-commerce.json; cannot disagree with it.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Public base URL is not configured (production without PUBLIC_BASE_URL) or is unusable ``error`` is
                ``Any | RawError``."""
        return unwrap(await self._with_raw_response.get_agent_card(request_options=request_options))

    async def get_agent_commerce_manifest(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Single source of truth for AI agents: merchant, endpoints, MCP tool names (derived from the real MCP
        registry), guardrails (agentCanPay/Capture/Refund = false), policy limits, Cart Mandate verification info and
        disclaimers. Custom aicafe.* format; not an official PayPal Agent Ready, Store Sync or AP2 integration. URLs
        come from PUBLIC_BASE_URL (required in production); public cache only when it is configured.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Public base URL is not configured (production without PUBLIC_BASE_URL) or is unusable ``error`` is
                ``Any | RawError``."""
        return unwrap(await self._with_raw_response.get_agent_commerce_manifest(request_options=request_options))

    async def get_feed_products(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Custom schema.org-style JSON-LD ItemList of Product/Offer entries with server catalog prices (price decimal
        string, additionalProperty priceMinor/dietary). Not an official PayPal Store Sync feed. Read-only,
        ETag-revalidatable.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Public base URL is not configured (production without PUBLIC_BASE_URL) or is unusable ``error`` is
                ``Any | RawError``."""
        return unwrap(await self._with_raw_response.get_feed_products(request_options=request_options))

    async def get_llms_txt(self, *, request_options: RequestOptionsOrDict | None = None) -> str:
        """Plain-text summary generated from /.well-known/agent-commerce.json.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            OK

        Raises:
            ApiError: Public base URL is not configured (production without PUBLIC_BASE_URL) or is unusable ``error`` is
                ``Any | RawError``."""
        return unwrap(await self._with_raw_response.get_llms_txt(request_options=request_options))

    async def get_mandate_keys(self, *, request_options: RequestOptionsOrDict | None = None) -> Any:
        """Active and previous Ed25519 PUBLIC keys (status: active|previous), keyPersistence (configured|ephemeral) and
        the canonicalization label. 503 if the key configuration is invalid.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            JWK set

        Raises:
            ApiError: Mandate key configuration is invalid (reported, never a 500) ``error`` is ``Error | RawError``."""
        return unwrap(await self._with_raw_response.get_mandate_keys(request_options=request_options))

    @property
    def with_raw_response(self) -> AsyncAgentDiscoveryWithRawResponse:
        return self._with_raw_response


class AgentDiscoveryWithRawResponse(BaseRawResponse[RawClient, Server]):
    def get_agent_card(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, GetAgentCardErrorBody]:
        """Compact card generated from /.well-known/agent-commerce.json; cannot disagree with it.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/.well-known/agent.json"),
            decoder=json_decoder[Any],
            error_mapper=get_agent_card_error_mapper,
            request_options=request_options,
        )

    def get_agent_commerce_manifest(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, GetAgentCommerceManifestErrorBody]:
        """Single source of truth for AI agents: merchant, endpoints, MCP tool names (derived from the real MCP
        registry), guardrails (agentCanPay/Capture/Refund = false), policy limits, Cart Mandate verification info and
        disclaimers. Custom aicafe.* format; not an official PayPal Agent Ready, Store Sync or AP2 integration. URLs
        come from PUBLIC_BASE_URL (required in production); public cache only when it is configured.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/.well-known/agent-commerce.json"),
            decoder=json_decoder[Any],
            error_mapper=get_agent_commerce_manifest_error_mapper,
            request_options=request_options,
        )

    def get_feed_products(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, GetFeedProductsErrorBody]:
        """Custom schema.org-style JSON-LD ItemList of Product/Offer entries with server catalog prices (price decimal
        string, additionalProperty priceMinor/dietary). Not an official PayPal Store Sync feed. Read-only,
        ETag-revalidatable.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/feed/products"),
            decoder=json_decoder[Any],
            error_mapper=get_feed_products_error_mapper,
            request_options=request_options,
        )

    def get_llms_txt(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[str, GetLlmsTxtErrorBody]:
        """Plain-text summary generated from /.well-known/agent-commerce.json.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/llms.txt"),
            decoder=text_decoder[str],
            error_mapper=get_llms_txt_error_mapper,
            request_options=request_options,
        )

    def get_mandate_keys(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, GetMandateKeysErrorBody]:
        """Active and previous Ed25519 PUBLIC keys (status: active|previous), keyPersistence (configured|ephemeral) and
        the canonicalization label. 503 if the key configuration is invalid.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return self._client.execute(
            http_method="GET",
            url_template=self._server.default("/.well-known/mandate-keys.json"),
            decoder=json_decoder[Any],
            error_mapper=get_mandate_keys_error_mapper,
            request_options=request_options,
        )


class AsyncAgentDiscoveryWithRawResponse(BaseRawResponse[AsyncRawClient, Server]):
    async def get_agent_card(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, GetAgentCardErrorBody]:
        """Compact card generated from /.well-known/agent-commerce.json; cannot disagree with it.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/.well-known/agent.json"),
            decoder=async_json_decoder[Any],
            error_mapper=get_agent_card_error_mapper,
            request_options=request_options,
        )

    async def get_agent_commerce_manifest(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, GetAgentCommerceManifestErrorBody]:
        """Single source of truth for AI agents: merchant, endpoints, MCP tool names (derived from the real MCP
        registry), guardrails (agentCanPay/Capture/Refund = false), policy limits, Cart Mandate verification info and
        disclaimers. Custom aicafe.* format; not an official PayPal Agent Ready, Store Sync or AP2 integration. URLs
        come from PUBLIC_BASE_URL (required in production); public cache only when it is configured.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/.well-known/agent-commerce.json"),
            decoder=async_json_decoder[Any],
            error_mapper=get_agent_commerce_manifest_error_mapper,
            request_options=request_options,
        )

    async def get_feed_products(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, GetFeedProductsErrorBody]:
        """Custom schema.org-style JSON-LD ItemList of Product/Offer entries with server catalog prices (price decimal
        string, additionalProperty priceMinor/dietary). Not an official PayPal Store Sync feed. Read-only,
        ETag-revalidatable.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/api/feed/products"),
            decoder=async_json_decoder[Any],
            error_mapper=get_feed_products_error_mapper,
            request_options=request_options,
        )

    async def get_llms_txt(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[str, GetLlmsTxtErrorBody]:
        """Plain-text summary generated from /.well-known/agent-commerce.json.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/llms.txt"),
            decoder=async_text_decoder[str],
            error_mapper=get_llms_txt_error_mapper,
            request_options=request_options,
        )

    async def get_mandate_keys(
        self, *, request_options: RequestOptionsOrDict | None = None
    ) -> ApiResult[Any, GetMandateKeysErrorBody]:
        """Active and previous Ed25519 PUBLIC keys (status: active|previous), keyPersistence (configured|ephemeral) and
        the canonicalization label. 503 if the key configuration is invalid.

        Args:
            request_options: Per-call overrides for this one request, such as a timeout, extra headers, or its retry
                count and statuses.

        Returns:
            An ``ApiResult`` holding the deserialized response or the error body."""
        return await self._client.execute(
            http_method="GET",
            url_template=self._server.default("/.well-known/mandate-keys.json"),
            decoder=async_json_decoder[Any],
            error_mapper=get_mandate_keys_error_mapper,
            request_options=request_options,
        )

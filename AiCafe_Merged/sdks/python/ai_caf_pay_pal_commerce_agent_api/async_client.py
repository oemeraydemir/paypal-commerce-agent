from __future__ import annotations

from functools import cached_property
from types import TracebackType

from typing_extensions import Self

from .apis.agent_discovery import AsyncAgentDiscovery
from .apis.ai_agent import AsyncAiAgent
from .apis.audit import AsyncAudit
from .apis.catalog import AsyncCatalog
from .apis.mandates import AsyncMandates
from .apis.mcp_agentic_commerce import AsyncMcpAgenticCommerce
from .apis.ops_copilot import AsyncOpsCopilot
from .apis.orders import AsyncOrders
from .apis.policy import AsyncPolicy
from .apis.refunds import AsyncRefunds
from .apis.sessions import AsyncSessions
from .auth import AsyncAuthSchemes
from .base_client import DEFAULT_TIMEOUT, BaseAiCafPayPalCommerceAgentApiClient
from .core import (
    OPERATING_SYSTEM,
    PYTHON_RUNTIME,
    ApiKeyHeaderScheme,
    AsyncHttpClient,
    AsyncHttpx2Client,
    AsyncRawClient,
    BearerAuthScheme,
    LoggingOptionsOrDict,
    RetryOptionsOrDict,
    no_auth,
    param,
)
from .server.environment import Environment


class AsyncAiCafPayPalCommerceAgentApiClient(BaseAiCafPayPalCommerceAgentApiClient[AsyncRawClient]):
    def __init__(
        self,
        *,
        environment: Environment = "production",
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        retry_options: int | RetryOptionsOrDict | None = None,
        logging_options: LoggingOptionsOrDict | None = None,
        custom_async_http_client: AsyncHttpClient | None = None,
        session_id: str | None = None,
        bearer_auth: str | None = None,
        ops_key: str | None = None,
    ) -> None:
        super().__init__(
            environment=environment,
            base_url=base_url,
            timeout=timeout,
            retry_options=retry_options,
            logging_options=logging_options,
        )
        self._raw_client = AsyncRawClient(
            http_client=(
                custom_async_http_client if custom_async_http_client is not None else AsyncHttpx2Client(timeout=timeout)
            ),
            retry_options=self._retry_options,
            logging_options=self._logging_options,
            global_headers=[
                param[str]("User-Agent", "AiCafPayPalCommerceAgentApiClient/1.0.0 Python"),
                param[str]("X-APIMatic-Lang", "Python"),
                param[str]("X-APIMatic-Package-Version", "1.0.0"),
                param[str]("X-APIMatic-Gen-Version", "4.0.0"),
                param[str]("X-APIMatic-OS", OPERATING_SYSTEM),
                param[str]("X-APIMatic-Runtime", PYTHON_RUNTIME),
            ],
        )
        self._auth = AsyncAuthSchemes(
            session_id=ApiKeyHeaderScheme("X-Session-Id", session_id) if session_id is not None else no_auth,
            bearer_auth=BearerAuthScheme(bearer_auth) if bearer_auth is not None else no_auth,
            ops_key=ApiKeyHeaderScheme("X-Ops-Key", ops_key) if ops_key is not None else no_auth,
        )

    @cached_property
    def ai_agent(self) -> AsyncAiAgent:
        return AsyncAiAgent(self._raw_client, self._server, self._auth)

    @cached_property
    def agent_discovery(self) -> AsyncAgentDiscovery:
        return AsyncAgentDiscovery(self._raw_client, self._server)

    @cached_property
    def audit(self) -> AsyncAudit:
        return AsyncAudit(self._raw_client, self._server, self._auth)

    @cached_property
    def catalog(self) -> AsyncCatalog:
        return AsyncCatalog(self._raw_client, self._server)

    @cached_property
    def mcp_agentic_commerce(self) -> AsyncMcpAgenticCommerce:
        return AsyncMcpAgenticCommerce(self._raw_client, self._server, self._auth)

    @cached_property
    def mandates(self) -> AsyncMandates:
        return AsyncMandates(self._raw_client, self._server, self._auth)

    @cached_property
    def ops_copilot(self) -> AsyncOpsCopilot:
        return AsyncOpsCopilot(self._raw_client, self._server, self._auth)

    @cached_property
    def orders(self) -> AsyncOrders:
        return AsyncOrders(self._raw_client, self._server, self._auth)

    @cached_property
    def policy(self) -> AsyncPolicy:
        return AsyncPolicy(self._raw_client, self._server, self._auth)

    @cached_property
    def refunds(self) -> AsyncRefunds:
        return AsyncRefunds(self._raw_client, self._server, self._auth)

    @cached_property
    def sessions(self) -> AsyncSessions:
        return AsyncSessions(self._raw_client, self._server, self._auth)

    async def aclose(self) -> None:
        await self._raw_client.http_client.aclose()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, exc_tb: TracebackType | None
    ) -> None:
        await self.aclose()


AsyncClient = AsyncAiCafPayPalCommerceAgentApiClient

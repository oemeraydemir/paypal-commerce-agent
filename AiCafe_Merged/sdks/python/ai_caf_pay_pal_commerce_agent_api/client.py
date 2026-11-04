from __future__ import annotations

from functools import cached_property
from types import TracebackType

from typing_extensions import Self

from .apis.agent_discovery import AgentDiscovery
from .apis.ai_agent import AiAgent
from .apis.audit import Audit
from .apis.catalog import Catalog
from .apis.mandates import Mandates
from .apis.mcp_agentic_commerce import McpAgenticCommerce
from .apis.ops_copilot import OpsCopilot
from .apis.orders import Orders
from .apis.policy import Policy
from .apis.refunds import Refunds
from .apis.sessions import Sessions
from .auth import AuthSchemes
from .base_client import DEFAULT_TIMEOUT, BaseAiCafPayPalCommerceAgentApiClient
from .core import (
    OPERATING_SYSTEM,
    PYTHON_RUNTIME,
    ApiKeyHeaderScheme,
    BearerAuthScheme,
    HttpClient,
    Httpx2Client,
    LoggingOptionsOrDict,
    RawClient,
    RetryOptionsOrDict,
    no_auth,
    param,
)
from .server.environment import Environment


class AiCafPayPalCommerceAgentApiClient(BaseAiCafPayPalCommerceAgentApiClient[RawClient]):
    def __init__(
        self,
        *,
        environment: Environment = "production",
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        retry_options: int | RetryOptionsOrDict | None = None,
        logging_options: LoggingOptionsOrDict | None = None,
        custom_http_client: HttpClient | None = None,
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
        self._raw_client = RawClient(
            http_client=custom_http_client if custom_http_client is not None else Httpx2Client(timeout=timeout),
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
        self._auth = AuthSchemes(
            session_id=ApiKeyHeaderScheme("X-Session-Id", session_id) if session_id is not None else no_auth,
            bearer_auth=BearerAuthScheme(bearer_auth) if bearer_auth is not None else no_auth,
            ops_key=ApiKeyHeaderScheme("X-Ops-Key", ops_key) if ops_key is not None else no_auth,
        )

    @cached_property
    def ai_agent(self) -> AiAgent:
        return AiAgent(self._raw_client, self._server, self._auth)

    @cached_property
    def agent_discovery(self) -> AgentDiscovery:
        return AgentDiscovery(self._raw_client, self._server)

    @cached_property
    def audit(self) -> Audit:
        return Audit(self._raw_client, self._server, self._auth)

    @cached_property
    def catalog(self) -> Catalog:
        return Catalog(self._raw_client, self._server)

    @cached_property
    def mcp_agentic_commerce(self) -> McpAgenticCommerce:
        return McpAgenticCommerce(self._raw_client, self._server, self._auth)

    @cached_property
    def mandates(self) -> Mandates:
        return Mandates(self._raw_client, self._server, self._auth)

    @cached_property
    def ops_copilot(self) -> OpsCopilot:
        return OpsCopilot(self._raw_client, self._server, self._auth)

    @cached_property
    def orders(self) -> Orders:
        return Orders(self._raw_client, self._server, self._auth)

    @cached_property
    def policy(self) -> Policy:
        return Policy(self._raw_client, self._server, self._auth)

    @cached_property
    def refunds(self) -> Refunds:
        return Refunds(self._raw_client, self._server, self._auth)

    @cached_property
    def sessions(self) -> Sessions:
        return Sessions(self._raw_client, self._server, self._auth)

    def close(self) -> None:
        self._raw_client.http_client.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, exc_tb: TracebackType | None
    ) -> None:
        self.close()


Client = AiCafPayPalCommerceAgentApiClient

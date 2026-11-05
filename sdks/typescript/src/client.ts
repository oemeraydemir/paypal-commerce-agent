import { buildAuthSchemes, type AuthSchemes } from "./auth-schemes.js";
import type { ClientOptions } from "./client-options.js";
import { buildCoreClientOptions } from "./core/client-options.js";
import { RawClient } from "./core/raw-client.js";
import * as host from "./core/runtime-environment.js";
import * as s from "./core/validation/index.js";
import { AgentDiscovery } from "./resources/agent-discovery.js";
import { AiAgent } from "./resources/ai-agent.js";
import { Audit } from "./resources/audit.js";
import { Catalog } from "./resources/catalog.js";
import { Mandates } from "./resources/mandates.js";
import { McpAgenticCommerce } from "./resources/mcp-agentic-commerce.js";
import { OpsCopilot } from "./resources/ops-copilot.js";
import { Orders } from "./resources/orders.js";
import { Policy } from "./resources/policy.js";
import { Refunds } from "./resources/refunds.js";
import { Sessions } from "./resources/sessions.js";
import { buildServers, type Servers } from "./servers.js";

/**
 * Agentic-commerce API for the PayPal AI Hackathon. A natural-language AI agent prepares a shopping
 * cart, but the **server owns all prices** and a **human authorizes every PayPal payment** — the
 * agent never touches money. A read-only PayPal Ops Copilot lets a merchant audit activity. This
 * spec powers SDK generation (APIMatic) and the Postman collection.
 */
export class AiCafPayPalCommerceAgentApiClient {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;
  #sessions?: Sessions;
  #catalog?: Catalog;
  #aiAgent?: AiAgent;
  #policy?: Policy;
  #orders?: Orders;
  #opsCopilot?: OpsCopilot;
  #audit?: Audit;
  #mcpAgenticCommerce?: McpAgenticCommerce;
  #refunds?: Refunds;
  #mandates?: Mandates;
  #agentDiscovery?: AgentDiscovery;

  constructor(options: ClientOptions = {}) {
    this.#rawClient = new RawClient({
      ...buildCoreClientOptions(options, "AI_CAF_PAY_PAL_COMMERCE_AGENT_API_CLIENT_LOG"),
      defaultHeaders: [
        {
          name: "User-Agent",
          value: "AiCafPayPalCommerceAgentApiClient/1.0.0 TypeScript",
          schema: s.string(),
        },
        { name: "X-APIMatic-Lang", value: "TypeScript", schema: s.string() },
        { name: "X-APIMatic-Package-Version", value: "1.0.0", schema: s.string() },
        { name: "X-APIMatic-Gen-Version", value: "4.0.0", schema: s.string() },
        { name: "X-APIMatic-OS", value: host.operatingSystem(), schema: s.optional(s.string()) },
        { name: "X-APIMatic-Runtime", value: host.runtimeDescription(), schema: s.optional(s.string()) },
      ],
      defaultQuery: [],
      defaultPathParams: [],
    });

    this.#servers = buildServers(options);

    this.#auth = buildAuthSchemes(options);
  }

  /**
   * Server-issued session identity
   */
  get sessions(): Sessions {
    return (this.#sessions ??= new Sessions(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Product catalog (read-only)
   */
  get catalog(): Catalog {
    return (this.#catalog ??= new Catalog(this.#rawClient, this.#servers));
  }

  /**
   * Natural-language cart builder
   */
  get aiAgent(): AiAgent {
    return (this.#aiAgent ??= new AiAgent(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Human-in-the-loop price & spend policy
   */
  get policy(): Policy {
    return (this.#policy ??= new Policy(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Order creation, capture, cancel (PayPal)
   */
  get orders(): Orders {
    return (this.#orders ??= new Orders(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Read-only merchant assistant (PayPal Agent Toolkit)
   */
  get opsCopilot(): OpsCopilot {
    return (this.#opsCopilot ??= new OpsCopilot(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Immutable policy-decision events
   */
  get audit(): Audit {
    return (this.#audit ??= new Audit(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Model Context Protocol server: lets any external AI agent shop at AI Café and start a PayPal
   * checkout that only a human can approve
   */
  get mcpAgenticCommerce(): McpAgenticCommerce {
    return (this.#mcpAgenticCommerce ??= new McpAgenticCommerce(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Merchant refund queue. An AI (Ops Copilot) or merchant may PROPOSE a refund; only an
   * authenticated approval calls PayPal's refund API.
   */
  get refunds(): Refunds {
    return (this.#refunds ??= new Refunds(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Signed Cart Mandates (tamper-evident record of what was proposed and who holds payment
   * authority)
   */
  get mandates(): Mandates {
    return (this.#mandates ??= new Mandates(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Machine-readable entry points for AI agents
   */
  get agentDiscovery(): AgentDiscovery {
    return (this.#agentDiscovery ??= new AgentDiscovery(this.#rawClient, this.#servers));
  }
}

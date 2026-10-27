import { currentBusiness } from '../config/business-config';
import { env } from '../config/environment';
import { defaultPolicy } from '../policy/default-policy';
import { MCP_TOOL_NAMES } from '../routes/mcp';
import { CANONICALIZATION } from '../mandate/mandate-service';
import { automationStats } from '../automation/emitter';

// ONE canonical machine-readable description of this merchant for AI agents:
// /.well-known/agent-commerce.json. The agent card (/.well-known/agent.json) and /llms.txt are generated
// from this object, so they cannot disagree with it. The tool list comes from the real MCP registry
// (routes/mcp.ts) and a test compares it with a live `tools/list`.
//
// These are custom aicafe.* formats. They are NOT an official PayPal Agent Ready, Store Sync or AP2
// integration, and nothing here can pay, capture or refund.

const major = (minor: number) => (minor / 100).toFixed(2);

export const MANIFEST_SCHEMA = 'aicafe.agent-commerce/1';

export function buildManifest(base: string) {
  const automation = automationStats();
  return {
    schema: MANIFEST_SCHEMA,
    schemaVersion: '1.1',
    merchant: {
      id: currentBusiness.businessId,
      name: currentBusiness.name,
      currency: currentBusiness.currency,
      locale: currentBusiness.locale,
      timezone: currentBusiness.timezone,
    },
    endpoints: {
      manifest: `${base}/.well-known/agent-commerce.json`,
      agentCard: `${base}/.well-known/agent.json`,
      llmsTxt: `${base}/llms.txt`,
      productFeed: `${base}/api/feed/products`,
      catalogSearch: `${base}/api/catalog/search`,
      mcp: `${base}/api/mcp`,
      health: `${base}/api/health`,
    },
    protocols: {
      mcp: { transport: 'streamable-http', path: '/api/mcp', tools: [...MCP_TOOL_NAMES] },
    },
    payments: {
      provider: 'paypal',
      environment: env.paypal?.PAYPAL_ENV ?? 'sandbox',
      buyerApprovalRequired: true,
    },
    guardrails: {
      pricesSetBy: 'server',
      policyEnforcedBy: 'server',
      agentCanPay: false,
      agentCanCapture: false,
      agentCanRefund: false,
      paymentApprovedBy: 'human buyer in PayPal (sandbox)',
      refundsApprovedBy: 'authenticated merchant in the dashboard',
      policy: {
        maxPerPurchase: major(defaultPolicy.maxPerPurchaseMinor),
        confirmationThreshold: major(defaultPolicy.confirmationThresholdMinor),
        dailyLimit: major(defaultPolicy.dailySpendLimitMinor),
        blockedDietaryAttributes: defaultPolicy.blockedDietaryAttributes,
        decisions: ['AUTO_ALLOW', 'REQUIRE_CONFIRMATION', 'BLOCK'],
        enforcedAt: 'POST /api/orders/create (re-evaluated server-side on every checkout)',
      },
    },
    verification: {
      cartMandate: {
        keys: `${base}/.well-known/mandate-keys.json`,
        verifyEndpoint: `${base}/api/mandates/verify`,
        alg: 'EdDSA (Ed25519)',
        canonicalization: CANONICALIZATION,
        note: 'Every order has a signed Cart Mandate: what was proposed, under which constraints. It is a custom audit record, not AP2.',
      },
    },
    automation: { outboundEvents: automation.enabled },
    disclaimers: [
      'Custom aicafe.* formats; not an official PayPal Agent Ready, Store Sync or AP2 integration.',
      'PayPal sandbox only: no real money moves.',
    ],
  };
}

export type Manifest = ReturnType<typeof buildManifest>;

/** /.well-known/agent.json: a compact card generated from the canonical manifest. */
export function buildAgentCard(m: Manifest) {
  return {
    schema: 'aicafe.agent-card/1',
    name: m.merchant.name,
    description:
      'A merchant that AI agents can query: they may search the menu, prepare a cart and start a PayPal sandbox checkout. They cannot pay, capture or refund.',
    merchant: { id: m.merchant.id, currency: m.merchant.currency },
    manifest: m.endpoints.manifest,
    mcp: { endpoint: m.endpoints.mcp, transport: m.protocols.mcp.transport, tools: m.protocols.mcp.tools },
    guardrails: {
      agentCanPay: m.guardrails.agentCanPay,
      agentCanCapture: m.guardrails.agentCanCapture,
      agentCanRefund: m.guardrails.agentCanRefund,
      pricesSetBy: m.guardrails.pricesSetBy,
      policyEnforcedBy: m.guardrails.policyEnforcedBy,
      paymentApprovedBy: m.guardrails.paymentApprovedBy,
    },
    verification: m.verification.cartMandate,
    environment: m.payments.environment,
    disclaimers: m.disclaimers,
  };
}

/** /llms.txt: plain-text summary generated from the canonical manifest. */
export function buildLlmsTxt(m: Manifest): string {
  return [
    `# ${m.merchant.name}`,
    '',
    `> A café whose menu AI agents can query. Sandbox payments only; a human buyer approves every payment in PayPal.`,
    '',
    '## For AI agents',
    `- Canonical manifest: ${m.endpoints.manifest}`,
    `- MCP endpoint: ${m.endpoints.mcp} (tools: ${m.protocols.mcp.tools.join(', ')})`,
    `- Product feed (schema.org-style): ${m.endpoints.productFeed}`,
    `- Agent card: ${m.endpoints.agentCard}`,
    `- Cart Mandate keys: ${m.verification.cartMandate.keys}`,
    '',
    '## Rules that cannot be bypassed',
    `- There is no pay, capture or refund tool. Prices and the spending policy (max ${m.guardrails.policy.maxPerPurchase} ${m.merchant.currency} per purchase) are decided by the server.`,
    '- A blocked cart returns the reason: shrink the cart and try again.',
    '- start_checkout returns an approval link for a human. Hand it over; do not try to complete it.',
    '',
    '## Not claimed',
    ...m.disclaimers.map((d) => `- ${d}`),
    '',
  ].join('\n');
}

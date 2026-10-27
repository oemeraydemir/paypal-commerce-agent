import OpenAI from 'openai';
import { z } from 'zod';
import { currentBusiness } from '../config/business-config';
import { OrderService } from '../orders/service';
import { OrderOrigin, OrderStatus } from '../orders/domain';
import { defaultPolicy } from '../policy/default-policy';
import { PolicyDecision } from '../policy/domain';
import { policyStorage } from '../policy/storage';
import { publicSessionRef } from '../session';
import { formatMoney } from '../utils/money';
import { RefundError, refundService } from '../refunds/service';

// ---------------------------------------------------------------------------------------------
// PayPal Agent Toolkit: strictly READ-ONLY allow-list.
//
// Two independent layers keep the copilot from moving money:
//   1. The toolkit itself is configured with only these permission flags, so it never even
//      advertises create/pay/refund/send/cancel tools.
//   2. Every tool the model asks for is checked against READ_ONLY_PAYPAL_TOOLS by name before it
//      reaches the toolkit (see ops-agent.ts); anything else is refused and reported.
// get_merchant_insights is excluded on purpose: the toolkit does not support it in sandbox.
// ---------------------------------------------------------------------------------------------
export const PAYPAL_READ_ONLY_PERMISSIONS = {
  transactions: { list: true },
  orders: { get: true },
  disputes: { list: true, get: true },
  shipment: { get: true },
  invoices: { list: true, get: true },
  payments: { getRefunds: true },
} as const;

export const READ_ONLY_PAYPAL_TOOLS: ReadonlyArray<string> = [
  'list_transactions',
  'get_order',
  'list_disputes',
  'get_dispute',
  'get_shipment_tracking',
  'list_invoices',
  'get_invoice',
  'get_refund',
];

// propose_refund only creates a PROPOSED record in the merchant's refund queue. It cannot call PayPal:
// a merchant must approve it in the dashboard (src/refunds, src/routes/refunds.ts).
export const INTERNAL_TOOL_NAMES = ['list_internal_orders', 'get_policy_audit', 'get_policy_summary', 'propose_refund'] as const;
export type InternalToolName = (typeof INTERNAL_TOOL_NAMES)[number];

export function isInternalTool(name: string): name is InternalToolName {
  return (INTERNAL_TOOL_NAMES as ReadonlyArray<string>).includes(name);
}

export function isAllowedPayPalTool(name: string): boolean {
  return READ_ONLY_PAYPAL_TOOLS.includes(name);
}

const MAX_ROWS = 50;
const money = (minor: number, currency: string) => formatMoney(minor, currency, currentBusiness.locale);

export const INTERNAL_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_internal_orders',
      description:
        "List AI Café's own orders (newest first) with status and origin (HUMAN, AI_ASSISTED, AI_AGENT). Read-only. Contains no PayPal identifiers.",
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Optional order status filter, e.g. PAID or ORDER_CANCELLED' },
          origin: { type: 'string', enum: ['HUMAN', 'AI_ASSISTED', 'AI_AGENT'] },
          limit: { type: 'integer', minimum: 1, maximum: MAX_ROWS },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_policy_audit',
      description:
        'List recent policy decisions (AUTO_ALLOW, REQUIRE_CONFIRMATION, BLOCK) with amount, reason and violated rules. Read-only audit trail.',
      parameters: {
        type: 'object',
        properties: {
          decision: { type: 'string', enum: ['AUTO_ALLOW', 'REQUIRE_CONFIRMATION', 'BLOCK'] },
          limit: { type: 'integer', minimum: 1, maximum: MAX_ROWS },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_refund',
      description:
        'PROPOSE a refund for a paid AI Café order. This only adds a request to the merchant refund queue; it moves no money and a human merchant must approve it. Omit amountMinor for a full refund.',
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'AI Café order id (from list_internal_orders)' },
          amountMinor: { type: 'integer', minimum: 1, description: 'Optional partial amount in minor units (cents)' },
          reason: { type: 'string', description: 'Short reason shown to the merchant and the shopper (3-200 chars)' },
        },
        required: ['orderId', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_policy_summary',
      description: 'Summarise the default purchase-policy limits plus order and policy-event counters. Read-only.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

const ordersArgs = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  origin: z.nativeEnum(OrderOrigin).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_ROWS).default(10),
});
const proposeRefundArgs = z.object({
  orderId: z.string().min(1).max(100),
  amountMinor: z.coerce.number().int().min(1).optional(),
  reason: z.string().min(3).max(200),
});
const auditArgs = z.object({
  decision: z.enum(['AUTO_ALLOW', 'REQUIRE_CONFIRMATION', 'BLOCK']).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_ROWS).default(10),
});

/** Executes one of the internal tools (read-only, plus propose_refund which only queues a request). Throws a ZodError on invalid arguments. */
export function executeInternalTool(name: InternalToolName, rawArguments: string): unknown {
  const args = rawArguments?.trim() ? JSON.parse(rawArguments) : {};

  if (name === 'list_internal_orders') {
    const a = ordersArgs.parse(args);
    let orders = OrderService.getInstance().getAll();
    if (a.status) orders = orders.filter((o) => o.status === a.status);
    if (a.origin) orders = orders.filter((o) => o.origin === a.origin);
    const sorted = orders
      .slice()
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || y.id.localeCompare(x.id))
      .slice(0, a.limit);
    return {
      total: orders.length,
      returned: sorted.length,
      orders: sorted.map((o) => ({
        id: o.id,
        session: publicSessionRef(o.sessionId),
        status: o.status,
        origin: o.origin,
        total: money(o.totalMinor, o.currency),
        itemCount: o.items.length,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  if (name === 'get_policy_audit') {
    const a = auditArgs.parse(args);
    let events = policyStorage.getEvents();
    if (a.decision) events = events.filter((e) => e.decision === (a.decision as PolicyDecision));
    const sorted = events
      .slice()
      .sort((x, y) => y.timestamp.localeCompare(x.timestamp) || y.id.localeCompare(x.id))
      .slice(0, a.limit);
    return {
      total: events.length,
      returned: sorted.length,
      events: sorted.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        session: publicSessionRef(e.sessionId),
        agent: e.agent,
        decision: e.decision,
        amount: money(e.amountMinor, e.currency),
        reason: e.reason,
        violatedRules: (e.violatedRules ?? []).map((v) => v.type),
        orderId: e.orderId ?? null,
      })),
    };
  }

  if (name === 'propose_refund') {
    const a = proposeRefundArgs.parse(args);
    try {
      const r = refundService.propose({ ...a, proposedBy: 'OPS_COPILOT' });
      return {
        proposed: true,
        refundRequestId: r.id,
        orderId: r.orderId,
        amount: money(r.amountMinor, r.currency),
        status: r.status,
        note: 'Nothing was refunded. A merchant must approve this request in the dashboard refund queue.',
      };
    } catch (err) {
      if (err instanceof RefundError) return { proposed: false, error: err.message };
      throw err;
    }
  }

  // get_policy_summary
  return {
    defaultPolicy: {
      maxPerPurchase: money(defaultPolicy.maxPerPurchaseMinor, defaultPolicy.currency),
      confirmationThreshold: money(defaultPolicy.confirmationThresholdMinor, defaultPolicy.currency),
      dailySpendLimit: money(defaultPolicy.dailySpendLimitMinor, defaultPolicy.currency),
      blockedDietaryAttributes: defaultPolicy.blockedDietaryAttributes,
    },
    policyEvents: policyStorage.getStats(),
    orders: OrderService.getInstance().getStats((id) => refundService.refundedMinor(id), (id) => refundService.pendingMinor(id)),
  };
}

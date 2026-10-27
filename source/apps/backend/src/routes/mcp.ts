import { Router, Request, Response } from 'express';
import http from 'http';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { env } from '../config/environment';
import { sessionStore, SessionLimitError } from '../session';
import { executeTool } from '../ai/tool-executor';
import { markSessionAIPrepared } from '../ai/session-tracker';
import { OrderService } from '../orders/service';
import { SlidingWindowLimiter } from '../middleware/rate-limit';
import { formatMoney } from '../utils/money';
import { currentBusiness } from '../config/business-config';
import { CatalogService } from '../catalog/service';

// ──────────────────────────────────────────────────────────────────────────────
// AI Café as an agent-shoppable merchant: a Model Context Protocol (MCP) server.
//
// Any MCP client (Claude, ChatGPT, an agent framework, the MCP Inspector) can
// discover the café, build a cart and START a PayPal checkout. What it can NOT do
// is pay: there is deliberately NO capture/pay tool. The agent receives a PayPal
// approval link, a HUMAN approves it, and the human confirms the capture in the
// storefront. Prices, quantities and the spending policy are enforced by the very
// same server code the web/Flutter app uses (this route is a thin adapter — the
// money-moving endpoints are called through the normal HTTP API, so they run the
// same session auth, idempotency, policy and reservation logic).
//
// Transport: MCP "Streamable HTTP", JSON responses only (no SSE), stateless
// handlers keyed by an unguessable Mcp-Session-Id.
// ──────────────────────────────────────────────────────────────────────────────

const router = Router();
const orderService = OrderService.getInstance();
const CATEGORIES = new CatalogService().getCategories();

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = {
  name: `${currentBusiness.businessId}-mcp`,
  title: `${currentBusiness.name} — human-approved agentic checkout`,
  version: '1.0.0',
};
const INSTRUCTIONS =
  `${currentBusiness.name} is a merchant you can shop at on behalf of a human. Workflow: search_menu → ` +
  'prepare_cart (server-owned prices; you never set a price) → check_policy (what the shopper\'s ' +
  'spending policy will decide) → start_checkout (returns a PayPal sandbox approval link). ' +
  `You cannot pay: give the approval link to the human, who approves it in PayPal and confirms ` +
  `the payment in the ${currentBusiness.name} storefront. Use get_order_status to follow the order afterwards. ` +
  `Amounts are ${currentBusiness.currency} minor units (cents). PayPal runs in SANDBOX mode only.`;

interface McpSession {
  sessionId: string;
  userId: string;
  token: string;
  createdAt: number;
}
const mcpSessions = new Map<string, McpSession>();

const limiter = new SlidingWindowLimiter(60, 60 * 1000);

const cleanupTimer = setInterval(() => {
  for (const [id, s] of mcpSessions.entries()) {
    if (!sessionStore.has(s.sessionId)) mcpSessions.delete(id);
  }
  limiter.prune();
}, 5 * 60 * 1000);
cleanupTimer.unref();

/** Test isolation only. */
export function resetMcpState(): void {
  mcpSessions.clear();
  limiter.reset();
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────
type RpcId = string | number | null;
const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: RpcId, code: number, message: string, data?: unknown) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});

// ── Tool definitions ─────────────────────────────────────────────────────────
const itemSchema = z.object({
  productId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(100),
});
const searchSchema = z.object({
  query: z.string().max(200).optional(),
  category: z.string().refine((c) => CATEGORIES.includes(c), { message: 'unknown category' }).optional(),
  dietary: z.array(z.enum(['vegetarian', 'vegan', 'gluten-free'])).max(3).optional(),
  max_unit_price_minor: z.number().int().min(0).max(100000).optional(),
});
const cartSchema = z.object({
  items: z.array(itemSchema).min(1).max(30),
  max_budget_minor: z.number().int().min(0).max(1000000).optional(),
});
const itemsOnlySchema = z.object({ items: z.array(itemSchema).max(30) });
const checkoutSchema = z.object({ items: z.array(itemSchema).min(1).max(30) });
const orderSchema = z.object({ orderId: z.string().min(1).max(64) });

const itemsJsonSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 30,
  items: {
    type: 'object',
    properties: {
      productId: { type: 'string', description: 'Product id from search_menu, e.g. "coffee".' },
      quantity: { type: 'integer', minimum: 1, maximum: 100 },
    },
    required: ['productId', 'quantity'],
    additionalProperties: false,
  },
};

const TOOLS = [
  {
    name: 'search_menu',
    title: 'Search the menu',
    description:
      `Search the live menu by free text, category, dietary needs or max unit price. Returns authoritative prices in ${currentBusiness.currency} minor units.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'e.g. "vegetarian breakfast"' },
        category: {
          type: 'string',
          enum: CATEGORIES,
        },
        dietary: { type: 'array', items: { type: 'string', enum: ['vegetarian', 'vegan', 'gluten-free'] } },
        max_unit_price_minor: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'prepare_cart',
    title: 'Prepare a cart',
    description:
      'Validate a cart against the catalog and return the server-computed total plus the shopper\'s spending-policy decision (AUTO_ALLOW, REQUIRE_CONFIRMATION or BLOCK). Nothing is charged or reserved.',
    inputSchema: {
      type: 'object',
      properties: {
        items: itemsJsonSchema,
        max_budget_minor: { type: 'integer', minimum: 0, description: 'Optional hard total budget.' },
      },
      required: ['items'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'check_policy',
    title: 'Check the spending policy',
    description:
      'Ask the authoritative policy engine what it will decide for a cart (per-purchase limit, approval threshold, daily budget, blocked attributes). With an empty items array it returns the shopper\'s current limits.',
    inputSchema: {
      type: 'object',
      properties: { items: { ...itemsJsonSchema, minItems: 0 } },
      required: ['items'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'start_checkout',
    title: 'Start a PayPal checkout (human must approve)',
    description:
      'Create an order and a PayPal SANDBOX checkout for the cart. Returns an approvalUrl that a HUMAN must open and approve; this tool cannot capture or pay. Blocked carts are refused by the server.',
    inputSchema: {
      type: 'object',
      properties: { items: itemsJsonSchema },
      required: ['items'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'get_order_status',
    title: 'Get order status',
    description: 'Status of an order created in this MCP session (CART_READY, PAYMENT_PENDING, PAID, …).',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
];

/** Names of the tools this server really exposes; discovery documents derive their tool list from here. */
export const MCP_TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name);

// ── Loopback to this server's own HTTP API ──────────────────────────────────
// Money-moving behaviour stays in ONE place (routes/orders.ts, policy-preview.ts).
function selfCall(
  req: Request,
  method: 'GET' | 'POST',
  path: string,
  session: McpSession,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const r = http.request(
      {
        host: '127.0.0.1',
        port: req.socket.localPort,
        method,
        path,
        headers: {
          'content-type': 'application/json',
          'x-session-id': session.sessionId,
          authorization: `Bearer ${session.token}`,
          ...(payload ? { 'content-length': String(Buffer.byteLength(payload)) } : {}),
          ...extraHeaders,
        },
      },
      (resp) => {
        const chunks: Buffer[] = [];
        resp.on('data', (c) => chunks.push(c));
        resp.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: any = text;
          try {
            parsed = text ? JSON.parse(text) : {};
          } catch {
            /* keep raw text */
          }
          resolve({ status: resp.statusCode || 0, body: parsed });
        });
      }
    );
    r.setTimeout(25000, () => r.destroy(new Error('Upstream timeout')));
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

type ToolOutput = { structured: any; isError?: boolean };

async function runTool(name: string, rawArgs: unknown, req: Request, session: McpSession): Promise<ToolOutput> {
  const ctx = { sessionId: session.sessionId, userId: session.userId };
  switch (name) {
    case 'search_menu': {
      const a = searchSchema.parse(rawArgs ?? {});
      const result = await executeTool(
        'search_products',
        { query: a.query ?? '', category: a.category, maxPriceMinor: a.max_unit_price_minor },
        { dietary: a.dietary ?? [] },
        ctx
      );
      return { structured: result };
    }
    case 'prepare_cart': {
      const a = cartSchema.parse(rawArgs);
      const result = await executeTool(
        'prepare_cart',
        { items: a.items, maxBudgetMinor: a.max_budget_minor },
        { dietary: [] },
        ctx
      );
      if (result.policyDecision !== 'BLOCK') {
        // The calling agent prepared this cart: the order will be attributed to
        // an AI agent on the dashboard (server-side, never client-supplied).
        markSessionAIPrepared(session.sessionId, 'AI_AGENT');
      }
      return {
        structured: {
          ...result,
          next_step:
            result.policyDecision === 'BLOCK'
              ? 'Blocked by the shopper\'s policy. Reduce the cart (see policyViolations) and call prepare_cart again.'
              : 'Call start_checkout with the same items to get a PayPal approval link for the human.',
        },
      };
    }
    case 'check_policy': {
      const a = itemsOnlySchema.parse(rawArgs);
      const r = await selfCall(req, 'POST', '/api/policy/preview', session, { items: a.items });
      return { structured: r.body, isError: r.status >= 400 };
    }
    case 'start_checkout': {
      const a = checkoutSchema.parse(rawArgs);
      const key = createHash('sha256')
        .update(JSON.stringify([...a.items].sort((x, y) => x.productId.localeCompare(y.productId))))
        .digest('hex')
        .slice(0, 32);
      const r = await selfCall(req, 'POST', '/api/orders/create', session, { items: a.items }, {
        'idempotency-key': `mcp-${key}`,
      });
      // 201 Created (or the idempotent replay of it) is the documented success code.
      if (r.status !== 200 && r.status !== 201) {
        return {
          structured: {
            error: r.body?.error ?? 'Checkout could not be started',
            policyDecision: r.body?.policyDecision,
            reason: r.body?.reason,
            suggestion: r.body?.suggestion,
            violations: r.body?.violations,
            httpStatus: r.status,
          },
          isError: true,
        };
      }
      return {
        structured: {
          orderId: r.body.orderId,
          status: r.body.status,
          origin: r.body.origin,
          totalFormatted: r.body.totalFormatted,
          currency: r.body.currency,
          approvalUrl: r.body.approvalUrl,
          next_step:
            'Give approvalUrl to the human buyer. They approve in PayPal (sandbox) and confirm the payment in the storefront. You cannot capture the payment. Poll get_order_status for PAID.',
        },
      };
    }
    case 'get_order_status': {
      const a = orderSchema.parse(rawArgs);
      const order = orderService.getById(a.orderId);
      // Another session's order is indistinguishable from a missing one.
      if (!order || order.sessionId !== session.sessionId) {
        return { structured: { error: 'Order not found' }, isError: true };
      }
      return {
        structured: {
          orderId: order.id,
          status: order.status,
          origin: order.origin,
          paid: order.status === 'PAID' || order.status === 'ORDER_CONFIRMED',
          totalFormatted: formatMoney(order.totalMinor, order.currency, currentBusiness.locale),
          items: order.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity })),
        },
      };
    }
    default:
      throw new UnknownToolError(name);
  }
}

class UnknownToolError extends Error {
  constructor(public readonly toolName: string) {
    super(`Unknown tool: ${toolName}`);
  }
}

// ── Transport ────────────────────────────────────────────────────────────────
function originAllowed(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser agents send no Origin
  try {
    return new URL(origin).host === req.headers.host || origin === env.CORS_ORIGIN;
  } catch {
    return false;
  }
}

function getMcpSession(req: Request): McpSession | null {
  const id = req.headers['mcp-session-id'];
  if (typeof id !== 'string') return null;
  const s = mcpSessions.get(id);
  if (!s) return null;
  if (!sessionStore.has(s.sessionId)) {
    mcpSessions.delete(id);
    return null;
  }
  return s;
}

async function handleMessage(msg: any, req: Request, res: Response): Promise<any | null> {
  const id: RpcId = msg && Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
  const isNotification = !msg || !Object.prototype.hasOwnProperty.call(msg, 'id');
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(id, -32600, 'Invalid Request');
  }

  switch (msg.method) {
    case 'initialize': {
      let issued;
      try {
        issued = sessionStore.issue(req.ip || 'unknown');
      } catch (err) {
        if (err instanceof SessionLimitError) return rpcError(id, -32000, err.message);
        throw err;
      }
      const record = sessionStore.verify(issued.sessionId, issued.sessionToken);
      const mcpSessionId = `mcp_${randomBytes(24).toString('base64url')}`;
      mcpSessions.set(mcpSessionId, {
        sessionId: issued.sessionId,
        userId: record!.userId,
        token: issued.sessionToken,
        createdAt: Date.now(),
      });
      const requested = msg.params?.protocolVersion;
      res.setHeader('Mcp-Session-Id', mcpSessionId);
      return rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return isNotification ? null : rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });
    case 'tools/call': {
      const session = getMcpSession(req);
      if (!session) return rpcError(id, -32001, 'Missing or unknown Mcp-Session-Id: call initialize first');
      const name = msg.params?.name;
      if (typeof name !== 'string') return rpcError(id, -32602, 'params.name required');
      try {
        const out = await runTool(name, msg.params?.arguments, req, session);
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(out.structured, null, 2) }],
          structuredContent: out.structured,
          ...(out.isError ? { isError: true } : {}),
        });
      } catch (err: any) {
        if (err instanceof UnknownToolError) return rpcError(id, -32602, err.message);
        if (err instanceof z.ZodError) {
          return rpcError(id, -32602, 'Invalid tool arguments', err.flatten());
        }
        // Domain errors (unknown product, over budget, …) are tool-level errors
        // the model can read and correct, not protocol failures.
        return rpcResult(id, {
          content: [{ type: 'text', text: String(err?.message ?? 'Tool failed') }],
          structuredContent: { error: String(err?.message ?? 'Tool failed') },
          isError: true,
        });
      }
    }
    default:
      if (isNotification) return null; // notifications/initialized, notifications/cancelled, …
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

router.post('/mcp', async (req, res, next) => {
  try {
    if (!originAllowed(req)) {
      return res.status(403).json(rpcError(null, -32000, 'Origin not allowed'));
    }
    const hit = limiter.hit(req.ip || 'unknown');
    if (!hit.allowed) {
      res.setHeader('Retry-After', String(hit.retryAfter));
      return res.status(429).json(rpcError(null, -32000, 'Rate limit exceeded'));
    }

    const body = req.body;
    // A tools/call carrying an unknown session id must 404 so clients re-initialize.
    const hasSessionHeader = typeof req.headers['mcp-session-id'] === 'string';
    if (hasSessionHeader && !getMcpSession(req)) {
      return res.status(404).json(rpcError(null, -32001, 'Unknown session; send initialize again'));
    }

    const messages = Array.isArray(body) ? body : [body];
    if (messages.length === 0 || messages.length > 10) {
      return res.status(400).json(rpcError(null, -32600, 'Invalid Request'));
    }
    const replies: any[] = [];
    for (const m of messages) {
      const reply = await handleMessage(m, req, res);
      if (reply) replies.push(reply);
    }
    if (replies.length === 0) return res.status(202).end();
    res.setHeader('Cache-Control', 'no-store');
    res.json(Array.isArray(body) ? replies : replies[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/mcp', (req, res) => {
  const id = req.headers['mcp-session-id'];
  if (typeof id === 'string') {
    const s = mcpSessions.get(id);
    if (s) {
      sessionStore.remove(s.sessionId);
      mcpSessions.delete(id);
      return res.status(200).json({ message: 'MCP session ended' });
    }
  }
  res.status(404).json({ error: 'Unknown session' });
});

// Streamable HTTP lets servers decline the optional SSE stream with 405.
router.get('/mcp', (_req, res) => {
  res.setHeader('Allow', 'POST, DELETE');
  res.status(405).json({
    error: 'This MCP server answers POST JSON-RPC requests only (Streamable HTTP, no SSE).',
    endpoint: '/api/mcp',
    tools: TOOLS.map((t) => t.name),
    docs: 'See README → "Agent-ready: MCP server".',
  });
});

export default router;

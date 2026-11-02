/**
 * FIX-04 (verification finding PP18): the order origin records WHO prepared the
 * cart, and only the server may decide it.
 *
 *   HUMAN        — nobody AI: the shopper built the cart in the storefront
 *   AI_ASSISTED  — the storefront chat assistant helped a human shopper
 *                  (routes/ai.ts marks the session once the cart is checkout-ready)
 *   AI_AGENT     — an external agent prepared the cart over MCP
 *                  (routes/mcp.ts marks the session inside prepare_cart)
 *
 * routes/orders.ts derives the origin from that server-side marker and consumes
 * it once, so:
 *   - a client-supplied `origin` in the body is ignored,
 *   - a second order in the same session cannot inherit a stale origin,
 *   - the dashboard can filter per origin and the AI-share KPI counts both AI
 *     origins (an agent-prepared cart is still an AI-prepared cart).
 */
import request from 'supertest';
import { newDb } from 'pg-mem';
import { createApp } from '../../src/app';
import { aiClient } from '../../src/ai/client';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import {
  clearAIPreparedSession,
  peekAIPreparedSession,
} from '../../src/ai/session-tracker';
import { OrderService } from '../../src/orders/service';
import { attachPersistence, detachPersistence, PoolLike } from '../../src/persistence/init';
import { writeQueue } from '../../src/persistence/registry';
import { resetIdempotencyMemory } from '../../src/middleware/idempotency';

jest.mock('../../src/ai/client', () => ({ aiClient: { chat: jest.fn() } }));
jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
    getOrder: jest.fn(),
    getRefund: jest.fn(),
  },
}));

const mockChat = aiClient.chat as jest.Mock;
const mockCreateOrder = paypalClient.createOrder as jest.Mock;

const app = createApp();
const orderService = OrderService.getInstance();

const CREATED = {
  id: 'PP-ORIGIN-1',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/checkoutnow?token=PP-ORIGIN-1' }],
};

/** Every PayPal order id is unique, exactly like the real API (and like the
 *  orders_paypal_order_id_uq index requires once persistence is attached). */
let ppSeq = 0;
const nextPayPalOrder = async () => {
  ppSeq += 1;
  return {
    ...CREATED,
    id: `PP-ORIGIN-${ppSeq}`,
    links: [{ rel: 'approve', href: `https://sandbox.paypal.com/checkoutnow?token=PP-ORIGIN-${ppSeq}` }],
  };
};

const COFFEE = [{ productId: 'coffee', quantity: 1 }];

const msg = (content: string, tool_calls: any = null) => ({
  choices: [{ message: { content, tool_calls } }],
});
const toolCall = (id: string, name: string, args: any) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

/** Creates an order through the real HTTP contract and returns the response. */
const createOrder = (s: TestSession, key: string, items = COFFEE) =>
  request(app)
    .post('/api/orders/create')
    .set(s.headers)
    .set('Idempotency-Key', key)
    .send({ items });

/** Drives the real MCP JSON-RPC surface and returns the structured tool output. */
async function mcpSession(): Promise<string> {
  const init = await request(app)
    .post('/api/mcp')
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
    });
  return init.headers['mcp-session-id'] as string;
}
const mcpCall = (sid: string, id: number, name: string, args: any) =>
  request(app)
    .post('/api/mcp')
    .set('Mcp-Session-Id', sid)
    .send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

let sess: TestSession;

beforeEach(async () => {
  resetSessionState();
  resetIdempotencyMemory();
  orderService.reset();
  sess = await newSession(app);
  clearAIPreparedSession(sess.sessionId);
  ppSeq = 0;
  mockChat.mockReset();
  mockCreateOrder.mockReset();
  mockCreateOrder.mockImplementation(nextPayPalOrder);
  // Default AI turn: a plain text answer, no tool calls.
  mockChat.mockResolvedValue(msg('Sure!', null));
});

describe('order origin attribution (FIX-04 / PP18)', () => {
  test('a plain storefront checkout is attributed to HUMAN', async () => {
    const res = await createOrder(sess, 'origin-human-001');

    expect(res.status).toBe(201);
    expect(res.body.origin).toBe('HUMAN');
    expect(orderService.getById(res.body.orderId)!.origin).toBe('HUMAN');
    // No AI touched this session, so no marker may exist.
    expect(peekAIPreparedSession(sess.sessionId)).toBeUndefined();
  });

  test('a client-supplied origin is ignored — the server decides', async () => {
    const res = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'origin-spoof-001')
      // Everything here is attacker-controlled: none of it may move the origin.
      // (A body sessionId that differs from the authenticated one is refused
      // outright by the session middleware — see session-auth.ts — so only the
      // origin/policyDecision spoof is exercised here.)
      .send({ items: COFFEE, origin: 'AI_AGENT', policyDecision: 'AUTO_ALLOW' });

    expect(res.status).toBe(201);
    expect(res.body.origin).toBe('HUMAN');
    expect(orderService.getById(res.body.orderId)!.origin).toBe('HUMAN');
  });

  test('an AI-chat-prepared cart is attributed to AI_ASSISTED and the marker is single-use', async () => {
    // Real storefront chat: the assistant calls prepare_cart, the cart becomes
    // checkout-ready, and routes/ai.ts marks the session as AI_ASSISTED.
    mockChat
      .mockResolvedValueOnce(
        msg('Preparing that', [toolCall('c1', 'prepare_cart', { items: [{ productId: 'coffee', quantity: 2 }] })])
      )
      .mockResolvedValueOnce(msg('Here is your cart. Proceed to checkout?', null));

    const chat = await request(app)
      .post('/api/ai/chat')
      .set(sess.headers)
      .send({ message: 'two coffees please' });

    expect(chat.status).toBe(200);
    expect(chat.body.checkoutReady).toBe(true);
    expect(peekAIPreparedSession(sess.sessionId)).toBe('AI_ASSISTED');

    const assisted = await createOrder(sess, 'origin-ai-assisted-001', [{ productId: 'coffee', quantity: 2 }]);
    expect(assisted.status).toBe(201);
    expect(assisted.body.origin).toBe('AI_ASSISTED');

    // One-time attribution token: the next order in the same session is HUMAN.
    expect(peekAIPreparedSession(sess.sessionId)).toBeUndefined();
    const second = await createOrder(sess, 'origin-ai-assisted-002');
    expect(second.status).toBe(201);
    expect(second.body.origin).toBe('HUMAN');
  });

  test('an MCP-prepared cart is attributed to AI_AGENT', async () => {
    const sid = await mcpSession();
    await mcpCall(sid, 2, 'prepare_cart', { items: COFFEE });

    const checkout = await mcpCall(sid, 3, 'start_checkout', { items: COFFEE });
    const out = checkout.body.result.structuredContent;

    expect(checkout.body.result.isError).toBeUndefined();
    expect(out.origin).toBe('AI_AGENT');
    expect(out.approvalUrl).toContain('sandbox.paypal.com');
    expect(orderService.getById(out.orderId)!.origin).toBe('AI_AGENT');
  });

  test('the dashboard can filter per origin and rejects an unknown one', async () => {
    // One order of each origin, all created through the real HTTP surface.
    await createOrder(sess, 'origin-filter-human');
    mockChat
      .mockResolvedValueOnce(msg('Preparing', [toolCall('c1', 'prepare_cart', { items: COFFEE })]))
      .mockResolvedValueOnce(msg('Ready', null));
    await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'coffee' });
    const assisted = await createOrder(sess, 'origin-filter-assisted');

    const sid = await mcpSession();
    await mcpCall(sid, 2, 'prepare_cart', { items: COFFEE });
    const agent = await mcpCall(sid, 3, 'start_checkout', { items: COFFEE });

    expect(assisted.body.origin).toBe('AI_ASSISTED');
    expect(agent.body.result.structuredContent.origin).toBe('AI_AGENT');

    const onlyAssisted = await request(app).get('/api/orders?origin=AI_ASSISTED');
    expect(onlyAssisted.status).toBe(200);
    expect(onlyAssisted.body.orders).toHaveLength(1);
    expect(onlyAssisted.body.orders[0].origin).toBe('AI_ASSISTED');

    const onlyAgent = await request(app).get('/api/orders?origin=AI_AGENT');
    expect(onlyAgent.body.orders.map((o: any) => o.id)).toEqual([agent.body.result.structuredContent.orderId]);

    const onlyHuman = await request(app).get('/api/orders?origin=HUMAN');
    expect(onlyHuman.body.orders.every((o: any) => o.origin === 'HUMAN')).toBe(true);
    expect(onlyHuman.body.orders).toHaveLength(1);

    const bogus = await request(app).get('/api/orders?origin=ROBOT');
    expect(bogus.status).toBe(400);
    expect(bogus.body.error).toContain('Invalid origin');
  });

  test('the AI-share KPI counts both AI origins, not only external agents', async () => {
    await createOrder(sess, 'kpi-human');
    mockChat
      .mockResolvedValueOnce(msg('Preparing', [toolCall('c1', 'prepare_cart', { items: COFFEE })]))
      .mockResolvedValueOnce(msg('Ready', null));
    await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'coffee' });
    await createOrder(sess, 'kpi-assisted');

    const sid = await mcpSession();
    await mcpCall(sid, 2, 'prepare_cart', { items: COFFEE });
    await mcpCall(sid, 3, 'start_checkout', { items: COFFEE });

    const stats = await request(app).get('/api/orders/stats');
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBe(3);
    // Both AI_ASSISTED and AI_AGENT count as AI-prepared.
    expect(stats.body.aiAssisted).toBe(2);
    expect(stats.body.aiAssistedPercentage).toBe(67);
  });
});

describe('order origin with PostgreSQL persistence (FIX-04 / PP18)', () => {
  // pg-mem runs the real migrations and the write queue is awaited for every
  // order, plus the restart re-attaches and reloads — comfortably over the 5s
  // default, and still an order of magnitude faster than a real PostgreSQL.
  jest.setTimeout(60_000);

  let pool: PoolLike;

  const newPool = (): PoolLike => {
    const { Pool } = newDb().adapters.createPg();
    return new Pool() as unknown as PoolLike;
  };

  beforeEach(async () => {
    pool = newPool();
    await attachPersistence(pool, { advisoryLock: false });
  });

  afterEach(async () => {
    await writeQueue.idle();
    detachPersistence();
    orderService.reset();
    resetIdempotencyMemory();
  });

  test('each origin is written to the database and survives a process restart', async () => {
    // One order per origin, created through the three real entry points.
    const human = await createOrder(sess, 'pg-origin-human');

    mockChat
      .mockResolvedValueOnce(msg('Preparing', [toolCall('c1', 'prepare_cart', { items: COFFEE })]))
      .mockResolvedValueOnce(msg('Ready', null));
    await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'coffee' });
    const assisted = await createOrder(sess, 'pg-origin-assisted');

    const sid = await mcpSession();
    await mcpCall(sid, 2, 'prepare_cart', { items: COFFEE });
    const agent = await mcpCall(sid, 3, 'start_checkout', { items: COFFEE });

    expect(human.body.origin).toBe('HUMAN');
    expect(assisted.body.origin).toBe('AI_ASSISTED');
    expect(agent.body.result.structuredContent.origin).toBe('AI_AGENT');

    await writeQueue.idle();

    // The origin is a real column, not a derived afterthought.
    const rows = (await pool.query('SELECT id, origin FROM orders')).rows as Array<{ id: string; origin: string }>;
    const byId = new Map(rows.map((r) => [r.id, r.origin]));
    expect(byId.get(human.body.orderId)).toBe('HUMAN');
    expect(byId.get(assisted.body.orderId)).toBe('AI_ASSISTED');
    expect(byId.get(agent.body.result.structuredContent.orderId)).toBe('AI_AGENT');

    // Process restart: memory wiped, state reloaded from PostgreSQL.
    orderService.reset();
    await attachPersistence(pool, { advisoryLock: false });

    const reloaded = orderService.getAll();
    expect(reloaded).toHaveLength(3);
    expect(reloaded.find((o) => o.id === human.body.orderId)!.origin).toBe('HUMAN');
    expect(reloaded.find((o) => o.id === assisted.body.orderId)!.origin).toBe('AI_ASSISTED');
    expect(reloaded.find((o) => o.id === agent.body.result.structuredContent.orderId)!.origin).toBe(
      'AI_AGENT'
    );

    // The KPI still separates the two AI origins after the reload.
    const stats = await request(app).get('/api/orders/stats');
    expect(stats.body.aiAssisted).toBe(2);
    expect(stats.body.total).toBe(3);
  });
});

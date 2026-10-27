import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { resetSessionState } from '../helpers/session';
import { resetMcpState } from '../../src/routes/mcp';
import { OrderService } from '../../src/orders/service';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn() },
}));
const mockCreateOrder = paypalClient.createOrder as jest.Mock;
const mockCaptureOrder = paypalClient.captureOrder as jest.Mock;

const app = createApp();
const CREATED = {
  id: 'MCP_PAYPAL_ORDER',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/checkoutnow?token=MCP' }],
};

let rpcId = 0;
async function rpc(method: string, params?: any, sessionId?: string, extra: Record<string, string> = {}) {
  const req = request(app).post('/api/mcp').set('Content-Type', 'application/json');
  if (sessionId) req.set('Mcp-Session-Id', sessionId);
  for (const [k, v] of Object.entries(extra)) req.set(k, v);
  return req.send({ jsonrpc: '2.0', id: ++rpcId, method, params });
}
async function init(): Promise<string> {
  const res = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  return res.headers['mcp-session-id'];
}
const call = (sid: string, name: string, args: any) => rpc('tools/call', { name, arguments: args }, sid);

beforeEach(() => {
  resetSessionState();
  resetMcpState();
  OrderService.getInstance().reset();
  mockCreateOrder.mockReset();
  mockCaptureOrder.mockReset();
  mockCreateOrder.mockResolvedValue(CREATED);
});

describe('MCP server (agentic commerce adapter)', () => {
  test('initialize negotiates the protocol and issues an unguessable session', async () => {
    const res = await rpc('initialize', { protocolVersion: '2025-06-18' });
    expect(res.status).toBe(200);
    expect(res.body.result.protocolVersion).toBe('2025-06-18');
    expect(res.body.result.capabilities.tools).toBeDefined();
    expect(res.body.result.serverInfo.name).toBe('ai-cafe-mcp');
    expect(res.body.result.instructions).toMatch(/cannot pay/i);
    expect(res.headers['mcp-session-id']).toMatch(/^mcp_[A-Za-z0-9_-]{30,}$/);
  });

  test('falls back to a supported protocol version for unknown clients', async () => {
    const res = await rpc('initialize', { protocolVersion: '1999-01-01' });
    expect(res.body.result.protocolVersion).toBe('2025-06-18');
  });

  test('exposes exactly five tools and NONE can capture or pay', async () => {
    const res = await rpc('tools/list');
    const names = res.body.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual(['check_policy', 'get_order_status', 'prepare_cart', 'search_menu', 'start_checkout']);
    for (const n of names) expect(n).not.toMatch(/capture|pay_|refund|charge/i);
    for (const t of res.body.result.tools) expect(t.inputSchema.type).toBe('object');
  });

  test('a payment-style tool name is rejected as unknown', async () => {
    const sid = await init();
    for (const name of ['capture_order', 'pay_order', 'refund_order']) {
      const res = await call(sid, name, { orderId: 'x' });
      expect(res.body.error.code).toBe(-32602);
    }
    expect(mockCaptureOrder).not.toHaveBeenCalled();
  });

  test('tools/call without a session is refused', async () => {
    const res = await rpc('tools/call', { name: 'search_menu', arguments: {} });
    expect(res.body.error.code).toBe(-32001);
  });

  test('an unknown Mcp-Session-Id gets 404 so clients re-initialize', async () => {
    const res = await rpc('tools/list', undefined, 'mcp_doesnotexist');
    expect(res.status).toBe(404);
  });

  test('notifications are acknowledged with 202 and no body', async () => {
    const res = await request(app).post('/api/mcp').send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(202);
    expect(res.text).toBe('');
  });

  test('unknown methods return -32601; malformed messages return -32600', async () => {
    expect((await rpc('resources/list')).body.error.code).toBe(-32601);
    const bad = await request(app).post('/api/mcp').send({ hello: 'world' });
    expect(bad.body.error.code).toBe(-32600);
  });

  test('foreign browser origins are rejected (DNS-rebinding guard)', async () => {
    const res = await rpc('tools/list', undefined, undefined, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  test('GET /api/mcp declines the SSE stream with 405', async () => {
    const res = await request(app).get('/api/mcp');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toContain('POST');
  });

  test('search_menu reaches all 7 categories (lunch was unreachable before)', async () => {
    const sid = await init();
    const res = await call(sid, 'search_menu', { category: 'lunch' });
    const out = res.body.result.structuredContent;
    expect(out.count).toBeGreaterThan(0);
    expect(out.products.every((p: any) => p.category === 'lunch')).toBe(true);
  });

  test('search_menu applies dietary needs as hard constraints', async () => {
    const sid = await init();
    const res = await call(sid, 'search_menu', { query: 'breakfast', dietary: ['vegan'] });
    const out = res.body.result.structuredContent;
    expect(out.products.every((p: any) => p.dietary.includes('vegan'))).toBe(true);
  });

  test('prepare_cart uses server prices and reports the policy decision', async () => {
    const sid = await init();
    const res = await call(sid, 'prepare_cart', {
      items: [{ productId: 'veg_breakfast', quantity: 1 }, { productId: 'coffee', quantity: 1 }],
    });
    const out = res.body.result.structuredContent;
    expect(out.totalMinor).toBe(1300);
    expect(out.policyDecision).toBe('REQUIRE_CONFIRMATION');
    expect(out.next_step).toMatch(/start_checkout/);
    expect(res.body.result.isError).toBeUndefined();
  });

  test('prepare_cart cannot be given a price (extra fields are ignored, totals stay server-owned)', async () => {
    const sid = await init();
    const res = await call(sid, 'prepare_cart', {
      items: [{ productId: 'coffee', quantity: 1, unitPriceMinor: 1, priceMinor: 1 }],
    });
    expect(res.body.result.structuredContent.totalMinor).toBe(300);
  });

  test('prepare_cart surfaces a BLOCK and tells the agent to shrink the cart', async () => {
    const sid = await init();
    const res = await call(sid, 'prepare_cart', { items: [{ productId: 'veg_breakfast', quantity: 3 }] });
    const out = res.body.result.structuredContent;
    expect(out.policyDecision).toBe('BLOCK');
    expect(out.next_step).toMatch(/Blocked/);
  });

  test('domain errors are tool errors the model can read, not protocol errors', async () => {
    const sid = await init();
    const res = await call(sid, 'prepare_cart', { items: [{ productId: 'nope', quantity: 1 }] });
    expect(res.body.error).toBeUndefined();
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toMatch(/not found/i);
  });

  test('invalid arguments produce a JSON-RPC invalid-params error', async () => {
    const sid = await init();
    const res = await call(sid, 'prepare_cart', { items: [{ productId: 'coffee', quantity: 0 }] });
    expect(res.body.error.code).toBe(-32602);
  });

  test('check_policy with an empty cart returns the shopper limits', async () => {
    const sid = await init();
    const res = await call(sid, 'check_policy', { items: [] });
    const out = res.body.result.structuredContent;
    expect(out.empty).toBe(true);
    expect(out.limits.maxPerPurchaseMinor).toBe(2000);
    expect(out.enforcedBy).toBe('server');
  });

  test('start_checkout returns a PayPal approval link, attributed to an AI agent, and never captures', async () => {
    const sid = await init();
    const items = [{ productId: 'veg_breakfast', quantity: 1 }, { productId: 'coffee', quantity: 1 }];
    await call(sid, 'prepare_cart', { items });
    const res = await call(sid, 'start_checkout', { items });
    const out = res.body.result.structuredContent;
    expect(res.body.result.isError).toBeUndefined();
    expect(out.approvalUrl).toBe('https://sandbox.paypal.com/checkoutnow?token=MCP');
    expect(out.origin).toBe('AI_AGENT');
    expect(out.status).toBe('PAYMENT_PENDING');
    expect(out.next_step).toMatch(/cannot capture/i);
    expect(mockCaptureOrder).not.toHaveBeenCalled();

    const status = await call(sid, 'get_order_status', { orderId: out.orderId });
    expect(status.body.result.structuredContent.paid).toBe(false);
    expect(status.body.result.structuredContent.status).toBe('PAYMENT_PENDING');
  });

  test('start_checkout is idempotent for the same cart', async () => {
    const sid = await init();
    const items = [{ productId: 'coffee', quantity: 1 }];
    const a = await call(sid, 'start_checkout', { items });
    const b = await call(sid, 'start_checkout', { items });
    expect(a.body.result.structuredContent.orderId).toBe(b.body.result.structuredContent.orderId);
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
  });

  test('start_checkout is refused by the server policy before PayPal is contacted', async () => {
    const sid = await init();
    const res = await call(sid, 'start_checkout', { items: [{ productId: 'veg_breakfast', quantity: 3 }] });
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.structuredContent.policyDecision).toBe('BLOCK');
    expect(res.body.result.structuredContent.httpStatus).toBe(403);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('one MCP session cannot read another session\'s order', async () => {
    const a = await init();
    const b = await init();
    const made = await call(a, 'start_checkout', { items: [{ productId: 'coffee', quantity: 1 }] });
    const orderId = made.body.result.structuredContent.orderId;
    const peek = await call(b, 'get_order_status', { orderId });
    expect(peek.body.result.isError).toBe(true);
    expect(peek.body.result.structuredContent.error).toBe('Order not found');
  });

  test('DELETE ends the session and its token stops working', async () => {
    const sid = await init();
    const del = await request(app).delete('/api/mcp').set('Mcp-Session-Id', sid);
    expect(del.status).toBe(200);
    const after = await rpc('tools/list', undefined, sid);
    expect(after.status).toBe(404);
  });
});

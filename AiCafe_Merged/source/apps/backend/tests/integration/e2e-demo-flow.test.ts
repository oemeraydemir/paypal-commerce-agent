import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { aiClient } from '../../src/ai/client';
import { executeTool } from '../../src/ai/tool-executor';
import { OrderService } from '../../src/orders/service';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
  },
}));
jest.mock('../../src/ai/client', () => ({
  aiClient: { chat: jest.fn() },
}));

const app = createApp();
const orderService = OrderService.getInstance();
const mockCreateOrder = paypalClient.createOrder as jest.Mock;
const mockCaptureOrder = paypalClient.captureOrder as jest.Mock;
const mockChat = aiClient.chat as jest.Mock;

let sess: TestSession;

const CREATED_PAYPAL = {
  id: 'PAYPAL-ORDER-001',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/approve' }],
};
const CAPTURED_PAYPAL = {
  id: 'PAYPAL-ORDER-001',
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'CAPTURE-001', status: 'COMPLETED', amount: { value: '13.00', currency_code: 'EUR' } }] } }],
};

const msg = (content: string, tool_calls: any = null) => ({
  choices: [{ message: { content, tool_calls } }],
});
const toolCall = (id: string, name: string, args: any) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('S11 E2E: Agent Control Center Full Demo Flow', () => {
  beforeEach(async () => {
    resetSessionState();
    sess = await newSession(app);
    jest.clearAllMocks();
    orderService.reset();
    policyStorage.reset();
    dailySpendTracker.reset();
    mockCreateOrder.mockResolvedValue(CREATED_PAYPAL);
    mockCaptureOrder.mockResolvedValue(CAPTURED_PAYPAL);
    mockChat.mockResolvedValue(msg('ok', null));
  });

  test('Full demo flow: BLOCK → retry → ALLOW → order → capture → Control Center', async () => {
    // ── Step 1: AI shopping attempt #1 — BLOCK (premium_cake exceeds €20 max) ──
    // The AI prepares a €45 cart. Policy blocks it.
    mockChat.mockResolvedValueOnce(
      msg('ok', [
        toolCall('c1', 'prepare_cart', {
          items: [{ productId: 'premium_cake', quantity: 1 }],
        }),
      ])
    );

    await executeTool(
      'prepare_cart',
      { items: [{ productId: 'premium_cake', quantity: 1 }] },
      { dietary: [] },
      { sessionId: sess.sessionId, userId: sess.userId }
    );

    // Verify BLOCK event was recorded
    let events = policyStorage.getEvents(sess.userId);
    expect(events).toHaveLength(1);
    expect(events[0].decision).toBe('BLOCK');
    expect(events[0].agent).toBe('AI_AGENT');

    // ── Step 2: AI retries — adjusts cart to €13 (AUTO_ALLOW / REQUIRE_CONFIRMATION) ──
    // AI prepares a €13 cart (veg_breakfast + coffee). 1300 > 1000 → REQUIRE_CONFIRMATION.
    mockChat.mockResolvedValueOnce(
      msg('ok', [
        toolCall('c2', 'prepare_cart', {
          items: [
            { productId: 'veg_breakfast', quantity: 1 },
            { productId: 'coffee', quantity: 1 },
          ],
        }),
      ])
    );

    await executeTool(
      'prepare_cart',
      {
        items: [
          { productId: 'veg_breakfast', quantity: 1 },
          { productId: 'coffee', quantity: 1 },
        ],
      },
      { dietary: [] },
      { sessionId: sess.sessionId, userId: sess.userId }
    );

    // Verify REQUIRE_CONFIRMATION event was recorded
    events = policyStorage.getEvents(sess.userId);
    const confirmationEvent = events.find(
      (e) => e.decision === 'REQUIRE_CONFIRMATION'
    );
    expect(confirmationEvent).toBeDefined();
    expect(confirmationEvent?.amountMinor).toBe(1300);

    // ── Step 3: User confirms → order creation via API ──
    const createRes = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'e2e-order-key')
      .send({
        items: [{ productId: 'veg_breakfast', quantity: 1 }, { productId: 'coffee', quantity: 1 }],
      });

    expect(createRes.status).toBe(201);
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);

    // ── Step 4: PayPal capture → PAID ──
    const captureRes = await request(app)
      .post(`/api/orders/${createRes.body.orderId}/capture`)
      .set(sess.headers);
    expect(captureRes.status).toBe(200);
    expect(captureRes.body.paypalStatus).toBe('COMPLETED');
    expect(captureRes.body.status).toBe('PAID');

    // ── Step 5: Control Center API verification ──
    // GET /api/policy-events
    const eventsRes = await request(app).get('/api/policy-events').query({ limit: 100 });
    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.total).toBe(3); // 2 advisory + 1 authoritative
    expect(eventsRes.body.events.length).toBe(3);

    // Events sorted newest-first
    const timestamps = eventsRes.body.events.map((e: any) => e.timestamp);
    const t0 = new Date(timestamps[0]).getTime();
    const t1 = new Date(timestamps[1]).getTime();
    const t2 = new Date(timestamps[2]).getTime();
    expect(t0).toBeGreaterThanOrEqual(t1);
    expect(t1).toBeGreaterThanOrEqual(t2);

    // Verify event types: BLOCK (advisory), REQUIRE_CONFIRMATION (advisory),
    // REQUIRE_CONFIRMATION (authoritative). 1300 > 1000 threshold → not AUTO_ALLOW.
    const decisions = eventsRes.body.events.map((e: any) => e.decision);
    expect(decisions).toContain('BLOCK');
    expect(decisions).toContain('REQUIRE_CONFIRMATION');

    // BLOCK event should have violations
    const blockEvent = eventsRes.body.events.find((e: any) => e.decision === 'BLOCK');
    expect(blockEvent.violatedRules.length).toBeGreaterThan(0);
    expect(blockEvent.violatedRules[0].type).toBe('MAX_PURCHASE_EXCEEDED');
    expect(blockEvent.reason).toBeDefined();

    // Authoritative REQUIRE_CONFIRMATION event should have an orderId
    const authoritativeEvent = eventsRes.body.events.find(
      (e: any) => e.orderId !== null
    );
    expect(authoritativeEvent).toBeDefined();
    expect(authoritativeEvent.orderId).toBe(createRes.body.orderId);
    expect(authoritativeEvent.agent).toBe('server');

    // ── Step 6: Control Center stats verification ──
    const statsRes = await request(app).get('/api/policy-events/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.totalRequests).toBe(3);
    expect(statsRes.body.allowed).toBe(2); // 2x REQUIRE_CONFIRMATION (non-BLOCK)
    expect(statsRes.body.blocked).toBe(1); // BLOCK
    expect(statsRes.body.spentMinor).toBe(1300); // PAID order total
    expect(statsRes.body.spentFormatted).toBe('€13.00');

    // ── Step 7: userId filtering on stats ──
    const filteredStatsRes = await request(app)
      .get('/api/policy-events/stats')
      .query({ userId: sess.userId });
    expect(filteredStatsRes.status).toBe(200);
    expect(filteredStatsRes.body.totalRequests).toBe(3);

    const otherUserStatsRes = await request(app)
      .get('/api/policy-events/stats')
      .query({ userId: 'other-user' });
    expect(otherUserStatsRes.status).toBe(200);
    expect(otherUserStatsRes.body.totalRequests).toBe(0);
    expect(otherUserStatsRes.body.spentMinor).toBe(0);
  });

  test('Control Center shows no spending when order is not PAID', async () => {
    // Create an order (ALLOW) but do NOT capture it → still PAYMENT_PENDING
    const createRes = await request(app)
      .post('/api/orders/create')
      .set(sess.headers)
      .set('Idempotency-Key', 'e2e-no-capture')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });

    expect(createRes.status).toBe(201);

    // Order exists with ALLOW event + orderId, but status is PAYMENT_PENDING
    const statsRes = await request(app).get('/api/policy-events/stats');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.totalRequests).toBe(1);
    expect(statsRes.body.allowed).toBe(1);
    expect(statsRes.body.blocked).toBe(0);
    // Spent must be 0 — order is NOT PAID
    expect(statsRes.body.spentMinor).toBe(0);
  });

  test('Dashboard HTML is served with required Agent Control Center markers', async () => {
    const res = await request(app).get('/dashboard.html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Agent Control Center');
    expect(res.text).toContain('ag-grid-community@33.0.0');
    expect(res.text).toContain('eventModal');
    expect(res.text).toContain('Demo-only');
    expect(res.text).toContain('badge-allow');
    expect(res.text).toContain('badge-block');
    expect(res.text).toContain('badge-confirm');
    // Sprint 6 CSP hardening: the dashboard's executable logic lives in a
    // same-origin external script (/dashboard.js) instead of an inline block,
    // so the HTML references it and carries no inline <script>.
    expect(res.text).toContain('<script src="/dashboard.js"></script>');
    expect(res.text).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);

    // The JS logic (AG Grid wiring, polling setInterval, policy-events fetches) now
    // executes from the external same-origin file permitted by CSP script-src.
    const js = await request(app).get('/dashboard.js');
    expect(js.status).toBe(200);
    expect(js.text).toContain('agGrid.createGrid');
    expect(js.text).toContain('setInterval');
    expect(js.text).toContain('policy-events');
  });
});

import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { aiClient } from '../../src/ai/client';
import { executeTool } from '../../src/ai/tool-executor';
import {
  markSessionAIPrepared,
  consumeAIPreparedSession,
} from '../../src/ai/session-tracker';
import { OrderService } from '../../src/orders/service';
import { OrderStatus } from '../../src/orders/domain';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { defaultPolicy, getDemoUserId } from '../../src/policy/default-policy';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// Mock PayPal + OpenAI — NO real network calls in this suite.
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

const USER_ID = getDemoUserId(); // user of direct (non-HTTP) executeTool calls
let sess: TestSession;

const CREATED_PAYPAL = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/approve' }],
};
const CAPTURED_PAYPAL = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'MOCK_CAPTURE_ID' }] } }],
};

const msg = (content: string, tool_calls: any = null) => ({
  choices: [{ message: { content, tool_calls } }],
});
const toolCall = (id: string, name: string, args: any) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

async function postCreate(
  sessionId: string,
  items: Array<{ productId: string; quantity: number }>,
  key: string,
  extra: Record<string, unknown> = {}
) {
  return request(app)
    .post('/api/orders/create')
    .set(sess.headers)
    .set('Idempotency-Key', key)
    .send({ items, ...extra });
}

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  jest.clearAllMocks();
  orderService.reset();
  policyStorage.reset();
  dailySpendTracker.reset();
  mockCreateOrder.mockResolvedValue(CREATED_PAYPAL);
  mockCaptureOrder.mockResolvedValue(CAPTURED_PAYPAL);
  // Default: no tool calls.
  mockChat.mockResolvedValue(msg('ok', null));
});

describe('S10 Policy Enforcement', () => {
  // ------------------------------------------------------------------
  // Advisory
  // ------------------------------------------------------------------
  describe('Advisory policy in prepare_cart', () => {
    test('1. allowed cart returns policy metadata', async () => {
      const result = await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 2 }] },
        { dietary: [] },
        { sessionId: 'advisory-1' }
      );

      expect(result.totalMinor).toBe(600);
      expect(result.policyDecision).toBe('AUTO_ALLOW');
      expect(result.policyViolations).toEqual([]);
      expect(result.requiresExplicitApproval).toBe(false);
      expect(result.retrySuggested).toBe(false);
    });

    test('2. blocked cart returns BLOCK metadata', async () => {
      const result = await executeTool(
        'prepare_cart',
        { items: [{ productId: 'premium_cake', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'advisory-2' }
      );

      expect(result.totalMinor).toBe(4500);
      expect(result.policyDecision).toBe('BLOCK');
      expect(result.policyViolations.map((v: any) => v.type)).toContain(
        'MAX_PURCHASE_EXCEEDED'
      );
      expect(result.retrySuggested).toBe(true);
      expect(result.requiresExplicitApproval).toBe(false);
      expect(result.reason).toBeDefined();
    });

    test('3. advisory BLOCK creates a PolicyEvent without orderId', async () => {
      const result = await executeTool(
        'prepare_cart',
        { items: [{ productId: 'premium_cake', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'advisory-3' }
      );

      const events = policyStorage.getEvents(USER_ID);
      const advisory = events.find((e) => e.cartId === result.cartId);
      expect(advisory).toBeDefined();
      expect(advisory?.orderId).toBeUndefined();
      expect(advisory?.decision).toBe('BLOCK');
    });

    test('4. advisory evaluation creates no reservation', async () => {
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 2 }] },
        { dietary: [] },
        { sessionId: 'advisory-4' }
      );

      expect(dailySpendTracker.getPendingReservations(USER_ID)).toBe(0);
      expect(dailySpendTracker.getSpentToday(USER_ID)).toBe(0);
    });

    test('5. REQUIRE_CONFIRMATION sets explicit-approval metadata', async () => {
      // veg_breakfast(1000) + coffee(300) = 1300 > 1000 threshold, < 2000 max.
      const result = await executeTool(
        'prepare_cart',
        { items: [{ productId: 'veg_breakfast', quantity: 1 }, { productId: 'coffee', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'advisory-5' }
      );

      expect(result.totalMinor).toBe(1300);
      expect(result.policyDecision).toBe('REQUIRE_CONFIRMATION');
      expect(result.requiresExplicitApproval).toBe(true);
      expect(result.retrySuggested).toBe(false);
      expect(result.policyViolations.map((v: any) => v.type)).toContain(
        'CONFIRMATION_THRESHOLD_EXCEEDED'
      );
    });
  });

  // ------------------------------------------------------------------
  // Authoritative
  // ------------------------------------------------------------------
  describe('Authoritative policy in /orders/create', () => {
    test('6. /orders/create re-evaluates policy server-side', async () => {
      const res = await postCreate('auth-6', [{ productId: 'coffee', quantity: 1 }], 'key-auth-6');

      expect(res.status).toBe(200);
      const events = policyStorage.getEvents(sess.userId);
      const auth = events.find((e) => e.orderId !== undefined);
      expect(auth).toBeDefined();
      expect(auth?.decision).toBe('AUTO_ALLOW');
      expect(auth?.cartId).toBeDefined();
    });

    test('7. BLOCK returns 403', async () => {
      const res = await postCreate('auth-7', [{ productId: 'premium_cake', quantity: 1 }], 'key-auth-7');

      expect(res.status).toBe(403);
      expect(res.body.policyDecision).toBe('BLOCK');
    });

    test('8. BLOCK creates no reservation', async () => {
      await postCreate('auth-8', [{ productId: 'premium_cake', quantity: 1 }], 'key-auth-8');

      expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(0);
    });

    test('9. BLOCK creates no PayPal order', async () => {
      await postCreate('auth-9', [{ productId: 'premium_cake', quantity: 1 }], 'key-auth-9');

      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    test('10. allowed cart creates a reservation before PayPal', async () => {
      const res = await postCreate('auth-10', [{ productId: 'coffee', quantity: 1 }], 'key-auth-10');

      expect(res.status).toBe(200);
      expect(mockCreateOrder).toHaveBeenCalledTimes(1);
      expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(300);
    });

    test('11. PayPal create failure releases the reservation', async () => {
      mockCreateOrder.mockRejectedValueOnce(new Error('PayPal down'));
      const res = await postCreate('auth-11', [{ productId: 'coffee', quantity: 1 }], 'key-auth-11');

      expect(res.status).toBe(500);
      expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(0);
      const created = orderService.getAll().find((o) => o.status === OrderStatus.ORDER_CANCELLED);
      expect(created).toBeDefined();
    });

    test('12. PayPal successful capture confirms reservation', async () => {
      const res = await postCreate('auth-12', [{ productId: 'coffee', quantity: 1 }], 'key-auth-12');
      expect(res.status).toBe(200);

      const capture = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);

      expect(capture.status).toBe(200);
      expect(capture.body.status).toBe('PAID');
      expect(capture.body.paypalStatus).toBe('COMPLETED');
      expect(dailySpendTracker.getSpentToday(sess.userId)).toBe(300);
      expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(0);
    });

    test('13. definitive PayPal capture failure releases reservation', async () => {
      const res = await postCreate('auth-13', [{ productId: 'coffee', quantity: 1 }], 'key-auth-13');
      mockCaptureOrder.mockRejectedValueOnce({
        details: [{ issue: 'INSTRUMENT_DECLINED' }],
      });

      const capture = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);

      expect(capture.status).toBe(402);
      expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(0);
      expect(orderService.getById(res.body.orderId)?.status).toBe(OrderStatus.PAYMENT_FAILED);
    });

    test('14. ambiguous PayPal/network failure does not blindly release reservation', async () => {
      const res = await postCreate('auth-14', [{ productId: 'coffee', quantity: 1 }], 'key-auth-14');
      mockCaptureOrder.mockRejectedValueOnce(new Error('network down'));

      const capture = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);

      expect(capture.status).toBe(502);
      // Reservation is intentionally LEFT pending — the capture may have succeeded remotely.
      expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(300);
      expect(orderService.getById(res.body.orderId)?.status).toBe(OrderStatus.PAYMENT_PENDING);
    });
  });

  // ------------------------------------------------------------------
  // Security
  // ------------------------------------------------------------------
  describe('Security: server-controlled authority', () => {
    test('15. client-supplied policyDecision is ignored', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set(sess.headers)
        .set('Idempotency-Key', 'key-sec-15')
        .send({
          items: [{ productId: 'coffee', quantity: 1 }],
          policyDecision: 'BLOCK',
        });

      expect(res.status).toBe(200);
    });

    test('16. client-supplied origin is ignored', async () => {
      const res = await request(app)
        .post('/api/orders/create')
        .set(sess.headers)
        .set('Idempotency-Key', 'key-sec-16')
        .send({
          items: [{ productId: 'coffee', quantity: 1 }],
          origin: 'AI_AGENT',
        });

      expect(res.status).toBe(200);
      expect(res.body.origin).toBe('HUMAN');
    });

    test('17. server derives AI origin from trusted session state', async () => {
      markSessionAIPrepared(sess.sessionId);

      const res = await request(app)
        .post('/api/orders/create')
        .set(sess.headers)
        .set('Idempotency-Key', 'key-sec-17')
        .send({ items: [{ productId: 'coffee', quantity: 1 }] });

      expect(res.status).toBe(200);
      expect(res.body.origin).toBe('AI_AGENT');
      // The marker is consumed (one-time) — a second order is HUMAN.
      expect(consumeAIPreparedSession(sess.sessionId)).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Daily limit / reservation lifecycle
  // ------------------------------------------------------------------
  describe('Daily limit & reservation lifecycle', () => {
    test('18. pending reservations count toward the daily limit', async () => {
      policyStorage.setPolicy({ ...defaultPolicy, userId: sess.userId, dailySpendLimitMinor: 1000 });

      // Three orders of 300 each (pending 0→300→600→900, all allowed).
      await postCreate('dl-18a', [{ productId: 'coffee', quantity: 1 }], 'key-dl-18a');
      await postCreate('dl-18b', [{ productId: 'coffee', quantity: 1 }], 'key-dl-18b');
      await postCreate('dl-18c', [{ productId: 'coffee', quantity: 1 }], 'key-dl-18c');
      expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(900);

      // 4th order: projected 0 + 900 (pending) + 300 = 1200 > 1000 → policy BLOCK.
      const res = await postCreate('dl-18d', [{ productId: 'coffee', quantity: 1 }], 'key-dl-18d');

      expect(res.status).toBe(403);
      expect(res.body.policyDecision).toBe('BLOCK');
      expect(res.body.violations.map((v: any) => v.type)).toContain('DAILY_LIMIT_EXCEEDED');
      expect(mockCreateOrder).toHaveBeenCalledTimes(3);
    });

    test('19. a second reservation exceeding the remaining limit is rejected', () => {
      expect(dailySpendTracker.tryReserve(USER_ID, 600, 1000)).not.toBeNull();
      expect(dailySpendTracker.tryReserve(USER_ID, 500, 1000)).toBeNull();
      expect(dailySpendTracker.getPendingReservations(USER_ID)).toBe(600);
    });

    test('20. reservation cancellation releases capacity', () => {
      const reservation = dailySpendTracker.tryReserve(USER_ID, 600, 1000);
      expect(reservation).not.toBeNull();

      dailySpendTracker.cancelReservation(reservation!.id);

      expect(dailySpendTracker.getPendingReservations(USER_ID)).toBe(0);
      expect(dailySpendTracker.tryReserve(USER_ID, 1000, 1000)).not.toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // AI retry
  // ------------------------------------------------------------------
  describe('AI retry on policy BLOCK', () => {
    test('21. first blocked prepare_cart causes another search/prepare attempt', async () => {
      mockChat
        .mockResolvedValueOnce(
          msg('ok', [
            toolCall('c1', 'prepare_cart', {
              items: [
                { productId: 'veg_breakfast', quantity: 2 },
                { productId: 'coffee', quantity: 2 },
              ],
            }),
          ])
        ) // 2000 + 600 = 2600 > 2000 → BLOCK
        .mockResolvedValueOnce(msg('ok', [toolCall('c2', 'search_products', { query: 'breakfast' })]))
        .mockResolvedValueOnce(
          msg('ok', [
            toolCall('c3', 'prepare_cart', {
              items: [
                { productId: 'veg_breakfast', quantity: 1 },
                { productId: 'coffee', quantity: 1 },
              ],
            }),
          ])
       ) // 1300 → REQUIRE_CONFIRMATION (allowed)
        .mockResolvedValueOnce(msg('Here is your cart, ready to checkout.', null));

      const res = await request(app)
        .post('/api/ai/chat').set(sess.headers)
        .set('Idempotency-Key', 'ai-21')
        .send({ message: 'Breakfast for 4, vegetarian' });

      expect(res.status).toBe(200);
      expect(res.body.checkoutReady).toBe(true);
      expect(res.body.toolRounds).toBeGreaterThanOrEqual(3);
      expect(res.body.preparedCart.totalMinor).toBe(1300);
    });

    test('22. retry count stops at 3 blocked policy attempts', async () => {
      mockChat
        .mockResolvedValueOnce(
          msg('ok', [toolCall('c1', 'prepare_cart', { items: [{ productId: 'premium_cake', quantity: 1 }] })])
        )
        .mockResolvedValueOnce(
          msg('ok', [toolCall('c2', 'prepare_cart', { items: [{ productId: 'premium_cake', quantity: 1 }] })])
        )
        .mockResolvedValueOnce(
          msg('ok', [toolCall('c3', 'prepare_cart', { items: [{ productId: 'premium_cake', quantity: 1 }] })])
        );

      const res = await request(app)
        .post('/api/ai/chat').set(sess.headers)
        .send({ message: 'I want the most expensive cake' });

      expect(res.status).toBe(200);
      // The service returns its own explanation after the 3rd BLOCK; no 4th call.
      expect(mockChat).toHaveBeenCalledTimes(3);
      expect(res.body.checkoutReady).toBe(false);
    });

    test('23. successful retry produces checkoutReady', async () => {
      mockChat
        .mockResolvedValueOnce(
          msg('ok', [toolCall('c1', 'prepare_cart', { items: [{ productId: 'premium_cake', quantity: 1 }] })])
        ) // BLOCK
        .mockResolvedValueOnce(
          msg('ok', [toolCall('c2', 'prepare_cart', { items: [{ productId: 'coffee', quantity: 2 }] })])
        ) // 600 → AUTO_ALLOW
        .mockResolvedValueOnce(msg('Done', null));

      const res = await request(app)
        .post('/api/ai/chat').set(sess.headers)
        .send({ message: 'find something cheaper' });

      expect(res.status).toBe(200);
      expect(res.body.checkoutReady).toBe(true);
      expect(res.body.preparedCart.totalMinor).toBe(600);
      expect(res.body.preparedCart.policyDecision).toBe('AUTO_ALLOW');
    });

    test('24. three blocked attempts return no checkout-ready cart', async () => {
      mockChat
        .mockResolvedValueOnce(
          msg('ok', [toolCall('c1', 'prepare_cart', { items: [{ productId: 'premium_cake', quantity: 1 }] })])
        )
        .mockResolvedValueOnce(
          msg('ok', [toolCall('c2', 'prepare_cart', { items: [{ productId: 'premium_cake', quantity: 1 }] })])
        )
        .mockResolvedValueOnce(
          msg('ok', [toolCall('c3', 'prepare_cart', { items: [{ productId: 'premium_cake', quantity: 1 }] })])
        );

      const res = await request(app)
        .post('/api/ai/chat').set(sess.headers)
        .send({ message: 'I keep wanting expensive things' });

      expect(res.status).toBe(200);
      expect(res.body.checkoutReady).toBe(false);
      expect(res.body.preparedCart).toBeNull();
      expect(res.body.response).toMatch(/blocked by the purchase policy/i);
    });
  });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  describe('Policy events', () => {
    test('25. advisory event has a cartId and no orderId', async () => {
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'event-25' }
      );

      const events = policyStorage.getEvents(USER_ID);
      const advisory = events.find((e) => e.cartId && e.orderId === undefined);
      expect(advisory).toBeDefined();
      expect(advisory?.sessionId).toBe('event-25');
    });

    test('26. authoritative event contains cartId + orderId', async () => {
      const res = await postCreate('event-26', [{ productId: 'coffee', quantity: 1 }], 'key-event-26');
      expect(res.status).toBe(200);

      const events = policyStorage.getEvents(sess.userId);
      const auth = events.find((e) => e.orderId === res.body.orderId);
      expect(auth).toBeDefined();
      expect(auth?.cartId).toBeDefined();
      expect(auth?.decision).toBe('AUTO_ALLOW');
    });

    test('27. reservation failure creates an authoritative BLOCK event', async () => {
      // Disabled policy => AUTO_ALLOW for the rules, but tryReserve still
      // enforces the (now low) daily budget → reservation failure (R20).
      policyStorage.setPolicy({ ...defaultPolicy, userId: sess.userId, enabled: false, dailySpendLimitMinor: 500 });

      const res = await postCreate(
        'event-27',
        [{ productId: 'premium_cake', quantity: 1 }],
        'key-event-27'
      );

      expect(res.status).toBe(403);
      const events = policyStorage.getEvents(sess.userId);
      const deny = events.find((e) => e.decision === 'BLOCK');
      expect(deny).toBeDefined();
      expect(deny?.orderId).toBeUndefined();
      expect(deny?.violatedRules.map((v) => v.type)).toContain('DAILY_LIMIT_EXCEEDED');
      expect(orderService.getById(res.body.orderId as string)).toBeUndefined();
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });
  });
});

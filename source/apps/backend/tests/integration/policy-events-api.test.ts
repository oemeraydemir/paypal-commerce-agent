import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { aiClient } from '../../src/ai/client';
import { executeTool } from '../../src/ai/tool-executor';
import { OrderService } from '../../src/orders/service';
import { getDemoUserId } from '../../src/policy/default-policy';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

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

const USER_ID = getDemoUserId();
let sess: TestSession;

const CREATED_PAYPAL = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'CREATED',
  links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/mock-approve' }],
};
const CAPTURED_PAYPAL = {
  id: 'MOCK_PAYPAL_ORDER_ID',
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'MOCK_CAPTURE_ID', status: 'COMPLETED', amount: { value: '3.00', currency_code: 'EUR' } }] } }],
};

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postCreate(
  sessionId: string,
  items: Array<{ productId: string; quantity: number }>,
  key: string
) {
  return request(app)
    .post('/api/orders/create')
    .set(sess.headers)
    .set('Idempotency-Key', key)
    .send({ items });
}

describe('Policy Events API', () => {
  beforeEach(async () => {
    resetSessionState();
    sess = await newSession(app);
    jest.clearAllMocks();
    orderService.reset();
    policyStorage.reset();
    dailySpendTracker.reset();
    mockCreateOrder.mockResolvedValue(CREATED_PAYPAL);
    mockCaptureOrder.mockResolvedValue(CAPTURED_PAYPAL);
  });

  describe('GET /api/policy-events', () => {
    test('1. empty response when no events exist', async () => {
      const res = await request(app).get('/api/policy-events');

      expect(res.status).toBe(200);
      expect(res.body.events).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    test('2. returns recorded events via application flow', async () => {
      // Advisory event via executeTool → prepare_cart (coffee: 300, AUTO_ALLOW)
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'test-2' }
      );

      const res = await request(app).get('/api/policy-events');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.events[0].decision).toBe('AUTO_ALLOW');
      expect(res.body.events[0].cartId).toBeDefined();
      expect(res.body.events[0].amountMinor).toBe(300);
      expect(res.body.events[0].amountFormatted).toBeDefined();
      expect(res.body.events[0].currency).toBe('EUR');
    });

    test('3. events returned newest-first', async () => {
      // Create three events with small delays so timestamps differ.
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'sort-3a' }
      );
      await delay(50);
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 2 }] },
        { dietary: [] },
        { sessionId: 'sort-3b' }
      );
      await delay(50);
      // BLOCK event (premium_cake: 4500 > 2000)
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'premium_cake', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'sort-3c' }
      );

      const res = await request(app).get('/api/policy-events');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      const timestamps = res.body.events.map((e: any) => e.timestamp);
      expect(new Date(timestamps[0]).getTime()).toBeGreaterThan(new Date(timestamps[2]).getTime());
      expect(new Date(timestamps[1]).getTime()).toBeGreaterThan(new Date(timestamps[2]).getTime());
      expect(new Date(timestamps[0]).getTime()).toBeGreaterThan(new Date(timestamps[1]).getTime());
    });

    test('4. userId filter returns only matching events', async () => {
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'user-filter-4' }
      );

      const resAll = await request(app).get('/api/policy-events').query({ userId: USER_ID });
      const resOther = await request(app).get('/api/policy-events').query({ userId: 'other-user' });

      expect(resAll.status).toBe(200);
      expect(resAll.body.total).toBe(1);
      // B1: the internal userId must NOT be exposed on the public endpoint.
      expect(resAll.body.events[0]).not.toHaveProperty('userId');
      expect(resAll.body.events[0].sessionId).toBeDefined();

      expect(resOther.status).toBe(200);
      expect(resOther.body.total).toBe(0);
      expect(resOther.body.events).toEqual([]);
    });

    test('5. decision filter returns only BLOCK events', async () => {
      // AUTO_ALLOW
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'dec-filter-5a' }
      );
      await delay(15);
      // BLOCK (premium_cake)
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'premium_cake', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'dec-filter-5b' }
      );

      const res = await request(app).get('/api/policy-events').query({ decision: 'BLOCK' });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.events[0].decision).toBe('BLOCK');
    });

    test('6. invalid decision returns 400', async () => {
      const res = await request(app).get('/api/policy-events').query({ decision: 'ALLOW' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid decision');
    });

    test('7. limit returns at most N events', async () => {
      for (let i = 0; i < 5; i++) {
        await executeTool(
          'prepare_cart',
          { items: [{ productId: 'coffee', quantity: 1 }] },
          { dietary: [] },
          { sessionId: `limit-${i}` }
        );
        await delay(20);
      }

      const res = await request(app).get('/api/policy-events').query({ limit: 3 });

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
    });

    test('8. invalid limit values return 400', async () => {
      const invalidValues = ['0', '-1', '1.5', 'abc', '101', 'NaN'];
      for (const val of invalidValues) {
        const res = await request(app).get('/api/policy-events').query({ limit: val });
        expect(res.status).toBe(400);
      }
    });

    test('9. events include all expected fields', async () => {
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'premium_cake', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'fields-9' }
      );

      const res = await request(app).get('/api/policy-events');

      expect(res.status).toBe(200);
      const event = res.body.events[0];
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('timestamp');
      // B1: userId is intentionally NOT exposed; the masked sessionId is.
      expect(event).not.toHaveProperty('userId');
      expect(event).toHaveProperty('sessionId');
      expect(event).toHaveProperty('cartId');
      expect(event).toHaveProperty('orderId');
      expect(event).toHaveProperty('agent');
      expect(event).toHaveProperty('amountMinor');
      expect(event).toHaveProperty('amountFormatted');
      expect(event).toHaveProperty('currency');
      expect(event).toHaveProperty('decision');
      expect(event).toHaveProperty('violatedRules');
      expect(event).toHaveProperty('reason');
      expect(event).toHaveProperty('policySnapshot');
    });
  });

  describe('GET /api/policy-events/stats', () => {
    test('10. stats returned with correct counts', async () => {
      // AUTO_ALLOW (coffee 300)
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'stats-10a' }
      );
      await delay(15);
      // BLOCK (premium_cake 4500)
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'premium_cake', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'stats-10b' }
      );

      const res = await request(app).get('/api/policy-events/stats');

      expect(res.status).toBe(200);
      expect(res.body.totalRequests).toBe(2);
      expect(res.body.allowed).toBe(1);
      expect(res.body.blocked).toBe(1);
      expect(res.body.spentMinor).toBe(0);
      expect(res.body.spentFormatted).toBeDefined();
    });

    test('11. BLOCK events do not count as allowed', async () => {
      // Two BLOCK events
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'premium_cake', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'no-allow-11a' }
      );
      await delay(15);
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'premium_cake', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'no-allow-11b' }
      );

      const res = await request(app).get('/api/policy-events/stats');

      expect(res.status).toBe(200);
      expect(res.body.totalRequests).toBe(2);
      expect(res.body.allowed).toBe(0);
      expect(res.body.blocked).toBe(2);
    });

    test('12. REQUIRE_CONFIRMATION counts as non-BLOCK (allowed)', async () => {
      // veg_breakfast (1000) + coffee (300) = 1300 > 1000 threshold → REQUIRE_CONFIRMATION
      await executeTool(
        'prepare_cart',
        {
          items: [
            { productId: 'veg_breakfast', quantity: 1 },
            { productId: 'coffee', quantity: 1 },
          ],
        },
        { dietary: [] },
        { sessionId: 'rc-12' }
      );

      const res = await request(app).get('/api/policy-events/stats');

      expect(res.status).toBe(200);
      expect(res.body.totalRequests).toBe(1);
      expect(res.body.allowed).toBe(1);
      expect(res.body.blocked).toBe(0);
    });

    test('13. spent only reflects successfully paid (PAID) orders', async () => {
      // Create an order → ALLOW event with orderId, then capture → PAID
      const createRes = await postCreate(
        'spent-13',
        [{ productId: 'coffee', quantity: 1 }],
        'key-spent-13'
      );
      expect(createRes.status).toBe(201);

      // Stats BEFORE capture: order exists but is not PAID, so spent = 0
      let stats = await request(app).get('/api/policy-events/stats');
      expect(stats.status).toBe(200);
      expect(stats.body.spentMinor).toBe(0);

      // Capture → PAID
      const captureRes = await request(app).post(`/api/orders/${createRes.body.orderId}/capture`).set(sess.headers);
      expect(captureRes.status).toBe(200);

      // Stats AFTER capture: order is PAID, spent = 300
      stats = await request(app).get('/api/policy-events/stats');
      expect(stats.status).toBe(200);
      expect(stats.body.spentMinor).toBe(300);
    });

    test('14. same order is not double-counted in spending', async () => {
      const createRes = await postCreate(
        'dedup-14',
        [{ productId: 'coffee', quantity: 1 }],
        'key-dedup-14'
      );
      expect(createRes.status).toBe(201);

      const captureRes = await request(app).post(`/api/orders/${createRes.body.orderId}/capture`).set(sess.headers);
      expect(captureRes.status).toBe(200);

      // Manually add a second policy event referencing the same paid order.
      const originalEvents = policyStorage.getEvents(sess.userId); // events are per-session user now
      const originalEvent = originalEvents.find((e) => e.orderId === createRes.body.orderId);
      expect(originalEvent).toBeDefined();

      policyStorage.addEvent({
        ...originalEvent!,
        id: `${originalEvent!.id}-duplicate`,
        timestamp: new Date().toISOString(),
      });

      const stats = await request(app).get('/api/policy-events/stats');
      expect(stats.status).toBe(200);
      // spent should still be 300, not 600
      expect(stats.body.spentMinor).toBe(300);
    });

    test('15. userId filtering applies to stats', async () => {
      // Events are for USER_ID (demo-user-001)
      await executeTool(
        'prepare_cart',
        { items: [{ productId: 'coffee', quantity: 1 }] },
        { dietary: [] },
        { sessionId: 'uid-stats-15' }
      );

      const resDemo = await request(app).get('/api/policy-events/stats').query({ userId: USER_ID });
      const resOther = await request(app).get('/api/policy-events/stats').query({ userId: 'other-user' });

      expect(resDemo.status).toBe(200);
      expect(resDemo.body.totalRequests).toBe(1);

      expect(resOther.status).toBe(200);
      expect(resOther.body.totalRequests).toBe(0);
      expect(resOther.body.spentMinor).toBe(0);
    });
  });
});

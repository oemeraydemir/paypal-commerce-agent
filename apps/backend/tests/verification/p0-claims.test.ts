/**
 * VERIFICATION SUITE for the review's P0 claims.
 *
 * CLAIM 1 (reservation lifecycle) was fixed in Phase-1 Step 1: its tests now
 * assert the CORRECTED behaviour (they used to characterize the leak).
 * CLAIMS 2-5 still characterize CURRENT behaviour and are flipped when
 * Steps 2-5 land.
 */
import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { aiClient } from '../../src/ai/client';
import { aiService } from '../../src/ai/service';
import { OrderService } from '../../src/orders/service';
import { OrderStatus } from '../../src/orders/domain';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { defaultPolicy, getDemoUserId } from '../../src/policy/default-policy';
import catalog from '../../src/catalog/data.json';
import { reconcileExpiredReservations } from '../../src/orders/payment-lifecycle';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
    getOrder: jest.fn(),
    verifyWebhookSignature: jest.fn(),
  },
}));
jest.mock('../../src/ai/client', () => ({ aiClient: { chat: jest.fn() } }));

const app = createApp();
const orderService = OrderService.getInstance();
const createOrder = paypalClient.createOrder as jest.Mock;
const captureOrder = paypalClient.captureOrder as jest.Mock;
const getOrder = (paypalClient as any).getOrder as jest.Mock;
const verifySig = (paypalClient as any).verifyWebhookSignature as jest.Mock;
const mockChat = aiClient.chat as jest.Mock;
const USER = getDemoUserId();

let seq = 0;
const nextPayPalId = () => `PP-ORDER-${++seq}`;

async function create(sessionId: string, items: any[]) {
  const ppId = nextPayPalId();
  createOrder.mockResolvedValueOnce({
    id: ppId,
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/approve' }],
  });
  const res = await request(app)
    .post('/api/orders/create')
    .set('Idempotency-Key', `k-${sessionId}-${++seq}`)
    .send({ sessionId, items });
  return { res, ppId };
}

async function webhook(eventType: string, ppId: string) {
  return request(app)
    .post('/api/webhooks/paypal')
    .set('Content-Type', 'application/json')
    .set('paypal-transmission-id', 't')
    .set('paypal-transmission-time', new Date().toISOString())
    .set('paypal-transmission-sig', 's')
    .set('paypal-cert-url', 'https://example.com/c')
    .set('paypal-auth-algo', 'SHA256withRSA')
    .send({
      id: `WH-${++seq}`,
      event_type: eventType,
      resource: { supplementary_data: { related_ids: { order_id: ppId } } },
    });
}

const COMPLETED = {
  id: 'x',
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'CAP-1' }] } }],
};

beforeEach(() => {
  jest.clearAllMocks();
  createOrder.mockReset();
  captureOrder.mockReset();
  getOrder.mockReset();
  jest.useRealTimers();
  orderService.reset();
  policyStorage.reset();
  dailySpendTracker.reset();
  verifySig.mockResolvedValue({ verification_status: 'SUCCESS' });
  captureOrder.mockResolvedValue(COMPLETED);
  mockChat.mockResolvedValue({ choices: [{ message: { content: 'ok', tool_calls: null } }] });
});

const paypalOrder = (status: string, captureStatus?: string, captureId = 'CAP-X') => ({
  id: 'x',
  status,
  purchaseUnits: [
    { payments: { captures: captureStatus ? [{ id: captureId, status: captureStatus }] : [] } },
  ],
});
const DAY = 24 * 60 * 60 * 1000;

describe('CLAIM 1 - reservation lifecycle (FIXED in Phase-1 Step 1)', () => {
  test('1a DENIED webhook releases the reservation and never un-spends a PAID order', async () => {
    const { res, ppId } = await create('s1a', [{ productId: 'coffee', quantity: 2 }]);
    expect(res.status).toBe(200);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600);

    const wh = await webhook('PAYMENT.CAPTURE.DENIED', ppId);
    expect(wh.status).toBe(200);
    expect(orderService.getByPayPalOrderId(ppId)!.status).toBe(OrderStatus.PAYMENT_FAILED);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(0);

    // Replayed DENIED (new event id) is a harmless no-op.
    expect((await webhook('PAYMENT.CAPTURE.DENIED', ppId)).status).toBe(200);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);

    // A DENIED event for an order that is already PAID must not un-spend it.
    const paid = await create('s1a-paid', [{ productId: 'coffee', quantity: 1 }]);
    expect((await request(app).post(`/api/orders/${paid.res.body.orderId}/capture`)).status).toBe(200);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(300);
    expect((await webhook('PAYMENT.CAPTURE.DENIED', paid.ppId)).status).toBe(200);
    expect(orderService.getById(paid.res.body.orderId)!.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(300);
  });

  test('1b COMPLETED webhook marks PAID AND confirms the reservation exactly once', async () => {
    const { ppId } = await create('s1b', [{ productId: 'coffee', quantity: 2 }]);
    expect((await webhook('PAYMENT.CAPTURE.COMPLETED', ppId)).status).toBe(200);
    expect(orderService.getByPayPalOrderId(ppId)!.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);

    // Duplicate delivery (different event id) does not double count.
    expect((await webhook('PAYMENT.CAPTURE.COMPLETED', ppId)).status).toBe(200);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
  });

  test('1c pending reservations now expire: after TTL and a PayPal lookup showing NOT approved', async () => {
    const { res } = await create('s1c', [{ productId: 'coffee', quantity: 2 }]);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600);
    getOrder.mockResolvedValue(paypalOrder('CREATED'));

    const summary = await reconcileExpiredReservations({ now: Date.now() + 3 * DAY });
    expect(summary.released).toBe(1);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.ORDER_CANCELLED);
  });

  test('1c-unit confirmed spend resets on a new UTC day (unchanged), pending is cleared only by reconcile', () => {
    jest.useFakeTimers({ now: new Date('2026-10-09T10:00:00Z') });
    const b = dailySpendTracker.tryReserve(USER, 300, 10000)!;
    dailySpendTracker.tryReserve(USER, 600, 10000)!;
    dailySpendTracker.confirmReservation(b.id);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(300);
    jest.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    expect(dailySpendTracker.getSpentToday(USER)).toBe(0);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600); // freed by reconciler, not by the clock
  });

  test('1d ambiguous capture (502) keeps the reservation; reconcile never releases on lookup failure, then settles on COMPLETED', async () => {
    const { res } = await create('s1d', [{ productId: 'coffee', quantity: 2 }]);
    captureOrder.mockRejectedValueOnce(new Error('ECONNRESET'));
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`);
    expect(cap.status).toBe(502);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAYMENT_PENDING);

    const later = { now: Date.now() + 2 * DAY };
    getOrder.mockRejectedValueOnce(new Error('PayPal down'));
    const failed = await reconcileExpiredReservations(later);
    expect(failed.errors).toBe(1);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600); // NOT released

    getOrder.mockResolvedValueOnce(paypalOrder('COMPLETED', 'COMPLETED', 'CAP-LOST'));
    const ok = await reconcileExpiredReservations(later);
    expect(ok.examined).toBe(1);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAID);
    expect(orderService.getById(res.body.orderId)!.paypalCaptureId).toBe('CAP-LOST');
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });

  test('1e capture returning PENDING keeps the reservation; the COMPLETED webhook then confirms it', async () => {
    const { res, ppId } = await create('s1e', [{ productId: 'coffee', quantity: 2 }]);
    captureOrder.mockResolvedValueOnce({ ...COMPLETED, status: 'PENDING' });
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`);
    expect(cap.status).toBe(200);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600);
    await webhook('PAYMENT.CAPTURE.COMPLETED', ppId);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
  });

  test('1f checkout cancel: GET page stays side-effect free; POST /cancel releases only after PayPal confirms', async () => {
    const { res } = await create('s1f', [{ productId: 'coffee', quantity: 2 }]);
    const id = res.body.orderId;

    const page = await request(app).get('/api/checkout/cancel?token=whatever');
    expect(page.status).toBe(200);
    expect(orderService.getById(id)!.status).toBe(OrderStatus.PAYMENT_PENDING); // GET never mutates

    getOrder.mockRejectedValueOnce(new Error('PayPal down'));
    const unverifiable = await request(app).post(`/api/orders/${id}/cancel`);
    expect(unverifiable.status).toBe(502);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600); // not released blindly

    getOrder.mockResolvedValueOnce(paypalOrder('APPROVED'));
    const cancelled = await request(app).post(`/api/orders/${id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe(OrderStatus.ORDER_CANCELLED);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);

    // Idempotent.
    expect((await request(app).post(`/api/orders/${id}/cancel`)).status).toBe(200);
  });

  test('1f-2 cancel is refused (and settled as PAID) when PayPal says the money was already captured', async () => {
    const { res } = await create('s1f2', [{ productId: 'coffee', quantity: 2 }]);
    getOrder.mockResolvedValueOnce(paypalOrder('COMPLETED', 'COMPLETED'));
    const cancel = await request(app).post(`/api/orders/${res.body.orderId}/cancel`);
    expect(cancel.status).toBe(409);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });

  test('1g capture before buyer approval is RECOVERABLE: order stays pending, retry after approval succeeds', async () => {
    const { res } = await create('s1g', [{ productId: 'coffee', quantity: 2 }]);
    captureOrder.mockRejectedValueOnce({ details: [{ issue: 'ORDER_NOT_APPROVED' }] });
    const first = await request(app).post(`/api/orders/${res.body.orderId}/capture`);
    expect(first.status).toBe(400);
    expect(first.body.details).toMatchObject({ paypalIssue: 'ORDER_NOT_APPROVED', retryable: true });
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600); // kept

    // Buyer now approves in PayPal; the app retries capture:
    const retry = await request(app).post(`/api/orders/${res.body.orderId}/capture`);
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });
});

describe('CLAIM 2 - rate limit and authentication', () => {
  test('2a rate limit is keyed by client-supplied sessionId: same id throttled, fresh ids never', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post('/api/ai/chat').send({ sessionId: 'same', message: 'hi' });
      expect(r.status).toBe(200);
    }
    const eleventh = await request(app).post('/api/ai/chat').send({ sessionId: 'same', message: 'hi' });
    expect(eleventh.status).toBe(429);

    let ok = 0;
    for (let i = 0; i < 40; i++) {
      const r = await request(app).post('/api/ai/chat').send({ sessionId: `fresh-${i}`, message: 'hi' });
      if (r.status === 200) ok++;
    }
    expect(ok).toBe(40); // 40 OpenAI calls from one client in one burst, zero throttling
    expect(mockChat).toHaveBeenCalledTimes(50);
  });

  test('2b /api/orders and policy-events need no credentials and expose sessionIds', async () => {
    await create('victim-session-123', [{ productId: 'coffee', quantity: 1 }]);
    const list = await request(app).get('/api/orders'); // no auth headers at all
    expect(list.status).toBe(200);
    expect(list.body.orders[0].sessionId).toBe('victim-session-123');
    const ev = await request(app).get('/api/policy-events');
    expect(ev.status).toBe(200);
    expect(JSON.stringify(ev.body)).toContain('victim-session-123');
  });

  test('2c capture needs no credentials and no session match', async () => {
    const { res } = await create('owner-session', [{ productId: 'coffee', quantity: 1 }]);
    // A caller who only learned the orderId (e.g. from GET /api/orders):
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`);
    expect(cap.status).toBe(200);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAID);
    // NUANCE: PayPal itself refuses capture until the buyer approved (mocked here).
  });
});

describe('CLAIM 3 - global shared daily limit', () => {
  test('3a spend by one session blocks a completely different session', async () => {
    for (let i = 0; i < 5; i++) {
      const { res } = await create(`judge-A-${i}`, [{ productId: 'veg_breakfast', quantity: 2 }]); // 2000
      expect(res.status).toBe(200);
      const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`);
      expect(cap.status).toBe(200);
    }
    expect(dailySpendTracker.getSpentToday(USER)).toBe(10000);

    const other = await create('judge-B-brand-new-session', [{ productId: 'coffee', quantity: 1 }]); // 300
    expect(other.res.status).toBe(403);
    expect(JSON.stringify(other.res.body)).toContain('DAILY_LIMIT_EXCEEDED');
  });

  test('3b same single policy object is used for every session', async () => {
    await create('p-A', [{ productId: 'coffee', quantity: 1 }]);
    await create('p-B', [{ productId: 'coffee', quantity: 1 }]);
    const users = new Set(policyStorage.getEvents().map((e) => e.userId));
    expect([...users]).toEqual([USER]);
  });
});

describe('CLAIM 4 - hardcoded policy text in ai/service.ts', () => {
  test('4a exhausted-retry message ignores the real policy', async () => {
    policyStorage.setPolicy({ ...defaultPolicy, maxPerPurchaseMinor: 1500, blockedDietaryAttributes: [] });
    let n = 0;
    mockChat.mockImplementation(async () => ({
      choices: [{
        message: {
          content: '',
          tool_calls: [{
            id: `c${++n}`, type: 'function',
            function: { name: 'prepare_cart', arguments: JSON.stringify({ items: [{ productId: 'gift_box', quantity: 1 }] }) },
          }],
        },
      }],
    }));
    const res = await request(app).post('/api/ai/chat').send({ sessionId: 's4a', message: 'gift' });
    expect(res.status).toBe(200);
    // Real policy: max EUR 15.00, no alcohol rule. Message still says:
    expect(res.body.response).toContain('max €20.00 per purchase');
    expect(res.body.response).toContain('no alcohol items');
  });

  test('4b the system prompt contains no policy values at all', () => {
    const prompt: string = (aiService as any).systemPrompt;
    expect(prompt).not.toMatch(/policy|alcohol|€|20\.00/i);
  });
});

describe('CLAIM 5 - demo scenario vs catalog', () => {
  const price = (id: string) => (catalog as any).products.find((p: any) => p.id === id).priceMinor;

  test('5a veg_breakfast + coffee = 1300 minor (EUR 13.00), not 1890', () => {
    expect(price('veg_breakfast') + price('coffee')).toBe(1300);
  });

  test('5b NO combination of catalog items (qty 0..8 each) sums to 1890', () => {
    const prices: number[] = (catalog as any).products.map((p: any) => p.priceMinor);
    const reachable = new Set<number>([0]);
    let layer = new Set<number>([0]);
    for (const p of prices) {
      const next = new Set<number>();
      for (const base of layer) for (let q = 0; q <= 8; q++) next.add(base + p * q);
      layer = next;
    }
    expect(layer.has(1890)).toBe(false);
    expect(reachable.size).toBe(1);
  });
});

/**
 * VERIFICATION SUITE for the review's P0 claims.
 *
 * CLAIM 1 (reservation lifecycle) was fixed in Phase-1 Step 1: its tests now
 * assert the CORRECTED behaviour (they used to characterize the leak).
 * CLAIMS 2 and 3 (authentication / rate limit / shared global budget) were
 * fixed in Phase-1 Step 2 (server-issued sessions): they now assert the
 * CORRECTED behaviour. CLAIM 4 (hardcoded policy text) was fixed in Sprint 1:
 * the exhausted-retry message is now derived from the shopper's real policy.
 * CLAIM 5 still characterizes CURRENT behaviour and is flipped when its step lands.
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
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { aiChatLimiters } from '../../src/routes/ai';
import { sessionStore } from '../../src/session';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
    getOrder: jest.fn(),
    refundCapture: jest.fn(),
    getRefund: jest.fn(),
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
let USER = getDemoUserId(); // reassigned to the per-test session's user
let sess: TestSession;

let seq = 0;
const nextPayPalId = () => `PP-ORDER-${++seq}`;

async function create(label: string, items: any[], who: TestSession = sess) {
  const ppId = nextPayPalId();
  createOrder.mockResolvedValueOnce({
    id: ppId,
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/approve' }],
  });
  const res = await request(app)
    .post('/api/orders/create')
    .set(who.headers)
    .set('Idempotency-Key', `k-${label}-${++seq}`)
    .send({ items });
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
      resource: {
        ...(eventType === 'PAYMENT.CAPTURE.COMPLETED'
          ? { id: 'CAP-WH', status: 'COMPLETED', amount: amountOf(ppId) }
          : {}),
        supplementary_data: { related_ids: { order_id: ppId } },
      },
    });
}

// PayPal's capture evidence carries the captured amount and currency; the settlement gate requires both.
// Totals differ per test, so the amount is read from the server-owned order that belongs to the PayPal id.
const amountOf = (ppId: string) => {
  const o = orderService.getByPayPalOrderId(ppId);
  return o ? { value: (o.totalMinor / 100).toFixed(2), currency_code: o.currency } : undefined;
};
const completedFor = (ppId: string) => ({
  id: 'x',
  status: 'COMPLETED',
  purchaseUnits: [{ payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED', amount: amountOf(ppId) }] } }],
});

beforeEach(async () => {
  // Restore real timers FIRST: a preceding test (e.g. 1c-unit) may leave fake
  // timers installed, and a session minted under a stale fake clock would be
  // idle-expired once the real clock returns (401 instead of the intended 502).
  jest.useRealTimers();
  resetSessionState();
  sess = await newSession(app);
  USER = sess.userId;
  jest.clearAllMocks();
  createOrder.mockReset();
  captureOrder.mockReset();
  getOrder.mockReset();
  orderService.reset();
  policyStorage.reset();
  dailySpendTracker.reset();
  verifySig.mockResolvedValue({ verification_status: 'SUCCESS' });
  captureOrder.mockImplementation(async (ppId: string) => completedFor(ppId));
  mockChat.mockResolvedValue({ choices: [{ message: { content: 'ok', tool_calls: null } }] });
});

const paypalOrder = (status: string, captureStatus?: string, captureId = 'CAP-X') => ({
  id: 'x',
  status,
  purchaseUnits: [
    { payments: { captures: captureStatus ? [{ id: captureId, status: captureStatus, amount: { value: '6.00', currency_code: 'EUR' } }] : [] } },
  ],
});
const DAY = 24 * 60 * 60 * 1000;

describe('CLAIM 1 - reservation lifecycle (FIXED in Phase-1 Step 1)', () => {
  test('1a DENIED webhook releases the reservation and never un-spends a PAID order', async () => {
    const { res, ppId } = await create('s1a', [{ productId: 'coffee', quantity: 2 }]);
    expect(res.status).toBe(201);
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
    expect((await request(app).post(`/api/orders/${paid.res.body.orderId}/capture`).set(sess.headers)).status).toBe(200);
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
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
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
    captureOrder.mockResolvedValueOnce({ ...completedFor(ppId), status: 'PENDING' });
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
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
    const unverifiable = await request(app).post(`/api/orders/${id}/cancel`).set(sess.headers);
    expect(unverifiable.status).toBe(502);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600); // not released blindly

    getOrder.mockResolvedValueOnce(paypalOrder('APPROVED'));
    const cancelled = await request(app).post(`/api/orders/${id}/cancel`).set(sess.headers);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe(OrderStatus.ORDER_CANCELLED);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);

    // Idempotent.
    expect((await request(app).post(`/api/orders/${id}/cancel`).set(sess.headers)).status).toBe(200);
  });

  test('1f-2 cancel is refused (and settled as PAID) when PayPal says the money was already captured', async () => {
    const { res } = await create('s1f2', [{ productId: 'coffee', quantity: 2 }]);
    getOrder.mockResolvedValueOnce(paypalOrder('COMPLETED', 'COMPLETED'));
    const cancel = await request(app).post(`/api/orders/${res.body.orderId}/cancel`).set(sess.headers);
    expect(cancel.status).toBe(409);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });

  test('1d-2 reconciliation with a COMPLETED capture that carries NO amount leaves the order pending and writes no spend', async () => {
    const { res } = await create('s1d2', [{ productId: 'coffee', quantity: 2 }]);
    captureOrder.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect((await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers)).status).toBe(502);
    const later = { now: Date.now() + 2 * DAY };
    getOrder.mockResolvedValueOnce({
      status: 'COMPLETED',
      purchaseUnits: [{ payments: { captures: [{ id: 'CAP-NOAMT', status: 'COMPLETED' }] } }],
    });
    await reconcileExpiredReservations(later);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(0);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600); // held, not released
  });

  test('1g capture before buyer approval is RECOVERABLE: order stays pending, retry after approval succeeds', async () => {
    const { res } = await create('s1g', [{ productId: 'coffee', quantity: 2 }]);
    captureOrder.mockRejectedValueOnce({ details: [{ issue: 'ORDER_NOT_APPROVED' }] });
    const first = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
    expect(first.status).toBe(400);
    expect(first.body.details).toMatchObject({ paypalIssue: 'ORDER_NOT_APPROVED', retryable: true });
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(600); // kept

    // Buyer now approves in PayPal; the app retries capture:
    // A capture attempt is on record, so the retry first asks PayPal: approved, nothing captured yet -> capture again.
    getOrder.mockResolvedValueOnce(paypalOrder('APPROVED'));
    const retry = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe(OrderStatus.PAID);
    expect(dailySpendTracker.getSpentToday(USER)).toBe(600);
    expect(dailySpendTracker.getPendingReservations(USER)).toBe(0);
  });
});

describe('CLAIM 2 - rate limit and authentication (FIXED in Phase-1 Step 2)', () => {
  test('2a state-changing routes reject requests without a valid server-issued session', async () => {
    const items = [{ productId: 'coffee', quantity: 1 }];
    // No credentials at all.
    expect((await request(app).post('/api/ai/chat').send({ message: 'hi' })).status).toBe(401);
    expect((await request(app).post('/api/orders/create').send({ items })).status).toBe(401);
    // Client-invented session id (the old attack): id alone is not enough.
    const forged = { 'X-Session-Id': 'fresh-1', Authorization: 'Bearer nope' };
    expect((await request(app).post('/api/ai/chat').set(forged).send({ message: 'hi' })).status).toBe(401);
    // Real id, wrong token.
    const wrongToken = { 'X-Session-Id': sess.sessionId, Authorization: 'Bearer wrong-token' };
    expect((await request(app).post('/api/orders/create').set(wrongToken).send({ items })).status).toBe(401);
    // Real credentials but a body sessionId that is not theirs.
    const mismatch = await request(app)
      .post('/api/ai/chat').set(sess.headers).send({ sessionId: 'someone-else', message: 'hi' });
    expect(mismatch.status).toBe(403);
    expect(mockChat).not.toHaveBeenCalled(); // no OpenAI spend for any rejected request
  });

  test('2b rate limit cannot be dodged with fresh session ids (per-session, per-IP, global)', async () => {
    // Per-session ceiling (10/min).
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'hi' });
      expect(r.status).toBe(200);
    }
    const eleventh = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'hi' });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.scope).toBe('session');

    // Many NEW sessions from the same client: the per-IP ceiling (30/min) stops it.
    // (Session creation is itself capped per IP -- see 2c -- so lift that cap here
    // to isolate the AI per-IP ceiling.)
    const savedCreateCap = sessionStore.options.createPerIpPerHour;
    sessionStore.options.createPerIpPerHour = 1000;
    aiChatLimiters.perSession.reset();
    aiChatLimiters.perIp.reset();
    let ok = 0;
    let firstLimited: any;
    for (let i = 0; i < 40; i++) {
      const other = await newSession(app);
      const r = await request(app).post('/api/ai/chat').set(other.headers).send({ message: 'hi' });
      if (r.status === 200) ok++;
      else if (!firstLimited) firstLimited = r;
    }
    sessionStore.options.createPerIpPerHour = savedCreateCap;
    expect(ok).toBe(30);
    expect(firstLimited.status).toBe(429);
    expect(firstLimited.body.scope).toBe('ip');
    expect(mockChat).toHaveBeenCalledTimes(10 + 30); // OpenAI spend is bounded

    // Global ceiling holds even if the per-IP ceiling were not reached.
    aiChatLimiters.perSession.reset();
    aiChatLimiters.perIp.reset();
    aiChatLimiters.global.reset();
    const savedGlobal = aiChatLimiters.global.limit;
    aiChatLimiters.global.limit = 2;
    try {
      const g1 = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'hi' });
      const g2 = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'hi' });
      const g3 = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'hi' });
      expect([g1.status, g2.status, g3.status]).toEqual([200, 200, 429]);
      expect(g3.body.scope).toBe('global');
    } finally {
      aiChatLimiters.global.limit = savedGlobal;
    }
  });

  test('2c session creation itself is bounded per IP and by total capacity', async () => {
    const saved = { ...sessionStore.options };
    try {
      sessionStore.reset();
      sessionStore.options.createPerIpPerHour = 3;
      for (let i = 0; i < 3; i++) expect((await request(app).post('/api/sessions')).status).toBe(201);
      const limited = await request(app).post('/api/sessions');
      expect(limited.status).toBe(429);

      sessionStore.reset();
      sessionStore.options.createPerIpPerHour = 100;
      sessionStore.options.maxActive = 2;
      expect((await request(app).post('/api/sessions')).status).toBe(201);
      expect((await request(app).post('/api/sessions')).status).toBe(201);
      expect((await request(app).post('/api/sessions')).status).toBe(503);
    } finally {
      Object.assign(sessionStore.options, saved);
    }
  });

  test('2d public /api/orders and /api/policy-events never expose real session ids', async () => {
    await create('victim', [{ productId: 'coffee', quantity: 1 }]);
    const list = await request(app).get('/api/orders'); // public, read-only
    expect(list.status).toBe(200);
    expect(list.body.orders[0].sessionId).not.toBe(sess.sessionId);
    expect(list.body.orders[0].sessionId).toMatch(/^sess_[0-9a-f]{8}$/);
    const ev = await request(app).get('/api/policy-events');
    expect(ev.status).toBe(200);
    expect(JSON.stringify(ev.body)).not.toContain(sess.sessionId);
    expect(JSON.stringify(list.body)).not.toContain(sess.sessionId);
  });

  test('2e another session cannot capture or cancel an order it does not own', async () => {
    const { res } = await create('owner', [{ productId: 'coffee', quantity: 1 }]);
    const attacker = await newSession(app);
    // The attacker even learned the orderId (e.g. from the public list).
    const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(attacker.headers);
    expect(cap.status).toBe(404);
    const can = await request(app).post(`/api/orders/${res.body.orderId}/cancel`).set(attacker.headers);
    expect(can.status).toBe(404);
    expect(captureOrder).not.toHaveBeenCalled();
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAYMENT_PENDING);
    // No credentials at all is rejected too.
    expect((await request(app).post(`/api/orders/${res.body.orderId}/capture`)).status).toBe(401);
    // The owner still can.
    const own = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
    expect(own.status).toBe(200);
    expect(orderService.getById(res.body.orderId)!.status).toBe(OrderStatus.PAID);
  });

  test('2f idempotency keys are scoped per session (no cross-session replay)', async () => {
    const other = await newSession(app);
    const mk = (who: TestSession) =>
      request(app)
        .post('/api/orders/create')
        .set(who.headers)
        .set('Idempotency-Key', 'shared-key')
        .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    createOrder.mockResolvedValueOnce({ id: 'PP-A', status: 'CREATED', links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/a' }] });
    createOrder.mockResolvedValueOnce({ id: 'PP-B', status: 'CREATED', links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/b' }] });
    const a = await mk(sess);
    const b = await mk(other);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.orderId).not.toBe(a.body.orderId);
    expect(b.body.approvalUrl).not.toBe(a.body.approvalUrl);
    // PayPal-Request-Id differs per session even for an identical client key.
    expect(createOrder.mock.calls[0][1]).not.toBe(createOrder.mock.calls[1][1]);
  });

  test('2g ending a session invalidates its token', async () => {
    const end = await request(app).delete('/api/sessions/current').set(sess.headers);
    expect(end.status).toBe(200);
    const after = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'hi' });
    expect(after.status).toBe(401);
  });
});

describe('CLAIM 3 - per-session policy and daily budget (FIXED in Phase-1 Step 2)', () => {
  test('3a spend by one session does NOT block a different session', async () => {
    for (let i = 0; i < 5; i++) {
      const { res } = await create(`judge-A-${i}`, [{ productId: 'veg_breakfast', quantity: 2 }]); // 2000
      expect(res.status).toBe(201);
      const cap = await request(app).post(`/api/orders/${res.body.orderId}/capture`).set(sess.headers);
      expect(cap.status).toBe(200);
    }
    expect(dailySpendTracker.getSpentToday(sess.userId)).toBe(10000);

    // Session A has used up ITS OWN daily limit ...
    const again = await create('judge-A-more', [{ productId: 'coffee', quantity: 1 }]);
    expect(again.res.status).toBe(403);
    expect(JSON.stringify(again.res.body)).toContain('DAILY_LIMIT_EXCEEDED');

    // ... but a brand-new visitor has a full, independent budget.
    const judgeB = await newSession(app);
    const other = await create('judge-B', [{ productId: 'coffee', quantity: 1 }], judgeB);
    expect(other.res.status).toBe(201);
    expect(dailySpendTracker.getSpentToday(judgeB.userId)).toBe(0);
    expect(dailySpendTracker.getPendingReservations(judgeB.userId)).toBe(300);
  });

  test('3b every session gets its own policy object', async () => {
    const other = await newSession(app);
    await create('p-A', [{ productId: 'coffee', quantity: 1 }]);
    await create('p-B', [{ productId: 'coffee', quantity: 1 }], other);
    const users = new Set(policyStorage.getEvents().map((e) => e.userId));
    expect(users).toEqual(new Set([sess.userId, other.userId]));
    // Changing one user's policy does not touch the other's.
    policyStorage.setPolicy({ ...policyStorage.getOrCreatePolicy(sess.userId), maxPerPurchaseMinor: 100 });
    expect(policyStorage.getOrCreatePolicy(other.userId).maxPerPurchaseMinor).toBe(2000);
    expect(policyStorage.getOrCreatePolicy(sess.userId)).not.toBe(policyStorage.getOrCreatePolicy(other.userId));
  });
});

describe('CLAIM 4 - hardcoded policy text in ai/service.ts (FIXED in Sprint 1)', () => {
  test('4a exhausted-retry message now states the ACTUAL policy of this shopper', async () => {
    // The policy that matters is the SESSION user's copy, not the demo user's: every session gets
    // its own (see CLAIM 3b). The old test set the demo user's policy, so it never exercised the
    // real limit and passed only because the hardcoded text happened to say €20.00.
    policyStorage.setPolicy({
      ...defaultPolicy,
      userId: sess.userId,
      maxPerPurchaseMinor: 1500,
      blockedDietaryAttributes: [],
    });
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
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'gift' });
    expect(res.status).toBe(200);

    // The message is derived from the real policy: €15.00 per purchase (not the old hardcoded
    // €20.00) and the real daily limit, formatted in the business currency.
    expect(res.body.response).toContain('€15.00');
    expect(res.body.response).toContain('€100.00');
    expect(res.body.response).not.toContain('€20.00');
    // The old text claimed "no alcohol items" regardless of the policy; that rule is disabled here.
    expect(res.body.response).not.toContain('no alcohol');
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

  // The claim concerns the ORIGINAL eight-product demo catalog (the stale EUR 18.90 figure could never
  // be built from it). The catalog has since grown, so the claim is pinned to those original ids.
  const ORIGINAL_CATALOG_IDS = [
    'veg_breakfast', 'coffee', 'orange_juice', 'premium_cake',
    'gift_box', 'flowers_bouquet', 'pancakes', 'latte',
  ];

  test('5b NO combination of the original catalog items (qty 0..8 each) sums to 1890', () => {
    const prices: number[] = (catalog as any).products
      .filter((p: any) => ORIGINAL_CATALOG_IDS.includes(p.id))
      .map((p: any) => p.priceMinor);
    expect(prices).toHaveLength(ORIGINAL_CATALOG_IDS.length);
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

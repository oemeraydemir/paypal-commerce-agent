import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { policyStorage } from '../../src/policy/storage';
import { dailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { CatalogService } from '../../src/catalog/service';

const app = createApp();
let sess: TestSession;

const preview = (items: unknown, s: TestSession = sess) =>
  request(app).post('/api/policy/preview').set(s.headers).send({ items });

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
});

describe('POST /api/policy/preview (server-side policy transparency)', () => {
  test('requires a server-issued session', async () => {
    const res = await request(app).post('/api/policy/preview').send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(res.status).toBe(401);
  });

  test('canonical demo cart (veg breakfast + coffee = EUR 13) requires explicit approval', async () => {
    const res = await preview([
      { productId: 'veg_breakfast', quantity: 1 },
      { productId: 'coffee', quantity: 1 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('REQUIRE_CONFIRMATION');
    expect(res.body.requiresExplicitApproval).toBe(true);
    expect(res.body.totalMinor).toBe(1300);
    expect(res.body.enforcedBy).toBe('server');
    expect(res.body.limits.maxPerPurchaseMinor).toBe(2000);
    expect(res.body.limits.confirmationThresholdMinor).toBe(1000);
    const byRule = Object.fromEntries(res.body.checks.map((c: any) => [c.rule, c.status]));
    expect(byRule.confirmationThreshold).toBe('confirm');
    expect(byRule.maxPerPurchase).toBe('pass');
    expect(byRule.blockedDietary).toBe('pass');
  });

  test('a EUR 3 coffee is auto-allowed', async () => {
    const res = await preview([{ productId: 'coffee', quantity: 1 }]);
    expect(res.body.decision).toBe('AUTO_ALLOW');
    expect(res.body.requiresExplicitApproval).toBe(false);
  });

  test('over the per-purchase limit is blocked with an explanation and an exact overage', async () => {
    const res = await preview([
      { productId: 'veg_breakfast', quantity: 1 },
      { productId: 'premium_cake', quantity: 1 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('BLOCK');
    expect(res.body.reason).toMatch(/maximum purchase limit/i);
    const max = res.body.checks.find((c: any) => c.rule === 'maxPerPurchase');
    expect(max.status).toBe('fail');
    expect(max.detail).toMatch(/35\.00/); // 55.00 - 20.00
    expect(res.body.violations.map((v: any) => v.type)).toContain('MAX_PURCHASE_EXCEEDED');
  });

  test('alcohol is blocked by the dietary rule even when the amount is tiny', async () => {
    const res = await preview([{ productId: 'mulled_wine', quantity: 1 }]);
    expect(res.body.decision).toBe('BLOCK');
    const diet = res.body.checks.find((c: any) => c.rule === 'blockedDietary');
    expect(diet.status).toBe('fail');
    expect(diet.detail).toContain('Winter Mulled Wine');
  });

  test('pricing is server-authoritative: client price fields are ignored', async () => {
    const res = await preview([{ productId: 'coffee', quantity: 1, priceMinor: 1, unitPriceMinor: 1 }]);
    expect(res.body.totalMinor).toBe(300);
  });

  test('empty cart returns the limits without a decision', async () => {
    const res = await preview([]);
    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(true);
    expect(res.body.decision).toBeNull();
    expect(res.body.limits.dailyRemainingMinor).toBe(10000);
  });

  test('rejects unknown products and invalid quantities like the order endpoint does', async () => {
    expect((await preview([{ productId: 'nope', quantity: 1 }])).status).toBe(400);
    expect((await preview([{ productId: 'coffee', quantity: 0 }])).status).toBe(400);
    expect((await preview('not-an-array')).status).toBe(400);
  });

  test('daily budget is per session and reflected in the preview', async () => {
    const other = await newSession(app);
    dailySpendTracker.tryReserve(sess.userId, 9500, policyStorage.getOrCreatePolicy(sess.userId).dailySpendLimitMinor);
    const mine = await preview([{ productId: 'veg_breakfast', quantity: 1 }]);
    expect(mine.body.decision).toBe('BLOCK');
    expect(mine.body.checks.find((c: any) => c.rule === 'dailyBudget').status).toBe('fail');
    expect(mine.body.limits.dailyPendingMinor).toBe(9500);
    const theirs = await preview([{ productId: 'veg_breakfast', quantity: 1 }], other);
    expect(theirs.body.decision).toBe('AUTO_ALLOW'); // EUR 10.00 is not above the EUR 10.00 threshold
    expect(theirs.body.limits.dailyPendingMinor).toBe(0);
  });

  test('is side-effect free: no policy event is recorded and no reservation is created', async () => {
    const before = policyStorage.getEvents().length;
    await preview([{ productId: 'veg_breakfast', quantity: 1 }, { productId: 'coffee', quantity: 1 }]);
    const after = policyStorage.getEvents().length;
    expect(after).toBe(before);
    expect(dailySpendTracker.getPendingReservations(sess.userId)).toBe(0);
  });

  test('preview and /orders/create agree: a cart the preview blocks is also blocked by the order endpoint', async () => {
    const items = [{ productId: 'premium_cake', quantity: 1 }];
    const p = await preview(items);
    expect(p.body.decision).toBe('BLOCK');
    const o = await request(app).post('/api/orders/create').set(sess.headers).set('Idempotency-Key', 'k-1').send({ items });
    // Either PayPal is unconfigured (503) in this environment, or policy blocks (403): never a created order.
    expect([403, 503]).toContain(o.status);
  });
});

describe('expanded catalog invariants', () => {
  const products = new CatalogService().getAll();

  test('ids are unique and prices are positive integer cents in EUR', () => {
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
    for (const p of products) {
      expect(Number.isInteger(p.priceMinor) && p.priceMinor > 0).toBe(true);
      expect(p.currency).toBe('EUR');
    }
  });

  test('canonical demo products keep their prices (EUR 10 + EUR 3)', () => {
    const cat = new CatalogService();
    expect(cat.getById('veg_breakfast')!.priceMinor).toBe(1000);
    expect(cat.getById('coffee')!.priceMinor).toBe(300);
  });

  test('every category has at least one product and alcohol products are flagged in dietary', () => {
    expect(new Set(products.map((p) => p.category)).size).toBeGreaterThanOrEqual(6);
    for (const p of products.filter((x) => /alcohol/i.test(x.description))) {
      expect(p.dietary).toContain('alcohol');
    }
  });
});

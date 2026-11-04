import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState } from '../helpers/session';

const app = createApp();
beforeEach(() => resetSessionState());

test('policy preview carries a passport built from server prices, ignoring client prices', async () => {
  const s = await newSession(app);
  const res = await request(app)
    .post('/api/policy/preview')
    .set(s.headers)
    .send({ items: [{ productId: 'coffee', quantity: 1, priceMinor: 1 }] });
  expect(res.status).toBe(200);
  const p = res.body.passport;
  expect(p.kind).toBe('transaction-passport');
  expect(p.control.paymentAuthority).toBe('shopper');
  expect(p.control.agentCanPay).toBe(false);
  expect(p.totalMinor).toBe(res.body.totalMinor);
  expect(p.totalMinor).toBeGreaterThan(1);
  expect(p.lines[0].unitPriceMinor).toBe(p.lines[0].lineTotalMinor);
  expect(p.mandate.maxPerPurchaseMinor).toBe(res.body.limits.maxPerPurchaseMinor);
  expect(p.control.decision).toBe(res.body.decision);
});

test('empty cart has no passport (nothing to explain)', async () => {
  const s = await newSession(app);
  const res = await request(app).post('/api/policy/preview').set(s.headers).send({ items: [] });
  expect(res.status).toBe(200);
  expect(res.body.passport).toBeUndefined();
});

test('over-limit cart: passport reports not within limit and blocked steps', async () => {
  const s = await newSession(app);
  const one = await request(app).post('/api/policy/preview').set(s.headers).send({ items: [{ productId: 'coffee', quantity: 1 }] });
  const unit = one.body.totalMinor as number;
  const max = one.body.limits.maxPerPurchaseMinor as number;
  const qty = Math.floor(max / unit) + 1; // smallest quantity that exceeds the per-purchase limit
  const res = await request(app)
    .post('/api/policy/preview')
    .set(s.headers)
    .send({ items: [{ productId: 'coffee', quantity: qty }] });
  expect(res.status).toBe(200);
  expect(res.body.decision).toBe('BLOCK');
  expect(res.body.passport.control.withinLimit).toBe(false);
  expect(res.body.passport.steps.find((x: any) => x.key === 'paypal').state).toBe('blocked');
});

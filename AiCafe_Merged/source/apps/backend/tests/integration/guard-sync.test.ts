import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { shopperGuardStore } from '../../src/policy/shopper-guard';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// Wellbeing Guard sync e2e: the Flutter client's toGuardJson() sends `diets` (plural)
// + `allergens`; the server must STORE them (the Phase-2 fix that stopped silently
// dropping the plural field), enforce them at checkout, and a pre-set guard must
// survive an empty sync (the startup-wipe fix). PayPal is mocked.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn() },
}));

const app = createApp();
const mockCreateOrder = paypalClient.createOrder as jest.Mock;
let sess: TestSession;
let n = 0;

beforeEach(async () => {
  (paypalClient.createOrder as jest.Mock).mockImplementation(async () => ({
    id: `MOCK_PP_${++n}`,
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/approve' }],
  }));
  resetSessionState();
  shopperGuardStore.reset();
  sess = await newSession(app);
  mockCreateOrder.mockResolvedValue({
    id: 'MOCK_PAYPAL_ORDER_ID',
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/approve' }],
  });
});

describe('Wellbeing Guard: diets field is stored and enforced end-to-end', () => {
  test('PUT /api/guard with `diets` (plural) is stored, not dropped', async () => {
    const set = await request(app).put('/api/guard').set(sess.headers)
      .send({ diets: ['vegan'], allergens: [] });
    expect(set.status).toBe(200);
    const view = await request(app).get('/api/guard').set(sess.headers);
    expect(view.status).toBe(200);
    // The plural field is honoured (this is the fix: previously only `diet` was read).
    expect(view.body.guard.diets).toEqual(['vegan']);
  });

  test('a vegan guard BLOCKS a non-vegan product at checkout (GUARD_DIET_NOT_MET -> 403)', async () => {
    await request(app).put('/api/guard').set(sess.headers).send({ diets: ['vegan'], allergens: [] });
    const res = await request(app).post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'guard-diet-block').send({ items: [{ productId: 'croissant', quantity: 1 }] });
    expect(res.status).toBe(403);
    expect(res.body.policyDecision).toBe('BLOCK');
    expect(res.body.violations.map((v: any) => v.type)).toContain('GUARD_DIET_NOT_MET');
  });

  test('a vegan guard ALLOWS a vegan product at checkout (201)', async () => {
    await request(app).put('/api/guard').set(sess.headers).send({ diets: ['vegan'], allergens: [] });
    const res = await request(app).post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'guard-diet-allow').send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(res.status).toBe(201);
  });

  test('policy/preview surfaces the diet conflict as a failing wellbeingGuard check', async () => {
    await request(app).put('/api/guard').set(sess.headers).send({ diets: ['vegan'], allergens: [] });
    const block = await request(app).post('/api/policy/preview').set(sess.headers)
      .send({ items: [{ productId: 'croissant', quantity: 1 }] });
    const blockRow = block.body.checks.find((c: { rule: string }) => c.rule === 'wellbeingGuard');
    expect(blockRow.status).toBe('fail');

    const allow = await request(app).post('/api/policy/preview').set(sess.headers)
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    const allowRow = allow.body.checks.find((c: { rule: string }) => c.rule === 'wellbeingGuard');
    expect(allowRow.status).toBe('pass');
  });
});

describe('Wellbeing Guard: empty sync must NOT wipe a pre-set server guard', () => {
  test('an empty PUT /api/guard leaves an existing guard intact (defense-in-depth)', async () => {
    // Returning shopper already has a server guard (e.g. set in a previous session).
    const set = await request(app).put('/api/guard').set(sess.headers)
      .send({ diets: ['vegan'], allergens: ['gluten'] });
    expect(set.status).toBe(200);

    // The Flutter app starts with empty local prefs and (before the fix) would push
    // {diets:[], allergens:[]}. That must now be a no-op, not a delete.
    const emptySync = await request(app).put('/api/guard').set(sess.headers)
      .send({ diets: [], allergens: [] });
    expect(emptySync.status).toBe(200);

    const view = await request(app).get('/api/guard').set(sess.headers);
    expect(view.body.guard.diets).toEqual(['vegan']);
    expect(view.body.guard.allergens).toContain('gluten');
  });

  test('explicit clearing still works via DELETE /api/guard', async () => {
    await request(app).put('/api/guard').set(sess.headers).send({ diets: ['vegan'], allergens: [] });
    const del = await request(app).delete('/api/guard').set(sess.headers);
    expect(del.status).toBe(200);
    const view = await request(app).get('/api/guard').set(sess.headers);
    expect(view.body.guard).toEqual({ allergens: [] }); // nothing stored
  });
});

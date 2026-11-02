import request from 'supertest';
import { createApp } from '../../src/app';
import { resetMerchantKeyState } from '../../src/middleware/merchant-key';
import { newSession, resetSessionState } from '../helpers/session';

// DASHBOARD_PUBLIC=false makes every merchant-side read endpoint require the merchant key.
const app = createApp();
const KEY = 'merchant-key-0123456789';
const PRIVATE_ROUTES = ['/api/orders', '/api/orders/stats', '/api/policy-events', '/api/policy-events/stats'];

const saved = { pub: process.env.DASHBOARD_PUBLIC, key: process.env.OPS_COPILOT_KEY };
afterAll(() => {
  if (saved.pub === undefined) delete process.env.DASHBOARD_PUBLIC; else process.env.DASHBOARD_PUBLIC = saved.pub;
  if (saved.key === undefined) delete process.env.OPS_COPILOT_KEY; else process.env.OPS_COPILOT_KEY = saved.key;
});
beforeEach(() => {
  resetSessionState();
  resetMerchantKeyState();
  process.env.DASHBOARD_PUBLIC = 'false';
  process.env.OPS_COPILOT_KEY = KEY;
});

describe('private dashboard mode', () => {
  test.each(PRIVATE_ROUTES)('%s without a key is 401', async (route) => {
    expect((await request(app).get(route)).status).toBe(401);
  });

  test.each(PRIVATE_ROUTES)('%s with a wrong key is 401', async (route) => {
    expect((await request(app).get(route).set('X-Ops-Key', 'wrong-key-wrong-key-1')).status).toBe(401);
  });

  test.each(PRIVATE_ROUTES)('%s with the merchant key is 200', async (route) => {
    expect((await request(app).get(route).set('X-Ops-Key', KEY)).status).toBe(200);
  });

  test('a shopper session is NOT merchant authorization', async () => {
    const sess = await newSession(app);
    const res = await request(app).get('/api/orders').set(sess.headers);
    expect(res.status).toBe(401);
  });

  test('private mode without a configured key refuses instead of opening up (503)', async () => {
    delete process.env.OPS_COPILOT_KEY;
    expect((await request(app).get('/api/orders')).status).toBe(503);
  });

  test('key guessing is throttled with 429', async () => {
    let last = 0;
    for (let i = 0; i < 70; i++) last = (await request(app).get('/api/orders').set('X-Ops-Key', `guess-${i}-guess-guess`)).status;
    expect(last).toBe(429);
  });

  test('the error never reveals the expected key', async () => {
    const res = await request(app).get('/api/orders').set('X-Ops-Key', 'nope-nope-nope-nope');
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  test('order ids cannot be enumerated: there is no per-order read route', async () => {
    const res = await request(app).get('/api/orders/00000000-0000-4000-8000-000000000000').set('X-Ops-Key', KEY);
    expect(res.status).toBe(404);
  });
});

describe('dashboard is private by default', () => {
  beforeEach(() => {
    delete process.env.DASHBOARD_PUBLIC;
    process.env.OPS_COPILOT_KEY = KEY;
  });

  test.each(PRIVATE_ROUTES)('%s requires the merchant key when DASHBOARD_PUBLIC is unset', async (route) => {
    expect((await request(app).get(route)).status).toBe(401);
  });
});

describe('explicit public demo mode (opt-in)', () => {
  beforeEach(() => {
    process.env.DASHBOARD_PUBLIC = 'true';
  });

  test('rows are minimised: no PayPal ids and no real session id', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(200);
    for (const o of res.body.orders) {
      expect(o).not.toHaveProperty('paypalOrderId');
      expect(o).not.toHaveProperty('paypalCaptureId');
      expect(o.sessionId).not.toMatch(/^[0-9a-f]{8}-/);
    }
  });
});

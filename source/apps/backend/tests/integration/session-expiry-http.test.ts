import request from 'supertest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/environment';
import { newSession, resetSessionState } from '../helpers/session';

// GAP-14: session expiry was only covered at unit level. This drives it over HTTP with a controlled
// clock instead of waiting the 2 h idle TTL.
const app = createApp();
const ITEMS = [{ productId: 'coffee', quantity: 1 }];

beforeEach(() => resetSessionState());
afterEach(() => jest.restoreAllMocks());

test('an idle session is rejected with 401 SESSION_INVALID after the idle TTL, and stays rejected', async () => {
  const sess = await newSession(app);
  const base = Date.now();

  const ok = await request(app).post('/api/policy/preview').set(sess.headers).send({ items: ITEMS });
  expect(ok.status).toBe(200);

  jest.spyOn(Date, 'now').mockReturnValue(base + env.SESSION_IDLE_TTL_MS + 60_000);
  const expired = await request(app).post('/api/orders/create').set(sess.headers).send({ items: ITEMS });
  expect(expired.status).toBe(401);
  expect(JSON.stringify(expired.body)).toMatch(/SESSION_(INVALID|EXPIRED)/);

  // Time moving back does not resurrect it: the session was removed on expiry.
  jest.spyOn(Date, 'now').mockReturnValue(base);
  const again = await request(app).post('/api/orders/create').set(sess.headers).send({ items: ITEMS });
  expect(again.status).toBe(401);
});

test('activity inside the TTL keeps the session alive', async () => {
  const sess = await newSession(app);
  const base = Date.now();
  const spy = jest.spyOn(Date, 'now');

  spy.mockReturnValue(base + env.SESSION_IDLE_TTL_MS - 60_000);
  expect((await request(app).post('/api/policy/preview').set(sess.headers).send({ items: ITEMS })).status).toBe(200);

  // Another almost-full idle period after that activity: still valid (idle TTL is sliding).
  spy.mockReturnValue(base + 2 * env.SESSION_IDLE_TTL_MS - 120_000);
  expect((await request(app).post('/api/policy/preview').set(sess.headers).send({ items: ITEMS })).status).toBe(200);
});

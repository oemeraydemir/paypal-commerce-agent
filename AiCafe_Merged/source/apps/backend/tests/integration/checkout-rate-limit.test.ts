import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState } from '../helpers/session';

// GAP-17: policy preview and order routes had no rate limit.
const app = createApp();
const items = [{ productId: 'coffee', quantity: 1 }];

beforeEach(() => resetSessionState());

test('policy preview is limited per session with Retry-After, and a new session is unaffected', async () => {
  const a = await newSession(app);
  let limited: request.Response | undefined;
  for (let i = 0; i < 125 && !limited; i++) {
    const r = await request(app).post('/api/policy/preview').set(a.headers).send({ items });
    if (r.status === 429) limited = r;
    else expect(r.status).toBe(200);
  }
  expect(limited).toBeDefined();
  expect(limited!.body.scope).toBe('session');
  expect(Number(limited!.headers['retry-after'])).toBeGreaterThan(0);

  const b = await newSession(app);
  expect((await request(app).post('/api/policy/preview').set(b.headers).send({ items })).status).toBe(200);
});

test('rate limiting never replaces authentication: no session still gets 401', async () => {
  const r = await request(app).post('/api/orders/create').send({ items });
  expect(r.status).toBe(401);
});

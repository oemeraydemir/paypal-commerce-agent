import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// Wire contract between every client and the server: an order line is {productId, quantity}.
// The Android app once sent {id, quantity}; the server answered 400 "Product not found: undefined",
// which stayed invisible because checkout returned 503 (PayPal off) before validation ran.
const app = createApp();
let sess: TestSession;
beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
});

const preview = (items: unknown) => request(app).post('/api/policy/preview').set(sess.headers).send({ items });

test('{productId, quantity} is accepted', async () => {
  const res = await preview([{ productId: 'coffee', quantity: 1 }]);
  expect(res.status).toBe(200);
  expect(res.body.decision).toBe('AUTO_ALLOW');
});

test('{id, quantity} is rejected with 400 (clients must send productId)', async () => {
  const res = await preview([{ id: 'coffee', quantity: 1 }]);
  expect(res.status).toBe(400);
  expect(res.body.error).toContain('Product not found');
});

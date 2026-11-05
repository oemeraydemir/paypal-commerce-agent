import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn() },
}));

const mockCreateOrder = paypalClient.createOrder as jest.Mock;
const app = createApp();

let sess: TestSession;
let n = 0;

async function createOrder(s: TestSession, items = [{ productId: 'coffee', quantity: 1 }]) {
  const res = await request(app)
    .post('/api/orders/create')
    .set(s.headers)
    .set('Idempotency-Key', `share-link-test-${++n}`)
    .send({ items });
  expect(res.status).toBe(201);
  return res.body.orderId as string;
}

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  mockCreateOrder.mockReset();
  mockCreateOrder.mockResolvedValue({
    id: 'MOCK_PP_ORDER',
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/mock-approve' }],
  });
});

describe('Cart Mandate share link (receipt QR)', () => {
  test('the order id plus the mandate signature opens a public verification, with no session', async () => {
    const orderId = await createOrder(sess);
    const m = (await request(app).get(`/api/orders/${orderId}/mandate`).set(sess.headers)).body;
    const r = await request(app).post('/api/mandates/public').send({ orderId, signature: m.signature });
    expect(r.status).toBe(200);
    expect(r.body.verification.valid).toBe(true);
    expect(r.body.signed.mandate.constraints.agentMayAuthorizePayment).toBe(false);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(r.body)).not.toContain(sess.sessionId);
    // The signature never travels in a URL path (those end up in request logs).
    expect((await request(app).get(`/api/mandates/public/${orderId}/${m.signature}`)).status).toBe(404);
  });

  test('a wrong, malformed or foreign signature is indistinguishable from an unknown order', async () => {
    const orderId = await createOrder(sess);
    const other = await createOrder(sess, [{ productId: 'coffee', quantity: 2 }]);
    const otherSig = (await request(app).get(`/api/orders/${other}/mandate`).set(sess.headers)).body.signature;
    const wrong = await request(app).post('/api/mandates/public').send({ orderId, signature: otherSig });
    const garbage = await request(app).post('/api/mandates/public').send({ orderId, signature: 'not-a-signature!' });
    const unknown = await request(app).post('/api/mandates/public').send({ orderId: 'does-not-exist', signature: otherSig });
    const noBody = await request(app).post('/api/mandates/public').send({});
    for (const res of [wrong, garbage, unknown, noBody]) {
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/signature/i);
    }
  });
});

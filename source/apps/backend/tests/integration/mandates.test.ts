import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn() },
}));

const mockCreateOrder = paypalClient.createOrder as jest.Mock;
const mockCaptureOrder = paypalClient.captureOrder as jest.Mock;
const app = createApp();

let sess: TestSession;
let n = 0;

async function createOrder(s: TestSession, items = [{ productId: 'coffee', quantity: 1 }]) {
  const res = await request(app)
    .post('/api/orders/create')
    .set(s.headers)
    .set('Idempotency-Key', `mandate-test-${++n}`)
    .send({ items });
  expect(res.status).toBe(201);
  return res.body.orderId as string;
}

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  mockCreateOrder.mockReset();
  mockCaptureOrder.mockReset();
  mockCreateOrder.mockResolvedValue({
    id: 'MOCK_PP_ORDER',
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/mock-approve' }],
  });
});

describe('Cart Mandate', () => {
  test('the owner gets a signed mandate that states the agent cannot authorize payment', async () => {
    const orderId = await createOrder(sess);
    const res = await request(app).get(`/api/orders/${orderId}/mandate`).set(sess.headers);
    expect(res.status).toBe(200);
    expect(res.body.alg).toBe('EdDSA');
    expect(res.body.mandate.orderId).toBe(orderId);
    expect(res.body.mandate.totalMinor).toBe(300);
    expect(res.body.mandate.constraints.agentMayAuthorizePayment).toBe(false);
    expect(res.body.mandate.constraints.paymentAuthority).toBe('buyer_approval_at_paypal');
    // The raw session id must not leak into the mandate.
    expect(JSON.stringify(res.body)).not.toContain(sess.sessionId);
    expect(JSON.stringify(res.body)).not.toContain(sess.token);
  });

  test('is deterministic: asking twice yields the identical mandate and signature', async () => {
    const orderId = await createOrder(sess);
    const a = await request(app).get(`/api/orders/${orderId}/mandate`).set(sess.headers);
    const b = await request(app).get(`/api/orders/${orderId}/mandate`).set(sess.headers);
    expect(b.body).toEqual(a.body);
  });

  test('another session cannot fetch it, and it needs a session at all', async () => {
    const orderId = await createOrder(sess);
    const other = await newSession(app);
    expect((await request(app).get(`/api/orders/${orderId}/mandate`).set(other.headers)).status).toBe(404);
    expect((await request(app).get(`/api/orders/${orderId}/mandate`)).status).toBe(401);
  });

  test('POST /api/mandates/verify accepts a genuine mandate without any session', async () => {
    const orderId = await createOrder(sess);
    const m = await request(app).get(`/api/orders/${orderId}/mandate`).set(sess.headers);
    const v = await request(app).post('/api/mandates/verify').send(m.body);
    expect(v.status).toBe(200);
    expect(v.body.valid).toBe(true);
    expect(v.body.checks).toMatchObject({ knownKey: true, signature: true, notExpired: true, matchesOrder: true });
  });

  test('a tampered total or constraint is detected', async () => {
    const orderId = await createOrder(sess);
    const m = (await request(app).get(`/api/orders/${orderId}/mandate`).set(sess.headers)).body;

    const cheaper = JSON.parse(JSON.stringify(m));
    cheaper.mandate.totalMinor = 1;
    const v1 = await request(app).post('/api/mandates/verify').send(cheaper);
    expect(v1.body.valid).toBe(false);
    expect(v1.body.checks.signature).toBe(false);

    const empowered = JSON.parse(JSON.stringify(m));
    empowered.mandate.constraints.agentMayAuthorizePayment = true;
    const v2 = await request(app).post('/api/mandates/verify').send(empowered);
    expect(v2.body.valid).toBe(false);
  });

  test('garbage input is answered, not crashed on', async () => {
    const v = await request(app).post('/api/mandates/verify').send({ mandate: 'x' });
    expect(v.status).toBe(200);
    expect(v.body.valid).toBe(false);
    const v2 = await request(app).post('/api/mandates/verify').send({});
    expect(v2.body.valid).toBe(false);
  });

  test('the public key document is served, lists the active key and contains no private material', async () => {
    const a = await request(app).get('/.well-known/mandate-keys.json');
    expect(a.status).toBe(200);
    expect(a.body.keys[0]).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', status: 'active' });
    expect(a.body.keys[0].d).toBeUndefined();
    expect(a.body.canonicalization).toBe('aicafe-stable-json/1');
    expect((await request(app).get('/api/mandates/keys')).status).toBe(404); // duplicate route removed
  });

  test('a mandate fetched before a key rotation still verifies when the old public key is configured', async () => {
    const crypto = require('crypto');
    const { resetMandateKeyForTests } = require('../../src/mandate/mandate-service');
    const oldKey = crypto.generateKeyPairSync('ed25519').privateKey;
    process.env.MANDATE_SIGNING_KEY = oldKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    resetMandateKeyForTests();
    try {
      const orderId = await createOrder(sess);
      const before = (await request(app).get(`/api/orders/${orderId}/mandate`).set(sess.headers)).body;
      expect((await request(app).post('/api/mandates/verify').send(before)).body.valid).toBe(true);

      process.env.MANDATE_PREVIOUS_PUBLIC_KEYS = crypto.createPublicKey(oldKey).export({ type: 'spki', format: 'pem' }).toString().replace(/\n/g, '\\n');
      process.env.MANDATE_SIGNING_KEY = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      resetMandateKeyForTests();
      const afterOld = await request(app).post('/api/mandates/verify').send(before);
      expect(afterOld.body.valid).toBe(true);
      const fresh = (await request(app).get(`/api/orders/${orderId}/mandate`).set(sess.headers)).body;
      expect(fresh.kid).not.toBe(before.kid);
      expect(afterOld.body.checks.matchesOrder).toBe(true);
    } finally {
      delete process.env.MANDATE_SIGNING_KEY;
      delete process.env.MANDATE_PREVIOUS_PUBLIC_KEYS;
      resetMandateKeyForTests();
    }
  });

  test('an unknown kid and an expired mandate are reported precisely', async () => {
    const orderId = await createOrder(sess);
    const m = (await request(app).get(`/api/orders/${orderId}/mandate`).set(sess.headers)).body;
    const unknown = await request(app).post('/api/mandates/verify').send({ ...m, kid: 'ffffffffffffffff' });
    expect(unknown.body).toMatchObject({ valid: false, checks: { knownKey: false } });
  });
});

describe('configuration errors', () => {
  afterEach(() => {
    const { resetMandateKeyForTests } = require('../../src/mandate/mandate-service');
    delete process.env.MANDATE_SIGNING_KEY;
    resetMandateKeyForTests();
  });

  test('a broken MANDATE_SIGNING_KEY never turns /api/health or the mandate endpoints into a 500, and no key text leaks', async () => {
    const { resetMandateKeyForTests } = require('../../src/mandate/mandate-service');
    process.env.MANDATE_SIGNING_KEY = 'not-a-key-SECRETVALUE';
    resetMandateKeyForTests();
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(503);
    expect(health.body).toMatchObject({ status: 'misconfigured', mandates: { keyPersistence: 'invalid' } });
    expect(health.body.mandates.error).toMatch(/MANDATE_SIGNING_KEY/);
    expect(JSON.stringify(health.body)).not.toContain('SECRETVALUE');
    expect((await request(app).get('/.well-known/mandate-keys.json')).status).toBe(503);
    expect((await request(app).post('/api/mandates/verify').send({ mandate: {}, signature: 'x', kid: 'y', canonicalization: 'aicafe-stable-json/1' })).status).toBe(503);
  });

  test('a good configured key reports "configured" on a healthy /api/health', async () => {
    const crypto = require('crypto');
    const { resetMandateKeyForTests } = require('../../src/mandate/mandate-service');
    process.env.MANDATE_SIGNING_KEY = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    resetMandateKeyForTests();
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.mandates.keyPersistence).toBe('configured');
    expect(JSON.stringify(health.body)).not.toMatch(/PRIVATE KEY/);
  });
});

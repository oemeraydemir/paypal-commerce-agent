import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// Real-HTTP contract (supertest, no mocks of the route) for what the Flutter client's
// ApiService.previewPolicy / PolicyPreview.fromJson relies on:
//   - status codes: 200 verdict, 400 invalid cart, 401 missing/invalid session
//   - error body: { error: string }  (Flutter surfaces it via ApiException)
//   - 200 body: { empty, decision: AUTO_ALLOW|REQUIRE_CONFIRMATION|BLOCK, reason: string }
// This does NOT exercise PayPal; it only pins the wire format between the app and the server.
const app = createApp();
let sess: TestSession;
beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
});

const preview = (body: unknown, headers: Record<string, string> = sess.headers) =>
  request(app).post('/api/policy/preview').set(headers).send(body as object);

describe('POST /api/policy/preview HTTP contract', () => {
  test('401 with a string error and a machine-readable code when the session is missing', async () => {
    const res = await request(app)
      .post('/api/policy/preview')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(res.status).toBe(401);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.details?.code).toBe('SESSION_REQUIRED');
  });

  test('401 for a wrong token of an existing session', async () => {
    const res = await preview(
      { items: [{ productId: 'coffee', quantity: 1 }] },
      { 'X-Session-Id': sess.sessionId, Authorization: 'Bearer wrong' }
    );
    expect(res.status).toBe(401);
    expect(res.body.details?.code).toBe('SESSION_INVALID');
  });

  test.each([
    ['quantity 0', [{ productId: 'coffee', quantity: 0 }]],
    ['negative quantity', [{ productId: 'coffee', quantity: -1 }]],
    ['fractional quantity', [{ productId: 'coffee', quantity: 1.5 }]],
    ['non-numeric quantity', [{ productId: 'coffee', quantity: 'abc' }]],
    ['quantity above 100', [{ productId: 'coffee', quantity: 101 }]],
    ['missing quantity', [{ productId: 'coffee' }]],
    ['numeric string quantity', [{ productId: 'coffee', quantity: '2' }]],
    ['boolean quantity', [{ productId: 'coffee', quantity: true }]],
    ['hex string quantity', [{ productId: 'coffee', quantity: '0x10' }]],
    ['unknown product', [{ productId: 'does-not-exist', quantity: 1 }]],
    ['legacy {id} field', [{ id: 'coffee', quantity: 1 }]],
  ])('400 with a string error for %s', async (_name, items) => {
    const res = await preview({ items });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  test.each([
    ['items missing', {}],
    ['items not an array', { items: 'coffee' }],
  ])('400 when %s', async (_name, body) => {
    const res = await preview(body);
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  test('200 verdicts only use the three decision strings the Flutter parser knows, with a string reason', async () => {
    const known = new Set(['AUTO_ALLOW', 'REQUIRE_CONFIRMATION', 'BLOCK']);
    const carts = [
      [{ productId: 'coffee', quantity: 1 }], // allow
      [
        { productId: 'veg_breakfast', quantity: 1 },
        { productId: 'coffee', quantity: 1 },
      ], // confirmation
      [{ productId: 'veg_breakfast', quantity: 3 }], // over the per-purchase limit
    ];
    const seen = new Set<string>();
    for (const items of carts) {
      const res = await preview({ items });
      expect(res.status).toBe(200);
      expect(res.body.empty).toBe(false);
      expect(known.has(res.body.decision)).toBe(true);
      expect(typeof res.body.reason).toBe('string');
      seen.add(res.body.decision);
    }
    expect(seen).toEqual(known);
  });

  test('empty cart: 200 with empty=true and decision=null (the app never calls this for an empty cart)', async () => {
    const res = await preview({ items: [] });
    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(true);
    expect(res.body.decision).toBeNull();
  });
});

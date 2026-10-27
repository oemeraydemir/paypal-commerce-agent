import request from 'supertest';
import { createApp } from '../../src/app';
import { MAX_WEBHOOK_BODY_BYTES } from '../../src/middleware/raw-body';

const app = createApp();

describe('webhook raw-body limit', () => {
  test('a small JSON body is accepted (reaches the signature check → 401)', async () => {
    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send({ id: 'evt-small', event_type: 'X', resource: {} });

    // Missing PayPal-Signature headers, so the body was parsed and the request
    // was rejected by the route — not by the size guard.
    expect(res.status).toBe(401);
  });

  test('a body over the cap is rejected with 413 before signature verification', async () => {
    const oversized = JSON.stringify({
      id: 'evt-big',
      event_type: 'X',
      resource: { blob: 'a'.repeat(MAX_WEBHOOK_BODY_BYTES + 10) },
    });

    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send(oversized);

    expect(res.status).toBe(413);
  });

  test('malformed JSON is rejected with 400 (not 500)', async () => {
    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send('{"id":');

    expect(res.status).toBe(400);
  });
});

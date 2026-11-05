import express from 'express';
import request from 'supertest';
import { ipRateLimit, resetSessionRateLimiters } from '../../src/middleware/rate-limit';

describe('ipRateLimit (unauthenticated routes)', () => {
  beforeEach(() => resetSessionRateLimiters());

  it('allows the limit, then answers 429 with Retry-After', async () => {
    const app = express();
    app.post('/x', ipRateLimit(3), (_req, res) => res.json({ ok: true }));
    for (let i = 0; i < 3; i++) await request(app).post('/x').expect(200);
    const blocked = await request(app).post('/x').expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.error).toBe('Rate limit exceeded');
  });
});

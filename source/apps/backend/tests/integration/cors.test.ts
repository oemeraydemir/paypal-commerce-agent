import request from 'supertest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/environment';

const app = createApp();

describe('CORS', () => {
  test('the configured origin is allowed with credentials', async () => {
    const res = await request(app).get('/api/health').set('Origin', env.CORS_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(env.CORS_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('a foreign origin gets no Access-Control-Allow-Origin header (no wildcard, no static value)', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('a preflight from a foreign origin is not approved', async () => {
    const res = await request(app)
      .options('/api/orders/create')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('requests without an Origin header (curl, servers, mobile apps) still work', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});

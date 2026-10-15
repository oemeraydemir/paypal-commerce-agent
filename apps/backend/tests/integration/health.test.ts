import request from 'supertest';
import { createApp } from '../../src/app';

// Integration test uses createApp() (no listen) so the test process never
// binds a port and never hangs. CRITICAL FIX #1 + #3.
const app = createApp();

describe('Health endpoint (integration)', () => {
  it('GET /api/health returns 200 with JSON', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('paypal');
    expect(res.body.paypal).toHaveProperty('enabled');
    expect(res.body.paypal.environment).toBe('sandbox');
    expect(res.body.ai).toHaveProperty('enabled');
  });

  it('GET /api/health exposes buildCommit=unknown when RENDER_GIT_COMMIT is absent', async () => {
    const original = process.env.RENDER_GIT_COMMIT;
    delete process.env.RENDER_GIT_COMMIT;
    try {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('buildCommit');
      expect(res.body.buildCommit).toBe('unknown');
    } finally {
      if (original === undefined) {
        delete process.env.RENDER_GIT_COMMIT;
      } else {
        process.env.RENDER_GIT_COMMIT = original;
      }
    }
  });

  it('GET /api/health returns the RENDER_GIT_COMMIT value when present', async () => {
    const original = process.env.RENDER_GIT_COMMIT;
    // Synthetic, non-secret commit SHA used only to prove pass-through.
    process.env.RENDER_GIT_COMMIT = 'c8c5a4085100f75f05e4dca2d20f2087f8b17ef2';
    try {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.buildCommit).toBe('c8c5a4085100f75f05e4dca2d20f2087f8b17ef2');
    } finally {
      if (original === undefined) {
        delete process.env.RENDER_GIT_COMMIT;
      } else {
        process.env.RENDER_GIT_COMMIT = original;
      }
    }
  });

  it('GET /api/health buildCommit falls back to unknown for empty RENDER_GIT_COMMIT', async () => {
    const original = process.env.RENDER_GIT_COMMIT;
    process.env.RENDER_GIT_COMMIT = '';
    try {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.buildCommit).toBe('unknown');
    } finally {
      if (original === undefined) {
        delete process.env.RENDER_GIT_COMMIT;
      } else {
        process.env.RENDER_GIT_COMMIT = original;
      }
    }
  });

  it('GET /api/catalog/search filters by free-text query', async () => {
    const res = await request(app)
      .get('/api/catalog/search')
      .query({ query: 'chocolate' });

    expect(res.status).toBe(200);
    expect(res.body.products.map((product: { id: string }) => product.id)).toContain(
      'premium_cake'
    );
    expect(res.body.products.map((product: { id: string }) => product.id)).not.toContain(
      'coffee'
    );
  });

  it('GET /api/catalog returns 25 products', async () => {
    const res = await request(app).get('/api/catalog');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(25);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products[0]).toHaveProperty('priceMinor');
    expect(res.body.products[0]).toHaveProperty('dietary');
    expect(res.body.products[0]).toHaveProperty('occasion');
  });

  it('GET /api/catalog/:id returns 404 for unknown product via AppError', async () => {
    const res = await request(app).get('/api/catalog/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

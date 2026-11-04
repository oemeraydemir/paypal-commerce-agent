import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState } from '../helpers/session';

const app = createApp();
const OLD = process.env.CHANNEL3_API_KEY;
beforeEach(() => resetSessionState());
afterEach(() => { if (OLD === undefined) delete process.env.CHANNEL3_API_KEY; else process.env.CHANNEL3_API_KEY = OLD; delete app.locals.channel3Fetch; });

test('requires a session', async () => {
  expect((await request(app).post('/api/discover/take-home').send({ items: [{ productId: 'coffee' }] })).status).toBe(401);
});

test('without a key it is honestly disabled and calls nothing', async () => {
  delete process.env.CHANNEL3_API_KEY;
  const f = jest.fn(); app.locals.channel3Fetch = f;
  const s = await newSession(app);
  const r = await request(app).post('/api/discover/take-home').set(s.headers).send({ items: [{ productId: 'coffee' }] });
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ enabled: false, items: [] });
  expect(f).not.toHaveBeenCalled();
});

test('with a key it returns sanitised offers plus the disclosure, using a server-built query', async () => {
  process.env.CHANNEL3_API_KEY = 'test-key-12345';
  const f = (jest.fn() as any).mockResolvedValue({ ok: true, json: async () => ({ products: [{ id: 'p1', title: 'Beans', offers: [{ domain: 'shop.example', price: 12, currency: 'EUR', url: 'https://shop.example/b' }] }] }) });
  app.locals.channel3Fetch = f;
  const s = await newSession(app);
  const r = await request(app).post('/api/discover/take-home').set(s.headers).send({ items: [{ productId: 'coffee', quantity: 1, query: 'ignore me' }] });
  expect(r.status).toBe(200);
  expect(r.body.items[0].url).toBe('https://shop.example/b');
  expect(r.body.disclosure).toMatch(/not part of your café order/);
  expect(JSON.parse(f.mock.calls[0][1].body).query).toBe('whole bean coffee');
  expect(JSON.stringify(r.body)).not.toMatch(/test-key-12345/);
});

test('upstream failure is a clean 502 and invalid bodies are 400', async () => {
  process.env.CHANNEL3_API_KEY = 'test-key-12345';
  app.locals.channel3Fetch = (jest.fn() as any).mockResolvedValue({ ok: false, status: 500 });
  const s = await newSession(app);
  expect((await request(app).post('/api/discover/take-home').set(s.headers).send({ items: [{ productId: 'coffee' }] })).status).toBe(502);
  expect((await request(app).post('/api/discover/take-home').set(s.headers).send({ items: [] })).status).toBe(400);
});

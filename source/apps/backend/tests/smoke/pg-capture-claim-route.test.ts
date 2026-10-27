/**
 * Route-level proof of the cross-instance capture claim on a REAL PostgreSQL server (PayPal is mocked).
 * "Another instance" is simulated by a live row in capture_claims for the order.
 * Skipped, reported BLOCKED, without DATABASE_URL.
 */
process.env.NODE_ENV = 'test';
process.env.PAYPAL_ENABLED = 'true';
process.env.PAYPAL_CLIENT_ID = 'test-client-id';
process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
process.env.PAYPAL_ENV = 'sandbox';
process.env.PAYPAL_RETURN_URL = 'http://localhost:3000/api/checkout/return';
process.env.PAYPAL_CANCEL_URL = 'http://localhost:3000/api/checkout/cancel';

import request from 'supertest';
import { Client, Pool } from 'pg';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn() },
}));

import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { attachPersistence, detachPersistence, PoolLike } from '../../src/persistence/init';
import { OrderService } from '../../src/orders/service';
import { newSession, resetSessionState } from '../helpers/session';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn('[smoke] BLOCKED: DATABASE_URL is not set. pg-capture-claim-route was NOT executed.');
}

const createOrder = paypalClient.createOrder as jest.Mock;
const captureOrder = paypalClient.captureOrder as jest.Mock;

suite('capture claim at the route level (real PostgreSQL, mocked PayPal)', () => {
  jest.setTimeout(120_000);
  const schema = `aicafe_claim_${Date.now()}`;
  let pool: Pool;
  const app = createApp();

  beforeAll(async () => {
    const c = new Client({ connectionString: databaseUrl });
    await c.connect();
    await c.query(`CREATE SCHEMA "${schema}"`);
    await c.end();
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await attachPersistence(pool as unknown as PoolLike, { advisoryLock: false });
  });
  afterAll(async () => {
    detachPersistence();
    await pool.end();
    const c = new Client({ connectionString: databaseUrl });
    await c.connect();
    await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await c.end();
  });

  test('a live claim held by another instance blocks the capture; once released the capture succeeds and the claim is cleaned up', async () => {
    resetSessionState();
    const sess = await newSession(app);
    createOrder.mockResolvedValue({ id: 'PP-CLAIM', status: 'CREATED', links: [{ rel: 'approve', href: 'https://x/approve' }] });
    captureOrder.mockResolvedValue({
      id: 'PP-CLAIM',
      status: 'COMPLETED',
      purchaseUnits: [{ payments: { captures: [{ id: 'CAP-CLAIM', status: 'COMPLETED' }] } }],
    });

    const created = await request(app)
      .post('/api/orders/create').set(sess.headers).set('Idempotency-Key', 'claim-1')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(created.status).toBe(201);
    const id: string = created.body.orderId;

    await pool.query("INSERT INTO capture_claims (order_id, claimed_at) VALUES ($1, now())", [id]); // "instance B"
    const blocked = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('Capture already in progress');
    expect(captureOrder).not.toHaveBeenCalled();
    expect(OrderService.getInstance().getById(id)!.status).toBe('PAYMENT_PENDING');

    await pool.query('DELETE FROM capture_claims WHERE order_id = $1', [id]);
    const ok = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('PAID');
    expect(captureOrder).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 100)); // release is fire-and-forget
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM capture_claims WHERE order_id = $1', [id]);
    expect(rows[0].n).toBe(0);
  });

  test('if the database fails during the claim, nothing is sent to PayPal (fail closed, 503)', async () => {
    resetSessionState();
    captureOrder.mockClear();
    const sess = await newSession(app);
    createOrder.mockResolvedValue({ id: 'PP-FC', status: 'CREATED', links: [{ rel: 'approve', href: 'https://x/approve' }] });
    const created = await request(app)
      .post('/api/orders/create').set(sess.headers).set('Idempotency-Key', 'claim-2')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    const id: string = created.body.orderId;

    await pool.query('ALTER TABLE capture_claims RENAME TO capture_claims_off'); // simulate the claim query failing
    try {
      const res = await request(app).post(`/api/orders/${id}/capture`).set(sess.headers);
      expect(res.status).toBe(503);
      expect(captureOrder).not.toHaveBeenCalled();
    } finally {
      await pool.query('ALTER TABLE capture_claims_off RENAME TO capture_claims');
    }
  });
});

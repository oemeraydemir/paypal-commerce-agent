import request from 'supertest';
import { createApp } from '../../src/app';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin } from '../../src/orders/domain';

const app = createApp();
const orders = OrderService.getInstance();

const ITEM = {
  productId: 'coffee',
  name: 'Coffee',
  quantity: 1,
  unitPriceMinor: 300,
  lineTotalMinor: 300,
};

function make(sessionId: string, paypalOrderId: string) {
  const order = orders.create(sessionId, [ITEM], 'EUR', OrderOrigin.HUMAN);
  orders.setPayPalOrderId(order.id, paypalOrderId);
  return order;
}

beforeEach(() => orders.reset());

describe('public order read-only contract', () => {
  test('unauthenticated list exposes no real session or PayPal identifiers', async () => {
    make('sess-real-secret', 'PP-SECRET-ORDER');

    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('sess-real-secret');
    expect(serialized).not.toContain('PP-SECRET-ORDER');

    const row = res.body.orders[0];
    expect(row).not.toHaveProperty('paypalOrderId');
    expect(row).not.toHaveProperty('paypalCaptureId');
    expect(row).not.toHaveProperty('idempotencyKey');
    // The session reference is a non-reversible public label, not the real id.
    expect(row.sessionId).not.toBe('sess-real-secret');
    expect(row.sessionId).toMatch(/^sess_[0-9a-f]{8}$/);
  });

  test('cross-session: both sessions are listed, but neither real id is disclosed', async () => {
    make('sess-A-real', 'PP-A');
    make('sess-B-real', 'PP-B');

    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(2);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('sess-A-real');
    expect(serialized).not.toContain('sess-B-real');

    const refs = res.body.orders.map((order: any) => order.sessionId);
    expect(new Set(refs).size).toBe(2);
  });

  test('stats are aggregate-only and never list orders', async () => {
    make('sess-real-secret', 'PP-SECRET-ORDER');

    const res = await request(app).get('/api/orders/stats');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('orders');
    expect(JSON.stringify(res.body)).not.toContain('sess-real-secret');
    expect(JSON.stringify(res.body)).not.toContain('PP-SECRET-ORDER');
    expect(typeof res.body.total).toBe('number');
  });

  test('an Authorization / X-Ops-Key header does not unlock extra fields', async () => {
    make('sess-real-secret', 'PP-SECRET-ORDER');

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', 'Bearer anything')
      .set('X-Ops-Key', 'anything');

    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('PP-SECRET-ORDER');
    expect(serialized).not.toContain('sess-real-secret');
  });
});

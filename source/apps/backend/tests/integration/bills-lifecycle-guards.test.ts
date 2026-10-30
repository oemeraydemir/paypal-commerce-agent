import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { BillService } from '../../src/bills/service';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn() },
}));
const createOrder = paypalClient.createOrder as jest.Mock;

const app = createApp();
let owner: TestSession;
let joiner: TestSession;
const cart = [{ productId: 'coffee', quantity: 2 }];

async function makeBill(count = 2) {
  const res = await request(app).post('/api/bills').set(owner.headers).send({ items: cart, participantCount: count });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

beforeEach(async () => {
  resetSessionState();
  BillService.getInstance().reset();
  owner = await newSession(app);
  joiner = await newSession(app);
  createOrder.mockReset().mockResolvedValue({
    id: 'PP-SHARE',
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://x/approve' }],
  });
});

describe('same-cart guard', () => {
  test('whole-cart checkout is refused while the owner has an active split for that cart', async () => {
    await makeBill();
    const res = await request(app)
      .post('/api/orders/create')
      .set(owner.headers)
      .set('Idempotency-Key', 'k-1')
      .send({ items: cart });
    // PayPal is not configured in tests (503) OR the guard fires first; the guard must win.
    expect(res.status).toBe(409);
    expect(res.body.code ?? res.body.details?.code).toBe('SPLIT_BILL_ACTIVE');
  });

  test('a different cart, or another user, is not blocked by the guard', async () => {
    await makeBill();
    const other = await request(app)
      .post('/api/orders/create')
      .set(owner.headers)
      .set('Idempotency-Key', 'k-2')
      .send({ items: [{ productId: 'coffee', quantity: 1 }] });
    expect(other.status).not.toBe(409);
    const stranger = await request(app)
      .post('/api/orders/create')
      .set(joiner.headers)
      .set('Idempotency-Key', 'k-3')
      .send({ items: cart });
    expect(stranger.status).not.toBe(409);
  });

  test('cancelling the bill lifts the guard', async () => {
    const id = await makeBill();
    const c = await request(app).post(`/api/bills/${id}/cancel`).set(owner.headers);
    expect(c.status).toBe(200);
    expect(c.body.status).toBe('CANCELLED');
    const res = await request(app)
      .post('/api/orders/create')
      .set(owner.headers)
      .set('Idempotency-Key', 'k-4')
      .send({ items: cart });
    expect(res.status).not.toBe(409);
  });
});

describe('cancel + invite guards', () => {
  test('only the owner can cancel; others get 404', async () => {
    const id = await makeBill();
    const res = await request(app).post(`/api/bills/${id}/cancel`).set(joiner.headers);
    expect(res.status).toBe(404);
  });

  test('a cancelled bill cannot mint invites or be joined', async () => {
    const id = await makeBill();
    const inv = await request(app).post(`/api/bills/${id}/invite`).set(owner.headers);
    expect(inv.status).toBe(200);
    await request(app).post(`/api/bills/${id}/cancel`).set(owner.headers);
    const again = await request(app).post(`/api/bills/${id}/invite`).set(owner.headers);
    expect(again.status).toBe(409);
    const join = await request(app).post('/api/bills/join').set(joiner.headers).send({ token: inv.body.token });
    expect(join.status).toBe(409);
  });

  test('invites are refused once every slot is taken', async () => {
    const id = await makeBill(2);
    const inv = await request(app).post(`/api/bills/${id}/invite`).set(owner.headers);
    await request(app).post('/api/bills/join').set(joiner.headers).send({ token: inv.body.token });
    const extra = await request(app).post(`/api/bills/${id}/invite`).set(owner.headers);
    expect(extra.status).toBe(409);
  });

  test('a bill with a started PayPal checkout can no longer be cancelled', async () => {
    const id = await makeBill(2);
    const bill = await request(app).get(`/api/bills/${id}`).set(owner.headers);
    const shareId = bill.body.shares.find((s: any) => s.participantBound).id;
    const pay = await request(app).post(`/api/bills/${id}/shares/${shareId}/pay`).set(owner.headers);
    expect(pay.status).toBe(201); // PayPal is enabled (mocked) in the test environment
    const c = await request(app).post(`/api/bills/${id}/cancel`).set(owner.headers);
    expect(c.status).toBe(409);
    expect(c.body.code ?? c.body.details?.code).toBe('BILL_HAS_PAYMENTS');
  });
});

describe('/join and /split pages', () => {
  test.each(['/join', '/split'])('%s serves the split room page with no-store', async (p) => {
    const res = await request(app).get(p);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('policy cannot be bypassed by splitting', () => {
  test('a cart above the per-purchase limit is blocked at bill creation, like normal checkout', async () => {
    const res = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'coffee', quantity: 12 }], participantCount: 3 }); // 12 × €3.00 = €36 > €20
    expect(res.status).toBe(403);
    expect(res.body.policyDecision).toBe('BLOCK');
  });
});

describe('viewer-relative flags', () => {
  test('exposes isOwner and mine only for the caller', async () => {
    const id = await makeBill(2);
    const inv = await request(app).post(`/api/bills/${id}/invite`).set(owner.headers);
    const joined = await request(app).post('/api/bills/join').set(joiner.headers).send({ token: inv.body.token });
    expect(joined.status).toBe(200);
    expect(joined.body.bill.isOwner).toBe(false);
    const joinerMine = joined.body.bill.shares.filter((s: any) => s.mine);
    expect(joinerMine).toHaveLength(1);
    expect(joinerMine[0].id).toBe(joined.body.shareId);

    const asOwner = await request(app).get(`/api/bills/${id}`).set(owner.headers);
    expect(asOwner.body.isOwner).toBe(true);
    const ownerMine = asOwner.body.shares.filter((s: any) => s.mine);
    expect(ownerMine).toHaveLength(1);
    expect(ownerMine[0].id).not.toBe(joined.body.shareId);
  });
});

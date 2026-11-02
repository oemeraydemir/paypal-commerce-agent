import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { BillService } from '../../src/bills/service';
import { OrderService } from '../../src/orders/service';

// MOCKED PayPal (no network): P2 share payment/capture rely on the same pipeline
// as /orders/create + /orders/:orderId/capture, which we exercise end-to-end.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn() },
}));
const createOrder = paypalClient.createOrder as jest.Mock;
const captureOrder = paypalClient.captureOrder as jest.Mock;
const getOrder = paypalClient.getOrder as jest.Mock;

// P1 route contract: create a bill from a server-priced cart, invite/join, and
// read state. These routes move no money and expose no capture/settlement path.
// Authorization mirrors the app's "another session's X is a 404" rule.

const app = createApp();
let owner: TestSession;
let joiner: TestSession;
let outsider: TestSession;
let billId = '';

beforeEach(async () => {
  resetSessionState();
  BillService.getInstance().reset();
  owner = await newSession(app);
  joiner = await newSession(app);
  outsider = await newSession(app);
  createOrder.mockReset().mockResolvedValue({ id: 'PP-SHARE', status: 'CREATED', links: [{ rel: 'approve', href: 'https://x/approve' }] });
  captureOrder.mockReset();
  getOrder.mockReset();
});

describe('POST /api/bills', () => {
  test('creates an EQUAL group with the owner bound to slot 0', async () => {
    const res = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'coffee', quantity: 2 }], participantCount: 2 });
    expect(res.status).toBe(201);
    billId = res.body.id;
    expect(res.body.strategy).toBe('EQUAL');
    expect(res.body.status).toBe('OPEN');
    expect(res.body.totalMinor).toBe(600); // 2 × 300, server-priced
    expect(res.body.shares).toHaveLength(2);
    expect(res.body.shares[0].participantBound).toBe(true);
    expect(res.body.shares[1].participantBound).toBe(false);
    expect(res.body.progress).toMatchObject({ sharesTotal: 2, sharesPaid: 0 });
    expect(res.body.shares.reduce((s: number, x: any) => s + x.amountMinor, 0)).toBe(600);
  });

  test('rejects unknown products, bad quantities, and out-of-range participantCount', async () => {
    let res = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'does_not_exist', quantity: 1 }], participantCount: 2 });
    expect(res.status).toBe(400);

    res = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'coffee', quantity: 0 }], participantCount: 2 });
    expect(res.status).toBe(400);

    res = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'coffee', quantity: 1 }], participantCount: 1 });
    expect(res.status).toBe(400);
  });

  test('requires a session', async () => {
    const res = await request(app).post('/api/bills').send({ items: [], participantCount: 2 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/bills/:id/invite', () => {
  async function createBill() {
    const res = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'coffee', quantity: 2 }], participantCount: 2 });
    billId = res.body.id;
  }

  test('owner mints a signed, single-use token', async () => {
    await createBill();
    const res = await request(app).post(`/api/bills/${billId}/invite`).set(owner.headers);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3);
    expect(res.body.ttlSeconds).toBeGreaterThan(0);
    expect(res.body.joinUrl).toContain('/join#t=');
  });

  test('non-owner is treated as 404 (indistinguishable from missing)', async () => {
    await createBill();
    const res = await request(app).post(`/api/bills/${billId}/invite`).set(outsider.headers);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/bills/join', () => {
  async function createAndInvite() {
    const created = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'coffee', quantity: 2 }], participantCount: 2 });
    billId = created.body.id;
    const invite = await request(app).post(`/api/bills/${billId}/invite`).set(owner.headers);
    return invite.body.token as string;
  }

  test('joiner binds to the open share and can read the bill', async () => {
    const token = await createAndInvite();
    const joined = await request(app).post('/api/bills/join').set(joiner.headers).send({ token });
    expect(joined.status).toBe(200);
    expect(typeof joined.body.shareId).toBe('string');
    expect(joined.body.bill.shares[1].participantBound).toBe(true);

    const read = await request(app).get(`/api/bills/${billId}`).set(joiner.headers);
    expect(read.status).toBe(200);
    expect(read.body.id).toBe(billId);
    expect(read.body.progress.sharesPaid).toBe(0);
  });

  test('a token cannot be replayed by a second joiner', async () => {
    const token = await createAndInvite();
    await request(app).post('/api/bills/join').set(joiner.headers).send({ token });
    const replay = await request(app).post('/api/bills/join').set(outsider.headers).send({ token });
    expect(replay.status).toBe(409);
  });

  test('two concurrent joins with the same token: exactly one wins', async () => {
    const token = await createAndInvite(); // n=2 → owner slot 0 + one open slot
    const [a, b] = await Promise.all([
      request(app).post('/api/bills/join').set(joiner.headers).send({ token }),
      request(app).post('/api/bills/join').set(outsider.headers).send({ token }),
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 409]);
    const err = a.status === 200 ? b : a;
    expect(err.body.error).toBe('Invite token already used');

    // Exactly one additional slot is bound (owner + one joiner), no over-fill.
    const read = await request(app).get(`/api/bills/${billId}`).set(owner.headers);
    const bound = read.body.shares.filter((s: any) => s.participantBound).length;
    expect(bound).toBe(2);
  });

  test('malformed or garbage tokens are rejected', async () => {
    const res = await request(app).post('/api/bills/join').set(outsider.headers).send({ token: 'garbage' });
    expect(res.status).toBe(400);
  });

  test('requires a token', async () => {
    const res = await request(app).post('/api/bills/join').set(outsider.headers).send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/bills/:id', () => {
  async function createAndInvite() {
    const created = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'coffee', quantity: 2 }], participantCount: 2 });
    billId = created.body.id;
    const invite = await request(app).post(`/api/bills/${billId}/invite`).set(owner.headers);
    await request(app).post('/api/bills/join').set(joiner.headers).send({ token: invite.body.token });
  }

  test('owner can read', async () => {
    await createAndInvite();
    const res = await request(app).get(`/api/bills/${billId}`).set(owner.headers);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(billId);
  });

  test('non-participant is a 404', async () => {
    await createAndInvite();
    const res = await request(app).get(`/api/bills/${billId}`).set(outsider.headers);
    expect(res.status).toBe(404);
  });

  test('unknown bill is a 404', async () => {
    const res = await request(app).get('/api/bills/bill_unknown').set(owner.headers);
    expect(res.status).toBe(404);
  });
});

describe('P2: per-share payment', () => {
  // coffee × 2 = 600 total; participantCount 2 → each share = 300.
  async function createBillJoinPair() {
    const created = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'coffee', quantity: 2 }], participantCount: 2 });
    billId = created.body.id;
    const invite = await request(app).post(`/api/bills/${billId}/invite`).set(owner.headers);
    const joined = await request(app).post('/api/bills/join').set(joiner.headers).send({ token: invite.body.token });
    expect(joined.status).toBe(200);
    return { groupId: billId, shareId: joined.body.shareId as string };
  }

  const completedCapture = (value: string, currency = 'EUR') => ({
    id: 'PP-SHARE',
    status: 'COMPLETED',
    purchaseUnits: [{ payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', amount: { value, currency_code: currency } }] } }],
  });

  test('participant pays their share → order created, share stays PENDING until capture', async () => {
    const { groupId, shareId } = await createBillJoinPair();
    const pay = await request(app).post(`/api/bills/${groupId}/shares/${shareId}/pay`).set(joiner.headers);
    expect(pay.status).toBe(201);
    expect(typeof pay.body.orderId).toBe('string');
    expect(pay.body.paypalOrderId).toBe('PP-SHARE');
    expect(pay.body.approvalUrl).toBe('https://x/approve');
    expect(pay.body.totalMinor).toBe(300);

    const bill = await request(app).get(`/api/bills/${groupId}`).set(owner.headers);
    const share = bill.body.shares.find((s: any) => s.id === shareId);
    expect(share.status).toBe('PENDING');
    expect(share.orderId).toBe(pay.body.orderId);
    expect(bill.body.progress.sharesPaid).toBe(0);
  });

  test('capturing the share order via the existing route marks it PAID and advances the group', async () => {
    const { groupId, shareId } = await createBillJoinPair();
    const pay = await request(app).post(`/api/bills/${groupId}/shares/${shareId}/pay`).set(joiner.headers);
    captureOrder.mockResolvedValueOnce(completedCapture('3.00'));

    const cap = await request(app).post(`/api/orders/${pay.body.orderId}/capture`).set(joiner.headers);
    expect(cap.status).toBe(200);
    expect(cap.body.status).toBe('PAID');

    const bill = await request(app).get(`/api/bills/${groupId}`).set(joiner.headers);
    const share = bill.body.shares.find((s: any) => s.id === shareId);
    expect(share.status).toBe('PAID');
    expect(share.paypalCaptureId).toBe('CAP1');
    expect(bill.body.progress.sharesPaid).toBe(1);
    expect(bill.body.status).toBe('PARTIALLY_SETTLED');
  });

  test('cannot pay someone else\'s share (outsider or the owner)', async () => {
    const { groupId, shareId } = await createBillJoinPair();
    let res = await request(app).post(`/api/bills/${groupId}/shares/${shareId}/pay`).set(outsider.headers);
    expect(res.status).toBe(404);
    res = await request(app).post(`/api/bills/${groupId}/shares/${shareId}/pay`).set(owner.headers);
    expect(res.status).toBe(404);
  });

  test('cannot pay an already-paid share', async () => {
    const { groupId, shareId } = await createBillJoinPair();
    const pay = await request(app).post(`/api/bills/${groupId}/shares/${shareId}/pay`).set(joiner.headers);
    captureOrder.mockResolvedValueOnce(completedCapture('3.00'));
    await request(app).post(`/api/orders/${pay.body.orderId}/capture`).set(joiner.headers);

    const again = await request(app).post(`/api/bills/${groupId}/shares/${shareId}/pay`).set(joiner.headers);
    expect(again.status).toBe(409);
  });

  test('two concurrent pays for the same share create exactly one order / PayPal order', async () => {
    const { groupId, shareId } = await createBillJoinPair();
    const payUrl = `/api/bills/${groupId}/shares/${shareId}/pay`;

    // Gate the mocked PayPal create so request A blocks there with the order id
    // already bound. We sequence the race deterministically: wait until A is
    // confirmed blocked at createOrder, THEN start B — so B is guaranteed to see
    // the in-flight (bound, not-yet-PENDING) share and must conflict instead of
    // creating a second order / PayPal order.
    let releaseCreate!: () => void;
    let createCalled!: () => void;
    const gate = new Promise<void>((resolve) => { releaseCreate = resolve; });
    const createCalledP = new Promise<void>((resolve) => { createCalled = resolve; });
    createOrder.mockImplementationOnce(() => {
      createCalled(); // A has reached the PayPal create and is now blocked
      return gate.then(() => ({
        id: 'PP-SHARE-CONCURRENT',
        status: 'CREATED',
        links: [{ rel: 'approve', href: 'https://x/approve' }],
      }));
    });

    // Force-start A (supertest is lazy: a bare Test does not hit the wire until
    // awaited) and wait until it is blocked at the gated createOrder.
    const aP = request(app).post(payUrl).set(joiner.headers).send().then((r) => r);
    await createCalledP;

    // Now start B while A is still blocked → B must observe the in-flight share.
    const bP = request(app).post(payUrl).set(joiner.headers).send().then((r) => r);
    const b = await bP;
    expect(b.status).toBe(409); // conflict — no second order created

    releaseCreate(); // let A finish
    const a = await aP;
    expect(a.status).toBe(201); // exactly one request creates the order

    expect(createOrder).toHaveBeenCalledTimes(1); // one PayPal order total
    // Exactly one internal order exists for this share (the /pay idempotency key).
    const matches = OrderService.getInstance()
      .getAll()
      .filter((o) => o.idempotencyKey === `bill-pay-${shareId}`);
    expect(matches).toHaveLength(1);
  });

  test('another session cannot capture the share order (no id substitution)', async () => {
    const { groupId, shareId } = await createBillJoinPair();
    const pay = await request(app).post(`/api/bills/${groupId}/shares/${shareId}/pay`).set(joiner.headers);
    expect(pay.status).toBe(201);
    captureOrder.mockResolvedValueOnce(completedCapture('3.00'));
    // The owner's session does not own the joiner's order → indistinguishable from missing.
    const cap = await request(app).post(`/api/orders/${pay.body.orderId}/capture`).set(owner.headers);
    expect(cap.status).toBe(404);
    // The joiner can still capture their own share's order afterwards.
    const ok = await request(app).post(`/api/orders/${pay.body.orderId}/capture`).set(joiner.headers);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('PAID');
  });

  test('a participant cannot read another share\'s evidence', async () => {
    const created = await request(app)
      .post('/api/bills')
      .set(owner.headers)
      .send({ items: [{ productId: 'coffee', quantity: 2 }], participantCount: 2 });
    const groupId = created.body.id;
    const ownerShareId = created.body.shares[0].id; // owner occupies slot 0
    const invite = await request(app).post(`/api/bills/${groupId}/invite`).set(owner.headers);
    await request(app).post('/api/bills/join').set(joiner.headers).send({ token: invite.body.token });

    const ev = await request(app).get(`/api/bills/${groupId}/shares/${ownerShareId}/evidence`).set(joiner.headers);
    expect(ev.status).toBe(404);
  });

  test('per-share evidence is available to the participant/owner, not outsiders', async () => {
    const { groupId, shareId } = await createBillJoinPair();
    await request(app).post(`/api/bills/${groupId}/shares/${shareId}/pay`).set(joiner.headers);

    const ev = await request(app).get(`/api/bills/${groupId}/shares/${shareId}/evidence`).set(joiner.headers);
    expect(ev.status).toBe(200);
    expect(ev.body.version).toBe('aicafe.evidence/1');
    expect(typeof ev.body.integrity?.signature).toBe('string');

    const outsiderEv = await request(app).get(`/api/bills/${groupId}/shares/${shareId}/evidence`).set(outsider.headers);
    expect(outsiderEv.status).toBe(404);
  });
});

import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { BillService } from '../../src/bills/service';

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

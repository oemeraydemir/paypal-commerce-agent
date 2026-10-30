import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { BillService } from '../../src/bills/service';

// Regression: bill ids used to be a deterministic hash of (owner, items, count).
// Creating the same bill twice returned the SAME id and replaced the first group
// (resetting its shares), so a double-click or a retry could wipe a bill that was
// already joined or paid. Every create must now yield a distinct bill.

const app = createApp();
let owner: TestSession;

beforeEach(async () => {
  resetSessionState();
  BillService.getInstance().reset();
  owner = await newSession(app);
});

const body = { items: [{ productId: 'coffee', quantity: 2 }], participantCount: 2 };

test('creating the same bill twice yields two distinct bills with distinct share ids', async () => {
  const a = await request(app).post('/api/bills').set(owner.headers).send(body);
  const b = await request(app).post('/api/bills').set(owner.headers).send(body);
  expect(a.status).toBe(201);
  expect(b.status).toBe(201);
  expect(a.body.id).not.toBe(b.body.id);
  const ids = [...a.body.shares, ...b.body.shares].map((s: any) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('a joined bill is not reset by creating an identical bill afterwards', async () => {
  const joiner = await newSession(app);
  const a = await request(app).post('/api/bills').set(owner.headers).send(body);
  const inv = await request(app).post(`/api/bills/${a.body.id}/invite`).set(owner.headers);
  const join = await request(app).post('/api/bills/join').set(joiner.headers).send({ token: inv.body.token });
  expect(join.status).toBe(200);

  await request(app).post('/api/bills').set(owner.headers).send(body);

  const after = await request(app).get(`/api/bills/${a.body.id}`).set(owner.headers);
  expect(after.status).toBe(200);
  expect(after.body.shares.filter((s: any) => s.participantBound)).toHaveLength(2);
});

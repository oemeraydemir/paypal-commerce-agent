/**
 * Integration tests for the Pickup Planner HTTP surface. Runs in memory mode
 * (no DATABASE_URL, no PayPal), so capacity/state behaviour here mirrors the
 * unit tests; the real-PG concurrency guarantee is covered by the smoke suite.
 */
process.env.DASHBOARD_PUBLIC = 'true'; // exercise merchant endpoints without a key in tests

import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { newSession } from '../helpers/session';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin } from '../../src/orders/domain';
import { pickupService } from '../../src/pickup/service';

const orderService = OrderService.getInstance();

function mkOrder(sessionId: string): string {
  return orderService.create(
    sessionId,
    [{ productId: 'p', name: 'p', quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100 }],
    'EUR',
    OrderOrigin.HUMAN
  ).id;
}

const DAY = '2030-05-20';

describe('pickup HTTP API', () => {
  let app: Express;
  let customer: Awaited<ReturnType<typeof newSession>>;
  let other: Awaited<ReturnType<typeof newSession>>;

  beforeAll(async () => {
    app = createApp();
    customer = await newSession(app);
    other = await newSession(app);
  });

  beforeEach(() => {
    orderService.reset();
    pickupService.reset();
  });

  test('availability requires a session', async () => {
    const res = await request(app).get('/api/pickup/availability');
    expect(res.status).toBe(401);
  });

  test('merchant creates a slot; customer sees remaining capacity; reserving fills it', async () => {
    const create = await request(app)
      .post('/api/pickup/slots')
      .send({ day: DAY, startTs: `${DAY}T09:00:00Z`, endTs: `${DAY}T10:00:00Z`, capacity: 1 });
    expect(create.status).toBe(201);
    expect(create.body.capacity).toBe(1);
    expect(create.body.remaining).toBe(1);

    const av = await request(app).get(`/api/pickup/availability?day=${DAY}`).set(customer.headers);
    expect(av.status).toBe(200);
    expect(av.body.slots).toHaveLength(1);
    expect(av.body.slots[0].remaining).toBe(1);

    const reserve = await request(app).post('/api/pickup/reserve').set(customer.headers).send({ slotId: create.body.id });
    expect(reserve.status).toBe(201);
    expect(reserve.body.status).toBe('HELD');
    expect(reserve.body.bookingId).toBeDefined();

    const av2 = await request(app).get(`/api/pickup/availability?day=${DAY}`).set(customer.headers);
    expect(av2.body.slots[0].remaining).toBe(0);

    // A different customer is rejected as full.
    const full = await request(app).post('/api/pickup/reserve').set(other.headers).send({ slotId: create.body.id });
    expect(full.status).toBe(409);
    expect(full.body.details.code).toBe('SLOT_FULL');
  });

  test('reserve validates input and rejects unknown slots', async () => {
    const noSlot = await request(app).post('/api/pickup/reserve').set(customer.headers).send({});
    expect(noSlot.status).toBe(400);
    const notFound = await request(app).post('/api/pickup/reserve').set(customer.headers).send({ slotId: 'ghost' });
    expect(notFound.status).toBe(404);
  });

  test('release is idempotent and auth-protected', async () => {
    const create = await request(app)
      .post('/api/pickup/slots')
      .send({ day: DAY, startTs: `${DAY}T11:00:00Z`, endTs: `${DAY}T12:00:00Z`, capacity: 2 });
    const reserve = await request(app).post('/api/pickup/reserve').set(customer.headers).send({ slotId: create.body.id });
    expect(reserve.status).toBe(201);
    const bid = reserve.body.bookingId;

    const released = await request(app).post('/api/pickup/release').set(customer.headers).send({ bookingId: bid });
    expect(released.status).toBe(200);
    expect(released.body.status).toBe('RELEASED');

    const again = await request(app).post('/api/pickup/release').set(customer.headers).send({ bookingId: bid });
    expect(again.body.status).toBe('ALREADY_RELEASED');

    // Another session cannot release my booking.
    const forbidden = await request(app).post('/api/pickup/release').set(other.headers).send({ bookingId: bid });
    expect(forbidden.status).toBe(403);

    const missing = await request(app).post('/api/pickup/release').set(customer.headers).send({ bookingId: 'ghost' });
    expect(missing.status).toBe(404);
  });

  test('link validates ownership and state', async () => {
    const create = await request(app)
      .post('/api/pickup/slots')
      .send({ day: DAY, startTs: `${DAY}T13:00:00Z`, endTs: `${DAY}T14:00:00Z`, capacity: 1 });
    const reserve = await request(app).post('/api/pickup/reserve').set(customer.headers).send({ slotId: create.body.id });
    const bid = reserve.body.bookingId;
    // The order must carry the SAME session id the route authenticates on
    // (the raw X-Session-Id), not the derived userId. Mark it paid so the
    // first link CONFIRMs the booking and a replay is rejected (no longer HELD).
    const orderId = mkOrder(customer.sessionId);
    orderService.setPayPalOrderId(orderId, `pp-${orderId}`);
    orderService.reconcileLateCapture(orderId);

    const ok = await request(app).post('/api/pickup/link').set(customer.headers).send({ bookingId: bid, orderId });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('CONFIRMED');

    // Linking again is rejected (booking is no longer HELD).
    const mismatch = await request(app).post('/api/pickup/link').set(customer.headers).send({ bookingId: bid, orderId });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.details.code).toBe('LINK_MISMATCH');

    // Another session's booking cannot be linked (separate slot so other can hold one).
    const slot2 = await request(app)
      .post('/api/pickup/slots')
      .send({ day: DAY, startTs: `${DAY}T13:30:00Z`, endTs: `${DAY}T14:30:00Z`, capacity: 1 });
    const otherReserve = await request(app).post('/api/pickup/reserve').set(other.headers).send({ slotId: slot2.body.id });
    const otherBid = otherReserve.body.bookingId;
    const forbidden = await request(app)
      .post('/api/pickup/link')
      .set(customer.headers)
      .send({ bookingId: otherBid, orderId });
    expect(forbidden.status).toBe(403);
  });

  test('merchant plan lists slots and bookings', async () => {
    const create = await request(app)
      .post('/api/pickup/slots')
      .send({ day: DAY, startTs: `${DAY}T15:00:00Z`, endTs: `${DAY}T16:00:00Z`, capacity: 4 });
    await request(app).post('/api/pickup/reserve').set(customer.headers).send({ slotId: create.body.id });
    const plan = await request(app).get('/api/pickup/plan');
    expect(plan.status).toBe(200);
    const slot = plan.body.slots.find((s: any) => s.id === create.body.id);
    expect(slot).toBeDefined();
    expect(slot.bookings.length).toBe(1);
    expect(slot.bookings[0].status).toBe('HELD');
  });
});

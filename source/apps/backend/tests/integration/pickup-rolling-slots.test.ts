import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { pickupService, businessDay, zonedWallTimeToUtc } from '../../src/pickup/service';

// Regression: demo slots used to be seeded once (and never in production), so after a few
// days the planner showed "No pickup times are available". The calendar now rolls forward
// by itself, in the café's time zone, and never offers a slot that has already started.

const app = createApp();
let s: TestSession;

beforeEach(async () => {
  resetSessionState();
  pickupService.reset();
  s = await newSession(app);
});

describe('time-zone helpers (Europe/Berlin)', () => {
  test('summer time is UTC+2, winter time is UTC+1', () => {
    expect(zonedWallTimeToUtc('2026-07-15', 9, 0, 'Europe/Berlin').toISOString()).toBe('2026-07-15T07:00:00.000Z');
    expect(zonedWallTimeToUtc('2026-12-15', 9, 0, 'Europe/Berlin').toISOString()).toBe('2026-12-15T08:00:00.000Z');
  });
  test('DST change days resolve to the correct offset', () => {
    // 2026-10-25: clocks go back, 18:00 is already CET (UTC+1)
    expect(zonedWallTimeToUtc('2026-10-25', 18, 0, 'Europe/Berlin').toISOString()).toBe('2026-10-25T17:00:00.000Z');
    // 2026-03-29: clocks go forward, 12:00 is CEST (UTC+2)
    expect(zonedWallTimeToUtc('2026-03-29', 12, 0, 'Europe/Berlin').toISOString()).toBe('2026-03-29T10:00:00.000Z');
  });
  test('businessDay uses the local date, not the UTC date', () => {
    // 23:30 UTC on 30 Oct is already 31 Oct 00:30 in Berlin
    expect(businessDay(Date.parse('2026-10-30T23:30:00Z'), 'Europe/Berlin')).toBe('2026-10-31');
  });
});

describe('rolling calendar', () => {
  test('ensureUpcomingSlots is idempotent', async () => {
    const first = await pickupService.ensureUpcomingSlots(3);
    expect(first).toBe(12); // 3 days × 4 windows
    await pickupService.ensureUpcomingSlots(3);
    const plan = await pickupService.getMerchantPlan();
    expect(plan).toHaveLength(12);
  });

  test('the availability endpoint tops the calendar up by itself and shows only future slots', async () => {
    const days = [0, 1, 2].map((d) => businessDay(Date.now() + d * 86400000));
    const lists = await Promise.all(
      days.map((day) => request(app).get(`/api/pickup/availability?day=${day}`).set(s.headers))
    );
    lists.forEach((r) => expect(r.status).toBe(200));
    const all = lists.flatMap((r) => r.body.slots as any[]);
    expect(all.length).toBeGreaterThan(0); // never an empty planner
    all.forEach((slot) => expect(Date.parse(slot.startTs)).toBeGreaterThan(Date.now()));
  });

  test('PICKUP_AUTOSEED=false turns the automatic calendar off', async () => {
    process.env.PICKUP_AUTOSEED = 'false';
    try {
      expect(await pickupService.ensureUpcomingSlots()).toBe(0);
    } finally {
      delete process.env.PICKUP_AUTOSEED;
    }
  });
});

describe('past slots', () => {
  test('a slot that already started cannot be reserved', async () => {
    const start = new Date(Date.now() - 60 * 60 * 1000);
    await pickupService.createSlot({
      id: 'slot-past',
      day: businessDay(start.getTime()),
      startTs: start,
      endTs: new Date(start.getTime() + 3600000),
      capacity: 2,
    });
    const res = await request(app).post('/api/pickup/reserve').set(s.headers).send({ slotId: 'slot-past' });
    expect(res.status).toBe(404);
  });
});

import request from 'supertest';
import { createApp } from '../../src/app';
import { resetMerchantKeyState } from '../../src/middleware/merchant-key';
import { newSession, resetSessionState } from '../helpers/session';

// Focused access-control test for the new /api/dashboard/summary endpoint.
// Verifies which users can see which summary data in public vs private mode,
// and that merchant-only detail (disputes, refunds, wellbeing decisions) is
// withheld in public demo mode.

const app = createApp();
const KEY = 'merchant-key-0123456789';
const SUMMARY = '/api/dashboard/summary';

const saved = { pub: process.env.DASHBOARD_PUBLIC, key: process.env.OPS_COPILOT_KEY };
afterAll(() => {
  if (saved.pub === undefined) delete process.env.DASHBOARD_PUBLIC; else process.env.DASHBOARD_PUBLIC = saved.pub;
  if (saved.key === undefined) delete process.env.OPS_COPILOT_KEY; else process.env.OPS_COPILOT_KEY = saved.key;
});
beforeEach(() => {
  resetSessionState();
  resetMerchantKeyState();
  process.env.DASHBOARD_PUBLIC = 'false';
  process.env.OPS_COPILOT_KEY = KEY;
});

describe('summary endpoint · private mode', () => {
  test('without a key is 401', async () => {
    expect((await request(app).get(SUMMARY)).status).toBe(401);
  });

  test('with a wrong key is 401', async () => {
    expect((await request(app).get(SUMMARY).set('X-Ops-Key', 'wrong-key-wrong-key-1')).status).toBe(401);
  });

  test('a shopper session is NOT merchant authorization', async () => {
    const sess = await newSession(app);
    const res = await request(app).get(SUMMARY).set(sess.headers);
    expect(res.status).toBe(401);
  });

  test('with the merchant key is 200 and returns merchant detail', async () => {
    const res = await request(app).get(SUMMARY).set('X-Ops-Key', KEY);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('redactedDetail');
    expect(res.body.redactedDetail).toBe(false);
    // Merchant mode carries the full detail arrays.
    expect(res.body.disputes).toHaveProperty('cases');
    expect(res.body.refunds).toHaveProperty('records');
    expect(res.body.wellbeing).toHaveProperty('decisions');
    // Mandate block is the session template + real session counts (no single demo actor).
    expect(res.body.mandate.source).toBe('default-session-template');
    expect(res.body.mandate).toHaveProperty('maxPerPurchaseMinor');
    expect(res.body.mandate).toHaveProperty('activeSessions');
    expect(res.body.mandate).not.toHaveProperty('revision');
    expect(Array.isArray(res.body.timeline)).toBe(true);
  });

  test('mandate is labelled as the per-session template, not one fake "current" actor', async () => {
    const res = await request(app).get(SUMMARY).set('X-Ops-Key', KEY);
    expect(res.status).toBe(200);
    expect(res.body.mandate.source).toBe('default-session-template');
    expect(res.body.mandate.note).toContain('authoritative');
    expect(JSON.stringify(res.body)).not.toContain('demo-user-001');
  });

  test('reading the summary never creates a policy for anyone', async () => {
    const { policyStorage } = require('../../src/policy/storage');
    const before = policyStorage.sessionPolicyStats().active;
    await request(app).get(SUMMARY).set('X-Ops-Key', KEY);
    await request(app).get(SUMMARY).set('X-Ops-Key', KEY);
    expect(policyStorage.sessionPolicyStats().active).toBe(before);
  });
});

describe('summary endpoint · public demo mode', () => {
  beforeEach(() => {
    process.env.DASHBOARD_PUBLIC = 'true';
  });

  test('is accessible WITHOUT a key', async () => {
    const res = await request(app).get(SUMMARY);
    expect(res.status).toBe(200);
  });

  test('redacts merchant-only detail (disputes, refunds, wellbeing decisions)', async () => {
    const res = await request(app).get(SUMMARY);
    expect(res.status).toBe(200);
    expect(res.body.redactedDetail).toBe(true);
    // Detail arrays must be empty / withheld.
    expect(Array.isArray(res.body.disputes.cases)).toBe(true);
    expect(res.body.disputes.cases.length).toBe(0);
    expect(Array.isArray(res.body.refunds.records)).toBe(true);
    expect(res.body.refunds.records.length).toBe(0);
    expect(Array.isArray(res.body.wellbeing.decisions)).toBe(true);
    expect(res.body.wellbeing.decisions.length).toBe(0);
  });

  test('still exposes aggregate counts (no detail) in public mode', async () => {
    const res = await request(app).get(SUMMARY);
    expect(res.status).toBe(200);
    // Aggregate counts are canonical and safe.
    expect(typeof res.body.revenue.capturedMinor).toBe('number');
    expect(typeof res.body.policy.blocked).toBe('number');
    expect(typeof res.body.orders.total).toBe('number');
    // Aggregate dispute/refund counts remain visible; per-case detail is not.
    expect(typeof res.body.disputes.total).toBe('number');
    expect(typeof res.body.refunds.total).toBe('number');
    expect(typeof res.body.wellbeing.totalEvents).toBe('number');
  });

  test('no PayPal refund ids leak in public mode', async () => {
    const res = await request(app).get(SUMMARY);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('paypalRefundId');
    expect(raw).not.toContain('paypalDisputeId');
    expect(raw).not.toContain('paypalStatus');
  });
});

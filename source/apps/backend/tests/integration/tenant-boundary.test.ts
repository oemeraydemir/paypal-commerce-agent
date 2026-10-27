import request from 'supertest';
import { createApp } from '../../src/app';
import {
  CLIENT_TENANT_FIELDS,
  checkClientTenantOverride,
  getTenantContext,
} from '../../src/config/tenant';
import { currentBusiness } from '../../src/config/business-config';
import { newSession, resetSessionState } from '../helpers/session';

const app = createApp();

// These tests do NOT claim multi-tenancy. They pin the ONE tenant boundary this
// deployment really has: the business is a server-side fact and a client cannot
// select or spoof it. See docs/MULTI_TENANT_READINESS.md for what is still missing.

describe('tenant context is server-owned', () => {
  test('getTenantContext() returns the boot-time business, not request data', () => {
    const ctx = getTenantContext();
    expect(ctx.businessId).toBe(currentBusiness.businessId);
    expect(ctx.currency).toBe(currentBusiness.currency);
    expect(Object.keys(ctx).sort()).toEqual(['businessId', 'currency', 'locale', 'name', 'timezone']);
  });

  test('a plain body is accepted', () => {
    expect(checkClientTenantOverride({ message: 'hello', items: [{ productId: 'coffee' }] })).toEqual({ ok: true });
  });

  test('every client tenant field is refused', () => {
    for (const field of CLIENT_TENANT_FIELDS) {
      expect(checkClientTenantOverride({ [field]: 'other-shop' })).toMatchObject({ ok: false, field });
    }
  });

  test('the SAME value is refused too — the field itself is the problem', () => {
    expect(checkClientTenantOverride({ businessId: currentBusiness.businessId })).toMatchObject({
      ok: false,
      field: 'businessId',
    });
  });

  test('a nested catalog object is not mistaken for a tenant claim', () => {
    expect(checkClientTenantOverride({ items: [{ productId: 'coffee', businessId: 'x' }] })).toEqual({ ok: true });
  });
});

describe('HTTP boundary', () => {
  beforeEach(() => resetSessionState());

  test('AI chat with a client-chosen businessId is rejected (400) and never reaches the agent', async () => {
    const session = await newSession(app);
    const res = await request(app)
      .post('/api/ai/chat')
      .set(session.headers)
      .send({ message: 'a coffee please', businessId: 'some-other-cafe' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/businessId/);
    expect(res.body.details?.code).toBe('TENANT_OVERRIDE_REJECTED');
    // The AI must not have answered: no prepared cart, no provider metadata.
    expect(res.body.response).toBeUndefined();
    expect(res.body.preparedCart).toBeUndefined();
  });

  test('order creation with a client-chosen merchantId is rejected', async () => {
    const session = await newSession(app);
    const res = await request(app)
      .post('/api/orders/create')
      .set(session.headers)
      .send({ items: [{ productId: 'coffee', quantity: 1 }], merchantId: 'attacker-shop' });

    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe('TENANT_OVERRIDE_REJECTED');
  });

  test('tenant_id and business_id spellings are rejected as well', async () => {
    const session = await newSession(app);
    for (const field of ['tenant_id', 'business_id']) {
      const res = await request(app)
        .post('/api/orders/create')
        .set(session.headers)
        .send({ items: [{ productId: 'coffee', quantity: 1 }], [field]: 'x' });
      expect(res.status).toBe(400);
    }
  });

  test('a normal request without tenant fields still works', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/catalog')).status).toBe(200);
  });

  test('the PayPal webhook keeps its raw body and is NOT blocked by the tenant guard', async () => {
    // Signed-event verification happens first, so an unsigned event is rejected for its signature
    // (401) — the point is that it is not rejected by the tenant guard (400).
    const res = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-transmission-id', 't')
      .set('paypal-transmission-time', 't')
      .set('paypal-transmission-sig', 't')
      .set('paypal-cert-url', 'https://example.invalid/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({ id: 'evt_1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'c1' } });

    expect(res.status).toBe(401);
    expect(res.body.details?.code).not.toBe('TENANT_OVERRIDE_REJECTED');
  });
});

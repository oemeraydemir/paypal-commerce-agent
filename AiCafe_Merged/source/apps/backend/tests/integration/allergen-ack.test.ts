import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { shopperGuardStore, productDataVersion } from '../../src/policy/shopper-guard';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// PayPal is mocked: these tests prove the SERVER refuses/accepts, they do not claim a real
// Sandbox verification.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn() },
}));

const app = createApp();
let sess: TestSession;
let n = 0;

beforeEach(async () => {
  (paypalClient.createOrder as jest.Mock).mockImplementation(async () => ({
    id: `MOCK_PP_${++n}`,
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/approve' }],
  }));
  resetSessionState();
  shopperGuardStore.reset();
  sess = await newSession(app);
  await request(app).put('/api/guard').set(sess.headers).send({ allergens: ['gluten'] });
});

// quinoa_bowl has NO allergen declaration (unknown); espresso declares none (known).
const unknownItem = [{ productId: 'quinoa_bowl', quantity: 1 }];
const knownItem = [{ productId: 'espresso', quantity: 1 }];

describe('server-side confirmation for UNKNOWN allergen information', () => {
  test('direct order API call without acknowledgement is refused with a clear code', async () => {
    const res = await request(app).post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'ack-1').send({ items: unknownItem });
    expect(res.status).toBe(409);
    expect(res.body.code ?? res.body.details?.code).toBe('ALLERGEN_CONFIRMATION_REQUIRED');
    expect(JSON.stringify(res.body)).toMatch(/acknowledgeAllergenUnknown/);
  });

  test('an explicit acknowledgement creates the order', async () => {
    const res = await request(app).post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'ack-2').send({ items: unknownItem, acknowledgeAllergenUnknown: true });
    expect(res.status).toBe(201);
  });

  test('a non-boolean acknowledgement does not count', async () => {
    const res = await request(app).post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'ack-3').send({ items: unknownItem, acknowledgeAllergenUnknown: 'true' });
    expect(res.status).toBe(409);
  });

  test('items with a known allergen declaration need no acknowledgement', async () => {
    const res = await request(app).post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'ack-4').send({ items: knownItem });
    expect(res.status).toBe(201);
  });

  test('a declared conflict stays BLOCKED even with an acknowledgement', async () => {
    const res = await request(app).post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'ack-5').send({ items: [{ productId: 'croissant', quantity: 1 }], acknowledgeAllergenUnknown: true });
    expect(res.status).toBe(403);
  });

  test('Split Bill creation applies the same rule to the whole cart', async () => {
    const refused = await request(app).post('/api/bills').set(sess.headers)
      .send({ items: unknownItem, participantCount: 2 });
    expect(refused.status).toBe(409);
    const ok = await request(app).post('/api/bills').set(sess.headers)
      .send({ items: unknownItem, participantCount: 2, acknowledgeAllergenUnknown: true });
    expect(ok.status).toBe(201);
  });

  test('without a guard nothing changes (no acknowledgement needed)', async () => {
    shopperGuardStore.reset();
    const res = await request(app).post('/api/orders/create').set(sess.headers)
      .set('Idempotency-Key', 'ack-6').send({ items: unknownItem });
    expect(res.status).toBe(201);
  });

  test('the policy preview reports the product-data version used', async () => {
    const res = await request(app).post('/api/policy/preview').set(sess.headers).send({ items: unknownItem });
    const row = res.body.checks.find((c: { rule: string }) => c.rule === 'wellbeingGuard');
    expect(row.status).toBe('confirm');
    expect(row.dataVersion).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('productDataVersion', () => {
  test('changes when a label or declaration changes; stable otherwise; undeclared differs from empty', () => {
    const base = [{ id: 'a', dietary: ['vegan'], allergens: ['gluten'] }];
    expect(productDataVersion(base)).toBe(productDataVersion([{ id: 'a', dietary: ['vegan'], allergens: ['gluten'] }]));
    expect(productDataVersion(base)).not.toBe(productDataVersion([{ id: 'a', dietary: ['vegan'], allergens: [] }]));
    expect(productDataVersion(base)).not.toBe(productDataVersion([{ id: 'a', dietary: ['vegan'] }]));
    expect(productDataVersion([{ id: 'a', dietary: ['vegan'], allergens: [] }]))
      .not.toBe(productDataVersion([{ id: 'a', dietary: ['vegan'] }]));
    expect(productDataVersion([{ id: 'a', dietary: ['vegan', 'vegetarian'] }]))
      .toBe(productDataVersion([{ id: 'a', dietary: ['vegetarian', 'vegan'] }]));
  });
});

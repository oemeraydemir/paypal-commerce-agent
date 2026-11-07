import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState } from '../helpers/session';
import { evaluateWellbeing, parseWellbeingPreferences } from '../../src/wellbeing/service';
import { CatalogService } from '../../src/catalog/service';
import { policyStorage } from '../../src/policy/storage';
import { BillService } from '../../src/bills/service';

const app = createApp();
const catalog = new CatalogService();
let s: Awaited<ReturnType<typeof newSession>>;

beforeEach(async () => { resetSessionState(); BillService.getInstance().reset(); s = await newSession(app); });

describe('Wellbeing Guard authoritative contract', () => {
  test('supports multiple restrictions and treats unverified product data as UNKNOWN', async () => {
    const product = catalog.getAll()[0];
    await request(app).put('/api/wellbeing/preferences').set(s.headers).send({ preferences: { dietary: ['vegan', 'gluten-free'], allergens: ['peanut', 'fish'] } }).expect(200);
    const result = await request(app).post('/api/wellbeing/check').set(s.headers).send({ items: [{ productId: product.id, quantity: 1 }] }).expect(200);
    expect(result.body.status).toBe('UNKNOWN');
    expect(result.body.allowed).toBe(false);
    expect(result.body.items[0].missing).toEqual(expect.arrayContaining(['dietary:vegan', 'dietary:gluten-free', 'allergen:peanut', 'allergen:fish']));
    expect(result.body.items[0].productDataVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(result.body.notice).toMatch(/not medical advice/i);
  });

  test('rejects malformed and unauthenticated preference access', async () => {
    expect((await request(app).put('/api/wellbeing/preferences').send({ preferences: { dietary: [], allergens: [] } })).status).toBe(401);
    expect((await request(app).put('/api/wellbeing/preferences').set(s.headers).send({ preferences: { dietary: ['keto'], allergens: [] } })).status).toBe(400);
  });

  test('distinguishes confirmed conflicts, known no-conflict and unknown', () => {
    const p = catalog.getAll()[0];
    const enriched = Object.assign(Object.create(Object.getPrototypeOf(catalog)), catalog) as CatalogService;
    (enriched as any).products = [{ ...p, wellbeing: { dietary: { vegan: { status: 'CONFLICT', ingredients: ['milk'] }, vegetarian: { status: 'NO_CONFLICT' } }, allergens: { dairy: { status: 'CONFLICT', ingredients: ['milk'] } } } }];
    const conflict = evaluateWellbeing([{ productId: p.id, quantity: 1 }], { dietary: ['vegan'], allergens: ['dairy'] }, enriched);
    expect(conflict.status).toBe('CONFIRMED_CONFLICT');
    expect(conflict.items[0].conflicts[0].ingredients).toEqual(['milk']);
    const clear = evaluateWellbeing([{ productId: p.id, quantity: 1 }], { dietary: ['vegetarian'], allergens: [] }, enriched);
    expect(clear.status).toBe('NO_KNOWN_CONFLICT');
    expect(clear.allowed).toBe(true);
  });

  test('validates preference enum values', () => {
    expect(() => parseWellbeingPreferences({ dietary: [], allergens: ['unknown'] })).toThrow();
  });

  test('exposes per-restriction facts with merchant provenance and separate cross-contact', () => {
    const decision = evaluateWellbeing(
      [{ productId: 'veg_breakfast', quantity: 1 }, { productId: 'latte', quantity: 1 }],
      { dietary: [], allergens: ['gluten'] },
      catalog,
    );
    expect(decision.checked).toEqual([{ restriction: 'allergen:gluten', kind: 'allergen', key: 'gluten' }]);
    expect(decision.source.type).toBe('merchant-menu');
    expect(decision.source.verified).toBe(false);
    expect(decision.source.dataVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(decision.crossContact).toEqual({ assessed: false, merchantData: false });
    expect(decision.allowed).toBe(false);

    // The merchant description names gluten-bearing ingredients -> CONFLICT.
    const breakfast = decision.items[0];
    expect(breakfast.status).toBe('CONFIRMED_CONFLICT');
    expect(breakfast.facts[0].status).toBe('CONFLICT');
    expect(breakfast.facts[0].source).toBe('merchant-ingredients');
    expect(breakfast.facts[0].ingredients).toEqual(expect.arrayContaining(['toast', 'granola']));

    // Latte has neither a gluten-free label nor a named gluten ingredient -> UNKNOWN,
    // never guessed as safe. (Coffee is now labelled gluten-free, 35f078f.)
    const latte = decision.items[1];
    expect(latte.status).toBe('UNKNOWN');
    expect(latte.facts[0].status).toBe('UNKNOWN');
    expect(latte.facts[0].source).toBeNull();

    // The labelled product gets a merchant-label NO_CONFLICT, but the decision still
    // carries unverified provenance and no cross-contact assessment.
    const labelled = evaluateWellbeing(
      [{ productId: 'coffee', quantity: 1 }],
      { dietary: [], allergens: ['gluten'] },
      catalog,
    );
    expect(labelled.items[0].facts[0]).toMatchObject({ status: 'NO_CONFLICT', source: 'merchant-label' });
    expect(labelled.source.verified).toBe(false);
    expect(labelled.crossContact).toEqual({ assessed: false, merchantData: false });
  });

  test('direct order API cannot bypass missing profile or UNKNOWN restriction data', async () => {
    const product = catalog.getAll()[0];
    await request(app).put('/api/wellbeing/preferences').set(s.headers).send({ preferences: { dietary: ['vegan'], allergens: [] } });
    const response = await request(app).post('/api/orders/create').set(s.headers).send({ items: [{ productId: product.id, quantity: 1 }] });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('WELLBEING_GUARD_BLOCKED');
    expect(response.body.wellbeing.status).toBe('UNKNOWN');
    const evidence = policyStorage.getEvents(s.userId).find((event) => event.wellbeingDecision?.status === 'UNKNOWN');
    expect(evidence?.guardDataVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence?.wellbeingDecision?.items).toHaveLength(1);
  });

  test('checkout requires an initialized profile even when the caller skips the profile API', async () => {
    const fresh = await request(app).post('/api/sessions').expect(201);
    const headers = { 'X-Session-Id': fresh.body.sessionId, Authorization: `Bearer ${fresh.body.sessionToken}` };
    const product = catalog.getAll()[0];
    const response = await request(app).post('/api/orders/create').set(headers).send({ items: [{ productId: product.id, quantity: 1 }] });
    expect(response.status).toBe(428);
    expect(response.body.details.code).toBe('WELLBEING_PROFILE_REQUIRED');
  });

  test('Split Bill creation applies the whole-cart Wellbeing decision', async () => {
    await request(app).put('/api/wellbeing/preferences').set(s.headers).send({ preferences: { dietary: ['vegan'], allergens: [] } });
    const product = catalog.getAll()[0];
    const response = await request(app).post('/api/bills').set(s.headers).send({ items: [{ productId: product.id, quantity: 1 }], participantCount: 2 });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('WELLBEING_GUARD_BLOCKED');
    expect(response.body.wellbeing.status).toBe('UNKNOWN');
  });

  test('Split Bill share payment checks the participant profile against the bill products', async () => {
    const created = await request(app).post('/api/bills').set(s.headers).send({ items: [{ productId: 'latte', quantity: 1 }], participantCount: 2 });
    expect(created.status).toBe(201);
    const ownerShare = created.body.shares[0];
    await request(app).put('/api/wellbeing/preferences').set(s.headers).send({ preferences: { dietary: ['vegan'], allergens: [] } });
    const response = await request(app).post(`/api/bills/${created.body.id}/shares/${ownerShare.id}/pay`).set(s.headers).send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('WELLBEING_GUARD_BLOCKED');
    expect(response.body.wellbeing.status).toBe('UNKNOWN');
  });

  test('evaluates current product data version on each request', () => {
    const p = catalog.getAll()[0];
    const mutable = Object.assign(Object.create(Object.getPrototypeOf(catalog)), catalog) as CatalogService;
    (mutable as any).products = [{ ...p, wellbeing: { dietary: { vegan: { status: 'NO_CONFLICT' } }, dataVersion: 'version-one' } }];
    const first = evaluateWellbeing([{ productId: p.id, quantity: 1 }], { dietary: ['vegan'], allergens: [] }, mutable);
    (mutable as any).products = [{ ...p, wellbeing: { dietary: { vegan: { status: 'CONFLICT', ingredients: ['egg'] } }, dataVersion: 'version-two' } }];
    const second = evaluateWellbeing([{ productId: p.id, quantity: 1 }], { dietary: ['vegan'], allergens: [] }, mutable);
    expect(first.productDataVersion).not.toBe(second.productDataVersion);
    expect(second.status).toBe('CONFIRMED_CONFLICT');
  });
});

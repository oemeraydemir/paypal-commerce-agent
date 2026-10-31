import request from 'supertest';
import { createApp } from '../../src/app';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { evaluateWellbeing, parseDiet } from '../../src/wellbeing/service';
import { CatalogService } from '../../src/catalog/service';

const app = createApp();
const catalog = new CatalogService();
let s: TestSession;

beforeEach(async () => {
  resetSessionState();
  s = await newSession(app);
});

const veganItem = catalog.getAll().find((p) => p.dietary.includes('vegan'))!;
const plainItem = catalog.getAll().find((p) => !p.dietary.includes('vegan') && !p.dietary.includes('vegetarian'))!;

describe('wellbeing check: honesty rules', () => {
  test('always reports sample-data status and a confirm-with-café notice', async () => {
    const r = await request(app).post('/api/wellbeing/check').set(s.headers).send({ items: [{ productId: veganItem.id, quantity: 1 }], diet: 'vegan' });
    expect(r.status).toBe(200);
    expect(r.body.dataStatus).toBe('SAMPLE_DATA_UNVERIFIED');
    expect(r.body.confirmWithCafe).toBe(true);
    expect(r.body.notice).toMatch(/not been verified/i);
    expect(r.body.allergens.status).toBe('NO_DATA');
    expect(r.headers['cache-control']).toBe('no-store');
  });

  test('never claims safety, suitability or compliance anywhere in the response', async () => {
    const r = await request(app).post('/api/wellbeing/check').set(s.headers).send({ items: [{ productId: veganItem.id, quantity: 1 }], diet: 'vegan' });
    const text = JSON.stringify(r.body).toLowerCase();
    for (const bad of ['"safe"', 'is safe', 'allergen-free"', 'suitable', 'compliant":true', 'guarantee']) {
      expect(text).not.toContain(bad);
    }
  });

  test('allergens are refused: they never leave the device', async () => {
    const r = await request(app).post('/api/wellbeing/check').set(s.headers).send({ items: [{ productId: veganItem.id, quantity: 1 }], allergens: ['gluten'] });
    expect(r.status).toBe(400);
    expect(r.body.details?.code).toBe('ALLERGENS_NOT_ACCEPTED');
  });

  test('requires a session and validates input', async () => {
    expect((await request(app).post('/api/wellbeing/check').send({ items: [{ productId: veganItem.id, quantity: 1 }] })).status).toBe(401);
    expect((await request(app).post('/api/wellbeing/check').set(s.headers).send({ items: [{ productId: veganItem.id, quantity: 1 }], diet: 'keto' })).status).toBe(400);
    expect((await request(app).post('/api/wellbeing/check').set(s.headers).send({ items: [{ productId: 'nope', quantity: 1 }] })).status).toBeGreaterThanOrEqual(400);
    expect((await request(app).post('/api/wellbeing/check').set(s.headers).send({ items: [] })).status).toBe(400);
  });
});

describe('wellbeing check: label logic', () => {
  test('no preference means no judgement', () => {
    const r = evaluateWellbeing([{ productId: plainItem.id, quantity: 1 }], null, catalog);
    expect(r.overall).toBe('NO_PREFERENCE');
    expect(r.items[0].labelStatus).toBe('NO_PREFERENCE');
  });
  test('a vegan label satisfies vegetarian, but a vegetarian label never satisfies vegan', () => {
    const veg = catalog.getAll().find((p) => p.dietary.includes('vegetarian') && !p.dietary.includes('vegan'));
    expect(evaluateWellbeing([{ productId: veganItem.id, quantity: 1 }], 'vegetarian', catalog).overall).toBe('ALL_ITEMS_CARRY_LABEL');
    if (veg) expect(evaluateWellbeing([{ productId: veg.id, quantity: 1 }], 'vegan', catalog).overall).toBe('SOME_ITEMS_LACK_LABEL');
  });
  test('one unlabelled item flags the whole cart for a check with the café', () => {
    const r = evaluateWellbeing(
      [{ productId: veganItem.id, quantity: 1 }, { productId: plainItem.id, quantity: 1 }], 'vegan', catalog);
    expect(r.overall).toBe('SOME_ITEMS_LACK_LABEL');
    expect(r.items.map((i) => i.labelStatus)).toEqual(['CARRIES_LABEL', 'NO_LABEL']);
  });
  test('parseDiet only accepts the supported values', () => {
    expect(parseDiet(undefined)).toBeNull();
    expect(parseDiet('gluten-free')).toBe('gluten-free');
    expect(() => parseDiet('paleo')).toThrow();
  });
});

describe('data-status labelling elsewhere', () => {
  test('the catalog API states that diet labels are unverified sample data', async () => {
    const r = await request(app).get('/api/catalog');
    expect(r.body.dietaryDataStatus).toBe('SAMPLE_DATA_UNVERIFIED');
    expect(r.body.dietaryNotice).toMatch(/sample data/i);
  });
});

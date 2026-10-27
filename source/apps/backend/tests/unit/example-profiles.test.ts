import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { parseBusinessProfile } from '../../src/config/business-profile';

const DIR = path.resolve(__dirname, '../../examples/business-profiles');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

/** Boots the app with BUSINESS_PROFILE_PATH set (modules read it at import time). */
function withProfile<T>(file: string, fn: (mods: { createApp: () => any }) => Promise<T>): Promise<T> {
  const previous = process.env.BUSINESS_PROFILE_PATH;
  process.env.BUSINESS_PROFILE_PATH = file;
  return new Promise<T>((resolve, reject) => {
    jest.isolateModules(() => {
      fn(require('../../src/app')).then(resolve, reject);
    });
  }).finally(() => {
    if (previous === undefined) delete process.env.BUSINESS_PROFILE_PATH;
    else process.env.BUSINESS_PROFILE_PATH = previous;
  });
}

describe('shipped example merchants (the same code serves any business)', () => {
  test('there are examples from several kinds of business and currencies', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(4);
    const currencies = new Set(FILES.map((f) => parseBusinessProfile(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))).business.currency));
    expect(currencies.size).toBeGreaterThanOrEqual(3);
  });

  describe.each(FILES)('%s', (file) => {
    const full = path.join(DIR, file);
    const profile = parseBusinessProfile(JSON.parse(fs.readFileSync(full, 'utf8')));

    test('is a valid profile whose products fit the merchant limits', () => {
      expect(profile.products.every((p) => p.priceMinor <= profile.business.maxOrderValueMinor)).toBe(true);
      expect(profile.business.allowAutonomousPurchase).toBe(false);
    });

    // 30s: each case re-imports src/app through jest.isolateModules(), so ts-jest compiles the
    // module graph again. The first case needs ~3.5s on an idle machine and exceeded Jest's 5s
    // default under full-suite load, which made this a flaky failure rather than a real one.
    test('boots as that merchant: manifest, feed, catalog and prices all come from the profile', async () => {
      await withProfile(full, async ({ createApp }) => {
        const app = createApp();
        const manifest = await request(app).get('/.well-known/agent-commerce.json').set('Host', 'shop.example');
        expect(manifest.status).toBe(200);
        expect(manifest.body.merchant).toMatchObject({ id: profile.business.businessId, name: profile.business.name, currency: profile.business.currency });
        expect(manifest.body.guardrails).toMatchObject({ agentCanPay: false, agentCanCapture: false, agentCanRefund: false });

        const feed = await request(app).get('/api/feed/products').set('Host', 'shop.example');
        expect(feed.body.numberOfItems).toBe(profile.products.length);
        for (const el of feed.body.itemListElement) {
          const p = profile.products.find((x) => x.id === el.item.sku)!;
          expect(el.item.offers.price).toBe((p.priceMinor / 100).toFixed(2));
          expect(el.item.offers.priceCurrency).toBe(profile.business.currency);
        }

        const cat = await request(app).get('/api/catalog');
        expect(cat.body.count).toBe(profile.products.length);
        const { body: health } = await request(app).get('/api/health');
        expect(health.status).toBe('ok');
      });
    }, 30_000);
  });
});

describe('the rule-based planner (no LLM key) also understands non-food merchants', () => {
  const planWith = (file: string, text: string) => {
    const previous = process.env.BUSINESS_PROFILE_PATH;
    process.env.BUSINESS_PROFILE_PATH = path.join(DIR, file);
    try {
      let plan: any;
      jest.isolateModules(() => {
        plan = require('../../src/ai/fallback-planner').planFallbackCart(text, { dietary: [] });
      });
      return plan;
    } finally {
      if (previous === undefined) delete process.env.BUSINESS_PROFILE_PATH;
      else process.env.BUSINESS_PROFILE_PATH = previous;
    }
  };
  const ids = (plan: any) => plan.items.map((i: any) => i.productId).sort();

  test('bike repair: services and parts by name', () => {
    expect(ids(planWith('city-bike-repair.json', 'a tune-up and a puncture repair under 60 euro'))).toEqual(['basic-tune-up', 'puncture-repair']);
    expect(planWith('city-bike-repair.json', 'a tune-up and a puncture repair under 60 euro').fits).toBe(true);
    expect(ids(planWith('city-bike-repair.json', 'I need lights and a lock for commuting'))).toEqual(['led-light-set', 'u-lock']);
  });

  test('bookshop: titles by name, and a budget that is too small is reported, not hidden', () => {
    expect(ids(planWith('indie-bookshop.json', 'a mystery paperback and a picture book as a gift under 40'))).toEqual(['mystery-paperback', 'picture-book']);
    const tight = planWith('indie-bookshop.json', 'the mystery paperback and the picture book under 10');
    expect(tight.understood).toBe(true);
    expect(tight.fits).toBe(false);
  });

  test('a vague or unrelated message is still "not understood" (no random cart)', () => {
    for (const f of ['city-bike-repair.json', 'indie-bookshop.json']) {
      const plan = planWith(f, 'tell me a joke about the weather');
      expect(plan.understood).toBe(false);
      expect(plan.items).toHaveLength(0);
    }
  });
});

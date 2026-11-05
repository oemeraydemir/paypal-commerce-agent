import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseBusinessProfile } from '../../src/config/business-profile';

const BAKERY = path.resolve(__dirname, '../../examples/business-profiles/corner-bakery.json');

/** Loads the app modules fresh with BUSINESS_PROFILE_PATH set (modules read it at import). */
function withProfile<T>(file: string | undefined, fn: () => T): T {
  const previous = process.env.BUSINESS_PROFILE_PATH;
  if (file === undefined) delete process.env.BUSINESS_PROFILE_PATH;
  else process.env.BUSINESS_PROFILE_PATH = file;
  try {
    let out!: T;
    jest.isolateModules(() => {
      out = fn();
    });
    return out;
  } finally {
    if (previous === undefined) delete process.env.BUSINESS_PROFILE_PATH;
    else process.env.BUSINESS_PROFILE_PATH = previous;
  }
}

describe('business profile', () => {
  test('the shipped example is valid', () => {
    const profile = parseBusinessProfile(JSON.parse(fs.readFileSync(BAKERY, 'utf8')));
    expect(profile.business.businessId).toBe('corner-bakery');
    expect(profile.products.length).toBeGreaterThan(5);
  });

  test('default (no profile) stays AI Café with its 25 products', () => {
    withProfile(undefined, () => {
      const { currentBusiness } = require('../../src/config/business-config');
      const { CatalogService } = require('../../src/catalog/service');
      expect(currentBusiness.name).toBe('AI Café');
      expect(new CatalogService().getAll()).toHaveLength(25);
    });
  });

  test('a custom profile replaces name, currency, limits, catalog, policy and tool categories', () => {
    withProfile(BAKERY, () => {
      const { currentBusiness } = require('../../src/config/business-config');
      const { CatalogService } = require('../../src/catalog/service');
      const { defaultPolicy } = require('../../src/policy/default-policy');
      const { AI_TOOLS } = require('../../src/ai/tools');
      const catalog = new CatalogService();

      expect(currentBusiness).toMatchObject({ businessId: 'corner-bakery', name: 'Corner Bakery', maxOrderValueMinor: 6000 });
      expect(catalog.getById('sourdough')?.priceMinor).toBe(480);
      expect(catalog.getById('coffee')).toBeUndefined(); // AI Café items are gone
      expect(catalog.getCategories().sort()).toEqual(['bread', 'drinks', 'gifts', 'pastry']);
      expect(defaultPolicy.allowedMerchantIds).toEqual(['corner-bakery']);
      const categoryEnum = AI_TOOLS[0].function.parameters.properties.category.enum;
      expect(categoryEnum.sort()).toEqual(['bread', 'drinks', 'gifts', 'pastry']);
    });
  });

  test('the rule-based planner understands the custom categories', () => {
    withProfile(BAKERY, () => {
      const { planFallbackCart } = require('../../src/ai/fallback-planner');
      const plan = planFallbackCart('fresh bread and a filter coffee for two under €20', { dietary: [] });
      expect(plan.understood).toBe(true);
      const ids = plan.items.map((i: any) => i.productId);
      expect(ids.some((id: string) => ['sourdough', 'rye-loaf'].includes(id))).toBe(true);
    });
  });

  test('an invalid profile stops the boot with one readable message', () => {
    const bad = path.join(os.tmpdir(), `bad-profile-${Date.now()}.json`);
    fs.writeFileSync(
      bad,
      JSON.stringify({
        business: { businessId: 'X', name: '', currency: 'euro' },
        products: [
          { id: 'a', name: 'A', priceMinor: 100, category: 'x' },
          { id: 'a', name: 'B', priceMinor: -5, category: 'Bad Cat' },
        ],
      })
    );
    try {
      expect(() => withProfile(bad, () => require('../../src/config/business-config'))).toThrow(
        /Invalid business profile[\s\S]*currency[\s\S]*duplicate product id "a"/
      );
    } finally {
      fs.unlinkSync(bad);
    }
  });

  test('a missing file is reported with its path', () => {
    expect(() => withProfile('/nope/missing.json', () => require('../../src/config/business-config'))).toThrow(
      /BUSINESS_PROFILE_PATH is set but .*missing\.json/
    );
  });
});

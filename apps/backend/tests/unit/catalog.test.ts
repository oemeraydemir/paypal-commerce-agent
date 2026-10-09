import { CatalogService } from '../../src/catalog/service';

describe('CatalogService', () => {
  const catalog = new CatalogService();

  it('returns all 8 available products', () => {
    const products = catalog.getAll();
    expect(products.length).toBe(8);
  });

  it('returns a product by id with minor price + dietary/occasion fields', () => {
    const p = catalog.getById('coffee');
    expect(p).toBeDefined();
    expect(p?.name).toBe('Fresh Brewed Coffee');
    expect(p?.priceMinor).toBe(300); // minor unit (cents)
    expect(Array.isArray(p?.dietary)).toBe(true);
    expect(Array.isArray(p?.occasion)).toBe(true);
  });

  it('returns undefined for an unknown id', () => {
    expect(catalog.getById('does-not-exist')).toBeUndefined();
  });

  it('filters by category', () => {
    const drinks = catalog.search({ category: 'drinks' });
    expect(drinks.length).toBeGreaterThan(0);
    expect(drinks.every((p) => p.category === 'drinks')).toBe(true);
  });

  it('filters by dietary (matchMode all)', () => {
    const vegan = catalog.search({ dietary: ['vegan'], matchMode: 'all' });
    expect(vegan.length).toBeGreaterThan(0);
    expect(vegan.every((p) => p.dietary.includes('vegan'))).toBe(true);
  });

  it('filters by dietary (matchMode any)', () => {
    const vegOrGf = catalog.search({ dietary: ['vegan', 'gluten-free'], matchMode: 'any' });
    expect(vegOrGf.every((p) => p.dietary.includes('vegan') || p.dietary.includes('gluten-free'))).toBe(true);
  });

  it('respects maxPriceMinor using !== undefined (CRITICAL FIX #15)', () => {
    const cheap = catalog.search({ maxPriceMinor: 500 });
    expect(cheap.every((p) => p.priceMinor <= 500)).toBe(true);

    // Regression guard: a 0 ceiling must be honored, not skipped by a truthy check.
    const zero = catalog.search({ maxPriceMinor: 0 });
    expect(zero.length).toBe(0);
  });

  it('every product exposes required AI/catalog fields', () => {
    for (const p of catalog.getAll()) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.priceMinor).toBe('number');
      expect(Array.isArray(p.tags)).toBe(true);
      expect(Array.isArray(p.dietary)).toBe(true);
      expect(Array.isArray(p.occasion)).toBe(true);
    }
  });
});

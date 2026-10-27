import {
  parseBudgetMinor,
  parsePeople,
  parseDietary,
  planFallbackCart,
} from '../../src/ai/fallback-planner';
import { CatalogService } from '../../src/catalog/service';

const catalog = new CatalogService();
const total = (items: Array<{ productId: string; quantity: number }>) =>
  items.reduce((s, i) => s + catalog.getById(i.productId)!.priceMinor * i.quantity, 0);

describe('fallback planner parsing', () => {
  test.each([
    ['breakfast for two under €20', 2000],
    ['I have 15 euros', 1500],
    ['budget of 12.50', 1250],
    ['max 8,50 eur', 850],
    ['just a coffee', undefined],
  ])('budget in "%s"', (text, expected) => {
    expect(parseBudgetMinor(text)).toBe(expected);
  });

  test.each([
    ['breakfast for two', 2],
    ['lunch for 3 people', 3],
    ['we are 4 of us', 4],
    ['coffee for 20 euros', 1], // "for 20 euros" is a budget, not 20 people
    ['for 4 under €30', 4],
  ])('people in "%s"', (text, expected) => {
    expect(parsePeople(text)).toBe(expected);
  });

  test('dietary words', () => {
    expect(parseDietary('vegan and gluten free please')).toEqual(['vegan', 'gluten-free']);
    expect(parseDietary('a veggie lunch')).toEqual(['vegetarian']);
  });
});

describe('fallback planner cart building', () => {
  test('vegetarian breakfast for two under €20 stays inside the budget', () => {
    const plan = planFallbackCart('vegetarian breakfast for two under €20', { dietary: [] });
    expect(plan.understood && plan.fits).toBe(true);
    expect(total(plan.items)).toBeLessThanOrEqual(2000);
    for (const i of plan.items) {
      const p = catalog.getById(i.productId)!;
      expect(p.dietary.some((d) => d === 'vegetarian' || d === 'vegan')).toBe(true);
    }
    expect(plan.items.some((i) => catalog.getById(i.productId)!.category === 'breakfast' && i.quantity === 2)).toBe(true);
  });

  test('never adds alcohol, even when asked', () => {
    const plan = planFallbackCart('wine and a drink', { dietary: [] });
    for (const i of plan.items) expect(catalog.getById(i.productId)!.dietary).not.toContain('alcohol');
  });

  test('honours the shopper profile as a hard constraint', () => {
    const plan = planFallbackCart('lunch', { dietary: ['gluten-free', 'vegan'] });
    for (const i of plan.items) {
      const p = catalog.getById(i.productId)!;
      expect(p.dietary).toEqual(expect.arrayContaining(['gluten-free']));
    }
  });

  test('uses the lowest of message budget, profile budget and policy cap', () => {
    const plan = planFallbackCart('breakfast under 30', { dietary: [], maxBudgetMinor: 1500 }, 2000);
    expect(plan.budgetMinor).toBe(1500);
    expect(total(plan.items)).toBeLessThanOrEqual(1500);
  });

  test('reports honestly when nothing fits the budget', () => {
    const plan = planFallbackCart('breakfast for 5 under €3', { dietary: [] });
    expect(plan.fits).toBe(false);
    expect(plan.summary).toMatch(/over your budget/);
  });

  test('says it did not understand instead of guessing', () => {
    const plan = planFallbackCart('asdf qwerty', { dietary: [] });
    expect(plan.understood).toBe(false);
    expect(plan.items).toEqual([]);
  });

  test('gifts and catering are not multiplied per person', () => {
    const plan = planFallbackCart('office catering for 8', { dietary: [] });
    const caterItem = plan.items.find((i) => catalog.getById(i.productId)!.category === 'catering');
    expect(caterItem?.quantity).toBe(1);
  });
});

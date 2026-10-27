import path from 'path';

// The rule-based planner must read a budget in the CONFIGURED business currency. Before this
// test existed, "under $40" was silently ignored for a USD merchant, so the planner could build
// a cart above the shopper's stated budget and still report fits: true. That is a truthfulness
// bug, not a formatting one.
const DIR = path.resolve(__dirname, '../../examples/business-profiles');

/** Imports the planner with BUSINESS_PROFILE_PATH set (business config is read at import time). */
function withProfile<T>(file: string | null, fn: (mod: typeof import('../../src/ai/fallback-planner')) => T): T {
  const previous = process.env.BUSINESS_PROFILE_PATH;
  if (file === null) delete process.env.BUSINESS_PROFILE_PATH;
  else process.env.BUSINESS_PROFILE_PATH = path.join(DIR, file);
  try {
    let out!: T;
    jest.isolateModules(() => {
      out = fn(require('../../src/ai/fallback-planner'));
    });
    return out;
  } finally {
    if (previous === undefined) delete process.env.BUSINESS_PROFILE_PATH;
    else process.env.BUSINESS_PROFILE_PATH = previous;
  }
}

describe('budget parsing follows the business currency', () => {
  test('USD merchant understands the dollar sign (the reported bug)', () => {
    const { parseBudgetMinor } = withProfile('indie-bookshop.json', (m) => m);
    expect(parseBudgetMinor('under $40')).toBe(4000);
    expect(parseBudgetMinor('below $40')).toBe(4000);
    expect(parseBudgetMinor('$40 budget')).toBe(4000);
    expect(parseBudgetMinor('a mystery paperback under $25')).toBe(2500);
    expect(parseBudgetMinor('40 dollars')).toBe(4000);
  });

  test('GBP merchant understands the pound sign', () => {
    const { parseBudgetMinor } = withProfile('language-school.json', (m) => m);
    expect(parseBudgetMinor('under £30')).toBe(3000);
    expect(parseBudgetMinor('£30')).toBe(3000);
    expect(parseBudgetMinor('30 pounds')).toBe(3000);
  });

  test('a foreign currency symbol is NOT read as a budget', () => {
    const { parseBudgetMinor } = withProfile('indie-bookshop.json', (m) => m);
    // A USD shop must not treat "€40" as 40 USD.
    expect(parseBudgetMinor('€40')).toBeUndefined();
    expect(parseBudgetMinor('40 euros')).toBeUndefined();
  });

  test('the built-in AI Café (EUR) behaviour is unchanged', () => {
    const { parseBudgetMinor } = withProfile(null, (m) => m);
    expect(parseBudgetMinor('breakfast for two under €20')).toBe(2000);
    expect(parseBudgetMinor('I have 15 euros')).toBe(1500);
    expect(parseBudgetMinor('budget of 12.50')).toBe(1250);
    expect(parseBudgetMinor('max 8,50 eur')).toBe(850);
    expect(parseBudgetMinor('just a coffee')).toBeUndefined();
  });

  test('a budget the cart cannot meet is reported, not hidden', () => {
    const { planFallbackCart } = withProfile('indie-bookshop.json', (m) => m);
    // mystery-paperback is $15.99; a $5 budget must not be reported as "fits".
    const plan = planFallbackCart('the mystery paperback under $5', { dietary: [] });
    expect(plan.understood).toBe(true);
    expect(plan.budgetMinor).toBe(500);
    expect(plan.fits).toBe(false);
    expect(plan.summary).toMatch(/\$5\.00/);
  });

  test('a budget the cart meets is accepted', () => {
    const { planFallbackCart } = withProfile('indie-bookshop.json', (m) => m);
    const plan = planFallbackCart('the mystery paperback under $25', { dietary: [] });
    expect(plan.budgetMinor).toBe(2500);
    expect(plan.fits).toBe(true);
    expect(plan.items).toEqual([{ productId: 'mystery-paperback', quantity: 1 }]);
  });
});

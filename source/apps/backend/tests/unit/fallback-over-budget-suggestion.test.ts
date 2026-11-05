import { runFallbackAssistant } from '../../src/ai/fallback-planner';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('rule-based planner: over-budget suggestion for a manual "add anyway"', () => {
  const ctx = { sessionId: 'over-budget-session', userId: 'over-budget-user' };

  test('a named item above the budget returns a suggestion but never a prepared cart', () => {
    const r = runFallbackAssistant('A birthday treat for a friend', { dietary: [], maxBudgetMinor: 700 } as any, ctx, { aiConfigured: true });
    expect(r.mode).toBe('rule-based');
    expect(r.response).toMatch(/over your budget/);
    expect(r.preparedCart).toBeNull();
    expect(r.checkoutReady).toBe(false);
    expect(r.suggestion).not.toBeNull();
    expect(r.suggestion!.reason).toBe('OVER_BUDGET');
    expect(r.suggestion!.budgetMinor).toBe(700);
    expect(r.suggestion!.totalMinor).toBeGreaterThan(700);
    expect(r.suggestion!.items.length).toBeGreaterThan(0);
    expect(r.suggestion!.currency).toBe('EUR');
    expect(r.suggestion!.items[0]).toEqual(expect.objectContaining({ unitPriceMinor: expect.any(Number), unitPriceFormatted: expect.any(String), lineTotalMinor: expect.any(Number), lineTotalFormatted: expect.any(String) }));
    expect(r.suggestion!.items.reduce((s, i) => s + i.lineTotalMinor, 0)).toBe(r.suggestion!.totalMinor);
    expect(r.suggestion!.items[0]).toEqual(expect.objectContaining({ productId: expect.any(String), name: expect.any(String), quantity: expect.any(Number) }));
  });

  test('a cart that fits has no suggestion and keeps its prepared cart', () => {
    const r = runFallbackAssistant('coffee for two', { dietary: [] } as any, ctx, { aiConfigured: true });
    expect(r.preparedCart).not.toBeNull();
    expect(r.suggestion).toBeNull();
  });

  test('an unclear request has no suggestion', () => {
    const r = runFallbackAssistant('zzzz qqqq', { dietary: [] } as any, ctx, { aiConfigured: true });
    expect(r.preparedCart).toBeNull();
    expect(r.suggestion).toBeNull();
  });
});

describe('storefront renders the manual add button', () => {
  const js = readFileSync(join(__dirname, '../../public/app.js'), 'utf8');
  const i18n = readFileSync(join(__dirname, '../../public/i18n.js'), 'utf8');

  test('button is wired to the response suggestion and is not a quick-reply chip', () => {
    expect(js).toContain("r.mode === 'rule-based' && !r.preparedCart && r.suggestion");
    expect(js).toContain("el('button', 'suggest-add'");
  });

  test('hint and button texts exist in English and Turkish', () => {
    expect((i18n.match(/'suggest\.hint'/g) || []).length).toBe(2);
    expect((i18n.match(/'suggest\.add'/g) || []).length).toBe(2);
    expect((i18n.match(/'suggest\.added'/g) || []).length).toBe(2);
  });
});

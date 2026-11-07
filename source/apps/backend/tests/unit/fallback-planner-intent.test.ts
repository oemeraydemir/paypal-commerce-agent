import { planFallbackCart } from '../../src/ai/fallback-planner';
import { CatalogService } from '../../src/catalog/service';

const catalog = new CatalogService();
const categoryOf = (id: string) => catalog.getById(id)!.category;

describe('rule-based planner keeps the intent of the request', () => {
  test('vegetarian breakfast for two: only breakfast items (+ drinks), never a drink-only cart', () => {
    const plan = planFallbackCart('Plan a vegetarian breakfast for two under €20', { dietary: [] } as any, 2000);
    expect(plan.fits).toBe(true);
    const cats = plan.items.map((i) => categoryOf(i.productId));
    expect(cats).toContain('breakfast');
    expect(plan.items.find((i) => categoryOf(i.productId) === 'breakfast')!.quantity).toBe(2);
  });

  test('a real breakfast when one matches, and an honest explanation when none does', () => {
    const profile = { dietary: ['gluten-free', 'vegetarian'], maxBudgetMinor: 3400 } as any;
    const request = 'Plan a vegetarian breakfast for two under €20';

    // Oat Porridge is now labelled gluten-free (95ef131, fixes checkout 403), so the
    // demo profile IS satisfiable on the real menu and must produce a breakfast main.
    const real = planFallbackCart(request, profile, 2000);
    expect(real.understood).toBe(true);
    expect(real.fits).toBe(true);
    expect(real.items.map((i) => categoryOf(i.productId))).toContain('breakfast');

    // Keep the original regression: on a menu where NO breakfast item is gluten-free,
    // the planner must not silently answer with only a drink ("an iced tea").
    const restrictedMenu = catalog.getAll().map((p) =>
      p.category === 'breakfast' ? { ...p, dietary: p.dietary.filter((d) => d !== 'gluten-free') } : p
    );
    const plan = planFallbackCart(request, profile, 2000, restrictedMenu);
    expect(plan.understood).toBe(true);
    expect(plan.fits).toBe(false);
    expect(plan.items).toEqual([]);
    expect(plan.summary).toMatch(/breakfast/i);
    expect(plan.summary).toMatch(/gluten-free/i);
  });

  test('a drink-only request (coffee for two) still works', () => {
    const plan = planFallbackCart('coffee for two', { dietary: [] } as any, 2000);
    expect(plan.fits).toBe(true);
    expect(plan.items.every((i) => categoryOf(i.productId) === 'drinks')).toBe(true);
  });
});

describe('rule-based notice says why there is no AI', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { runFallbackAssistant } = require('../../src/ai/fallback-planner');
  const ctx = { sessionId: 'notice-session', userId: 'notice-user' };

  test('no provider configured → "not configured", not "at capacity"', () => {
    const r = runFallbackAssistant('coffee for two', { dietary: [] }, ctx, { aiConfigured: false });
    expect(r.response).toMatch(/No AI provider is configured/);
    expect(r.response).not.toMatch(/at capacity/);
    expect(r.mode).toBe('rule-based');
  });

  test('providers configured but exhausted → "at capacity"', () => {
    const r = runFallbackAssistant('coffee for two', { dietary: [] }, ctx, { aiConfigured: true });
    expect(r.response).toMatch(/at capacity/);
  });

  test('default (unknown) keeps the previous wording', () => {
    expect(runFallbackAssistant('coffee for two', { dietary: [] }, ctx).response).toMatch(/at capacity/);
  });
});

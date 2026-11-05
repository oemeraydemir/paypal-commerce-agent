import { CatalogService } from '../../src/catalog/service';
import { Order, OrderOrigin, OrderStatus } from '../../src/orders/domain';
import { policyBlockReason, PurchasePolicy } from '../../src/policy/domain';
import { PolicyService } from '../../src/policy/service';
import { ShopperGuardStore, shopperGuardStore } from '../../src/policy/shopper-guard';

const catalog = new CatalogService();
const policyService = new PolicyService(catalog);

const policy: PurchasePolicy = {
  id: 'p', userId: 'u', currency: 'EUR', maxPerPurchaseMinor: 5000, dailySpendLimitMinor: 10000,
  allowedMerchantIds: [], blockedCategoryIds: [], requiredDietaryAttributes: [], blockedDietaryAttributes: [],
  confirmationThresholdMinor: 4000, enabled: true,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
};

function orderFor(productId: string): Order {
  const p = catalog.getById(productId)!;
  return {
    id: 'o', sessionId: 's', status: OrderStatus.CART_READY, origin: OrderOrigin.HUMAN,
    items: [{ productId, name: p.name, quantity: 1, unitPriceMinor: p.priceMinor, lineTotalMinor: p.priceMinor }],
    totalMinor: p.priceMinor, currency: 'EUR', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  };
}
const ctx = (g?: { diet?: string; diets?: string[]; allergens: string[] }) => ({
  merchantId: 'ai-cafe', currentDailySpendMinor: 0, pendingReservationsMinor: 0,
  ...(g ? { shopperGuard: shopperGuardStore.set('u', g) } : {}),
});

describe('Wellbeing Guard (policy rules)', () => {
  test('no guard: behaves exactly as before', () => {
    expect(policyService.evaluatePurchase(orderFor('croissant'), policy, ctx()).decision).toBe('AUTO_ALLOW');
  });

  test('a declared allergen conflict BLOCKS and names the allergen', () => {
    const ev = policyService.evaluatePurchase(orderFor('croissant'), policy, ctx({ allergens: ['gluten'] }));
    expect(ev.decision).toBe('BLOCK');
    expect(ev.violations.map((v) => v.type)).toContain('GUARD_ALLERGEN_CONFLICT');
    expect(policyBlockReason(ev.violations.map((v) => v.type), ev.decision)).toMatch(/allergen/i);
  });

  test('a declared allergen-free item passes', () => {
    expect(policyService.evaluatePurchase(orderFor('espresso'), policy, ctx({ allergens: ['gluten', 'dairy'] })).decision).toBe('AUTO_ALLOW');
  });

  test('an UNDECLARED item is unknown, never allergen-free: it needs confirmation', () => {
    const ev = policyService.evaluatePurchase(orderFor('office_pastry_box'), policy, ctx({ allergens: ['gluten'] }));
    expect(ev.violations.map((v) => v.type)).toContain('GUARD_ALLERGEN_UNVERIFIED');
    expect(ev.decision).toBe('REQUIRE_CONFIRMATION');
  });

  test('diet: vegetarian accepts vegan, rejects unlabelled meat', () => {
    expect(policyService.evaluatePurchase(orderFor('espresso'), policy, ctx({ diet: 'vegetarian', allergens: [] })).decision).toBe('AUTO_ALLOW');
    const ev = policyService.evaluatePurchase(orderFor('club_sandwich'), policy, ctx({ diet: 'vegetarian', allergens: [] }));
    expect(ev.decision).toBe('BLOCK');
    expect(ev.violations.map((v) => v.type)).toContain('GUARD_DIET_NOT_MET');
  });

  test('several diets are ALL enforced (vegetarian + gluten-free)', () => {
    const both = { diets: ['vegetarian', 'gluten-free'], allergens: [] as string[] };
    // croissant is vegetarian but not labelled gluten-free
    expect(policyService.evaluatePurchase(orderFor('croissant'), policy, ctx(both)).decision).toBe('BLOCK');
    // the quinoa bowl carries both labels
    expect(policyService.evaluatePurchase(orderFor('quinoa_bowl'), policy, ctx(both)).decision).toBe('AUTO_ALLOW');
  });

  test('violation messages show euros, not raw minor units', () => {
    const low = { ...policy, confirmationThresholdMinor: 100 };
    const ev = policyService.evaluatePurchase(orderFor('latte'), low, ctx());
    const msg = ev.violations.find((v) => v.type === 'CONFIRMATION_THRESHOLD_EXCEEDED')!.message;
    expect(msg).toMatch(/€\d/);
    expect(msg).not.toMatch(/\b\d{3,}\b/);
  });
});

describe('ShopperGuardStore', () => {
  test('validates input and never accepts unknown keys', () => {
    const s = new ShopperGuardStore();
    expect(() => s.set('u', { allergens: ['plutonium'] })).toThrow();
    expect(() => s.set('u', { diet: 'carnivore' })).toThrow();
    expect(s.set('v', { diets: ['vegan', 'gluten-free', 'vegan'] }).diets).toEqual(['vegan', 'gluten-free']);
    const g = s.set('u', { diet: 'vegan', allergens: ['gluten', 'gluten', 'soy'] });
    expect(g.allergens).toEqual(['gluten', 'soy']);
    expect(s.get('u')?.diet).toBe('vegan');
    // An empty update is a no-op: it must NOT wipe a guard the shopper already has
    // (defense-in-depth against a client that syncs empty prefs on startup).
    s.set('u', { diets: [], allergens: [] });
    expect(s.get('u')?.diet).toBe('vegan');
    // Explicit clearing is clear() (DELETE /api/guard), not an empty set.
    s.clear('u');
    expect(s.get('u')).toBeUndefined();
  });
});

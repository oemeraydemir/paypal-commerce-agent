import { CatalogService } from '../../src/catalog/service';
import { Order, OrderOrigin, OrderStatus } from '../../src/orders/domain';
import { policyBlockReason, PurchasePolicy } from '../../src/policy/domain';
import { PolicyService } from '../../src/policy/service';

// Priority 4: the richer, risk-style policy rules (time window, per-category
// budget, order frequency, geo placeholder). Every rule is OPTIONAL and only
// fires when the corresponding policy field is configured, so a default policy
// behaves exactly as before.

const catalog = new CatalogService();
const policyService = new PolicyService(catalog);

function createPolicy(overrides: Partial<PurchasePolicy> = {}): PurchasePolicy {
  return {
    id: 'policy-1',
    userId: 'user-1',
    currency: 'EUR',
    maxPerPurchaseMinor: 5000,
    dailySpendLimitMinor: 10000,
    allowedMerchantIds: [],
    blockedCategoryIds: [],
    requiredDietaryAttributes: [],
    blockedDietaryAttributes: [],
    confirmationThresholdMinor: 4000,
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function orderFor(productId: string, lineTotalMinor: number): Order {
  const product = catalog.getById(productId);
  if (!product) throw new Error(`Test fixture product not found: ${productId}`);
  return {
    id: 'order-1',
    sessionId: 'session-1',
    status: OrderStatus.CART_READY,
    origin: OrderOrigin.HUMAN,
    items: [
      {
        productId,
        name: product.name,
        quantity: 1,
        unitPriceMinor: product.priceMinor,
        lineTotalMinor,
      },
    ],
    totalMinor: lineTotalMinor,
    currency: 'EUR',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function ctx(extra: Record<string, unknown> = {}) {
  return {
    merchantId: 'ai-cafe',
    currentDailySpendMinor: 0,
    pendingReservationsMinor: 0,
    ...extra,
  };
}

function types(result: ReturnType<PolicyService['evaluatePurchase']>): string[] {
  return result.violations.map((v) => v.type);
}

describe('Priority 4: enriched policy rules', () => {
  test('a default policy (no new fields) still auto-allows — fully backward compatible', () => {
    const result = policyService.evaluatePurchase(orderFor('coffee', 300), createPolicy(), ctx());
    expect(result.decision).toBe('AUTO_ALLOW');
    expect(result.violations).toHaveLength(0);
  });

  describe('night / quiet-hours window', () => {
    const policy = createPolicy({
      nightWindow: { startHour: 23, endHour: 6, maxMinor: 1000 },
    });

    test('blocks a cart above the cap inside the window (wraps midnight)', () => {
      const result = policyService.evaluatePurchase(
        orderFor('coffee', 1500),
        policy,
        ctx({ now: new Date('2026-01-01T23:30:00.000Z') })
      );
      expect(result.decision).toBe('BLOCK');
      expect(types(result)).toContain('TIME_WINDOW_LIMIT_EXCEEDED');
      const v = result.violations.find((x) => x.type === 'TIME_WINDOW_LIMIT_EXCEEDED')!;
      expect(v.rule).toBe('nightWindow');
      expect(v.expected).toBe(1000);
      expect(v.actual).toBe(1500);
    });

    test('allows the same cart outside the window', () => {
      const result = policyService.evaluatePurchase(
        orderFor('coffee', 1500),
        policy,
        ctx({ now: new Date('2026-01-01T12:00:00.000Z') })
      );
      expect(result.decision).toBe('AUTO_ALLOW');
      expect(types(result)).not.toContain('TIME_WINDOW_LIMIT_EXCEEDED');
    });

    test('allows a small cart inside the window', () => {
      const result = policyService.evaluatePurchase(
        orderFor('coffee', 800),
        policy,
        ctx({ now: new Date('2026-01-01T02:00:00.000Z') })
      );
      expect(types(result)).not.toContain('TIME_WINDOW_LIMIT_EXCEEDED');
    });
  });

  describe('per-category spend limit', () => {
    test('blocks when a category subtotal exceeds its budget', () => {
      const category = catalog.getById('coffee')!.category;
      const policy = createPolicy({ categorySpendLimits: { [category]: 500 } });
      const result = policyService.evaluatePurchase(orderFor('coffee', 600), policy, ctx());
      expect(result.decision).toBe('BLOCK');
      expect(types(result)).toContain('CATEGORY_SPEND_LIMIT_EXCEEDED');
      const v = result.violations.find((x) => x.type === 'CATEGORY_SPEND_LIMIT_EXCEEDED')!;
      expect(v.rule).toBe(`categorySpendLimits.${category}`);
      expect(v.expected).toBe(500);
      expect(v.actual).toBe(600);
    });

    test('allows when the category subtotal is within budget', () => {
      const category = catalog.getById('coffee')!.category;
      const policy = createPolicy({ categorySpendLimits: { [category]: 1000 } });
      const result = policyService.evaluatePurchase(orderFor('coffee', 600), policy, ctx());
      expect(types(result)).not.toContain('CATEGORY_SPEND_LIMIT_EXCEEDED');
    });
  });

  describe('order-frequency limit', () => {
    const policy = createPolicy({ maxOrdersPerHour: 3 });

    test('blocks when the trailing-hour count reaches the limit', () => {
      const result = policyService.evaluatePurchase(
        orderFor('coffee', 300),
        policy,
        ctx({ ordersLastHour: 3 })
      );
      expect(result.decision).toBe('BLOCK');
      expect(types(result)).toContain('FREQUENCY_LIMIT_EXCEEDED');
      const v = result.violations.find((x) => x.type === 'FREQUENCY_LIMIT_EXCEEDED')!;
      expect(v.expected).toBe(3);
      expect(v.actual).toBe(3);
    });

    test('allows when below the limit', () => {
      const result = policyService.evaluatePurchase(
        orderFor('coffee', 300),
        policy,
        ctx({ ordersLastHour: 2 })
      );
      expect(types(result)).not.toContain('FREQUENCY_LIMIT_EXCEEDED');
    });

    test('is ignored when the context does not supply a count', () => {
      const result = policyService.evaluatePurchase(orderFor('coffee', 300), policy, ctx());
      expect(types(result)).not.toContain('FREQUENCY_LIMIT_EXCEEDED');
    });
  });

  describe('geo allow-list (placeholder)', () => {
    const policy = createPolicy({ allowedCountries: ['DE', 'NL'] });

    test('blocks a buyer outside the allow-list', () => {
      const result = policyService.evaluatePurchase(
        orderFor('coffee', 300),
        policy,
        ctx({ countryCode: 'FR' })
      );
      expect(result.decision).toBe('BLOCK');
      expect(types(result)).toContain('GEO_RESTRICTED');
    });

    test('allows a buyer inside the allow-list (case-insensitive)', () => {
      const result = policyService.evaluatePurchase(
        orderFor('coffee', 300),
        policy,
        ctx({ countryCode: 'de' })
      );
      expect(types(result)).not.toContain('GEO_RESTRICTED');
    });

    test('is a no-op when no country is supplied (sandbox has no geo-IP)', () => {
      const result = policyService.evaluatePurchase(orderFor('coffee', 300), policy, ctx());
      expect(result.decision).toBe('AUTO_ALLOW');
    });
  });

  test('policyBlockReason names the new rules', () => {
    expect(policyBlockReason(['TIME_WINDOW_LIMIT_EXCEEDED'], 'BLOCK')).toMatch(/quiet hours/i);
    expect(policyBlockReason(['CATEGORY_SPEND_LIMIT_EXCEEDED'], 'BLOCK')).toMatch(/category spending limit/i);
    expect(policyBlockReason(['FREQUENCY_LIMIT_EXCEEDED'], 'BLOCK')).toMatch(/too many orders/i);
    expect(policyBlockReason(['GEO_RESTRICTED'], 'BLOCK')).toMatch(/region/i);
  });
});

import { CatalogService } from '../../src/catalog/service';
import { Order, OrderOrigin, OrderStatus } from '../../src/orders/domain';
import {
  PolicyEvent,
  PurchasePolicy,
} from '../../src/policy/domain';
import { DailySpendTracker } from '../../src/policy/daily-spend-tracker';
import { PolicyService } from '../../src/policy/service';
import { PolicyStorage } from '../../src/policy/storage';

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

function createOrder(
  productId = 'coffee',
  totalMinor = 300,
  currency = 'EUR'
): Order {
  const product = catalog.getById(productId);
  if (!product) {
    throw new Error(`Test fixture product not found: ${productId}`);
  }

  return {
    id: 'cart-1',
    sessionId: 'session-1',
    status: OrderStatus.CART_READY,
    origin: OrderOrigin.AI_AGENT,
    items: [
      {
        productId,
        name: product.name,
        quantity: 1,
        unitPriceMinor: product.priceMinor,
        lineTotalMinor: totalMinor,
      },
    ],
    totalMinor,
    currency,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function evaluate(
  order: Order,
  policy: PurchasePolicy = createPolicy(),
  merchantId = 'ai-cafe',
  currentDailySpendMinor = 0,
  pendingReservationsMinor = 0
) {
  return policyService.evaluatePurchase(order, policy, {
    merchantId,
    currentDailySpendMinor,
    pendingReservationsMinor,
  });
}

function createEvent(
  userId: string,
  decision: PolicyEvent['decision'],
  orderId?: string
): PolicyEvent {
  return {
    id: `event-${userId}-${decision}-${orderId ?? 'unlinked'}`,
    timestamp: '2026-01-01T00:00:00.000Z',
    userId,
    cartId: 'cart-1',
    orderId,
    agent: 'AI_AGENT',
    amountMinor: 300,
    currency: 'EUR',
    decision,
    violatedRules: [],
    reason: 'Test event',
    policySnapshot: {
      maxPerPurchaseMinor: 5000,
      dailySpendLimitMinor: 10000,
      confirmationThresholdMinor: 4000,
    },
  };
}

describe('PolicyService', () => {
  test('AUTO_ALLOW when the order is within all limits and below threshold', () => {
    expect(evaluate(createOrder()).decision).toBe('AUTO_ALLOW');
  });

  test('REQUIRE_CONFIRMATION when order exceeds confirmation threshold', () => {
    const result = evaluate(createOrder('premium_cake', 4500));

    expect(result.decision).toBe('REQUIRE_CONFIRMATION');
    expect(result.violations.map((violation) => violation.type)).toContain(
      'CONFIRMATION_THRESHOLD_EXCEEDED'
    );
  });

  test('BLOCK when max purchase amount is exceeded', () => {
    const result = evaluate(
      createOrder('premium_cake', 4500),
      createPolicy({ maxPerPurchaseMinor: 4000 })
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toContain(
      'MAX_PURCHASE_EXCEEDED'
    );
  });

  test('BLOCK when projected daily spend exceeds its limit', () => {
    const result = evaluate(
      createOrder('coffee', 300),
      createPolicy({ dailySpendLimitMinor: 500 }),
      'ai-cafe',
      300
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toContain(
      'DAILY_LIMIT_EXCEEDED'
    );
  });

  test('BLOCK when policy and order currencies differ', () => {
    const result = evaluate(createOrder('coffee', 300, 'USD'));

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toContain(
      'CURRENCY_MISMATCH'
    );
  });

  test('BLOCK when merchant is not in the allowed merchant list', () => {
    const result = evaluate(
      createOrder(),
      createPolicy({ allowedMerchantIds: ['other-merchant'] })
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toContain(
      'MERCHANT_NOT_ALLOWED'
    );
  });

  test('allows any merchant when the allowlist is empty', () => {
    expect(evaluate(createOrder(), createPolicy(), 'any-merchant').decision).toBe(
      'AUTO_ALLOW'
    );
  });

  test('BLOCK when an item category is blocked', () => {
    const result = evaluate(
      createOrder(),
      createPolicy({ blockedCategoryIds: ['drinks'] })
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toContain(
      'CATEGORY_BLOCKED'
    );
  });

  test('BLOCK when an item lacks a required dietary attribute', () => {
    const result = evaluate(
      createOrder(),
      createPolicy({ requiredDietaryAttributes: ['gluten-free'] })
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toContain(
      'DIETARY_REQUIREMENT_NOT_MET'
    );
  });

  test('BLOCK when an item contains a blocked dietary attribute', () => {
    const result = evaluate(
      createOrder(),
      createPolicy({ blockedDietaryAttributes: ['vegan'] })
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toContain(
      'DIETARY_ATTRIBUTE_BLOCKED'
    );
  });

  test('blocking violations take precedence over confirmation threshold', () => {
    const result = evaluate(
      createOrder('premium_cake', 4500),
      createPolicy({
        maxPerPurchaseMinor: 4000,
        confirmationThresholdMinor: 1000,
      })
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toEqual(
      expect.arrayContaining([
        'MAX_PURCHASE_EXCEEDED',
        'CONFIRMATION_THRESHOLD_EXCEEDED',
      ])
    );
  });

  test('returns all blocking violations found for the order', () => {
    const result = evaluate(
      createOrder(),
      createPolicy({
        allowedMerchantIds: ['other-merchant'],
        blockedCategoryIds: ['drinks'],
        blockedDietaryAttributes: ['vegan'],
      })
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toEqual(
      expect.arrayContaining([
        'MERCHANT_NOT_ALLOWED',
        'CATEGORY_BLOCKED',
        'DIETARY_ATTRIBUTE_BLOCKED',
      ])
    );
  });

  test('includes pending reservations when enforcing the daily limit', () => {
    const result = evaluate(
      createOrder('coffee', 300),
      createPolicy({ dailySpendLimitMinor: 500 }),
      'ai-cafe',
      100,
      200
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((violation) => violation.type)).toContain(
      'DAILY_LIMIT_EXCEEDED'
    );
  });

  test('BLOCK when a scoped allowance has expired (validUntil in the past)', () => {
    const result = evaluate(
      createOrder(),
      createPolicy({ validUntil: new Date('2020-01-01T00:00:00.000Z') })
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((v) => v.type)).toContain('ALLOWANCE_EXPIRED');
  });

  test('AUTO_ALLOW when a scoped allowance is still valid (validUntil in the future)', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(evaluate(createOrder(), createPolicy({ validUntil: future })).decision).toBe(
      'AUTO_ALLOW'
    );
  });

  test('AUTO_ALLOW when the policy is disabled and has no past validUntil', () => {
    expect(evaluate(createOrder(), createPolicy({ enabled: false })).decision).toBe(
      'AUTO_ALLOW'
    );
  });

  test('BLOCK when the policy is disabled but the allowance has expired', () => {
    const result = evaluate(
      createOrder(),
      createPolicy({
        enabled: false,
        validUntil: new Date('2020-01-01T00:00:00.000Z'),
      })
    );

    expect(result.decision).toBe('BLOCK');
    expect(result.violations.map((v) => v.type)).toContain('ALLOWANCE_EXPIRED');
  });

  test('returns identical evaluations for identical inputs', () => {
    const order = createOrder('premium_cake', 4500);
    const purchasePolicy = createPolicy({ confirmationThresholdMinor: 4000 });
    const context = {
      merchantId: 'ai-cafe',
      currentDailySpendMinor: 200,
      pendingReservationsMinor: 100,
    };

    expect(
      policyService.evaluatePurchase(order, purchasePolicy, context)
    ).toEqual(policyService.evaluatePurchase(order, purchasePolicy, context));
  });
});

describe('DailySpendTracker', () => {
  test('creates a reservation when there is enough daily budget', () => {
    const tracker = new DailySpendTracker();
    const reservation = tracker.tryReserve('user-1', 3000, 5000);

    expect(reservation).not.toBeNull();
    expect(tracker.getPendingReservations('user-1')).toBe(3000);
  });

  test('rejects a reservation that exceeds the remaining daily budget', () => {
    const tracker = new DailySpendTracker();

    expect(tracker.tryReserve('user-1', 3000, 5000)).not.toBeNull();
    expect(tracker.tryReserve('user-1', 2500, 5000)).toBeNull();
    expect(tracker.getPendingReservations('user-1')).toBe(3000);
  });

  test('cancelling a reservation releases its pending amount', () => {
    const tracker = new DailySpendTracker();
    const reservation = tracker.tryReserve('user-1', 3000, 5000);
    if (!reservation) {
      throw new Error('Expected test reservation to succeed');
    }

    tracker.cancelReservation(reservation.id);

    expect(tracker.getPendingReservations('user-1')).toBe(0);
    expect(tracker.getSpentToday('user-1')).toBe(0);
  });

  test('confirming a reservation moves its amount from pending to spent', () => {
    const tracker = new DailySpendTracker();
    const reservation = tracker.tryReserve('user-1', 3000, 5000);
    if (!reservation) {
      throw new Error('Expected test reservation to succeed');
    }

    tracker.confirmReservation(reservation.id);

    expect(tracker.getPendingReservations('user-1')).toBe(0);
    expect(tracker.getSpentToday('user-1')).toBe(3000);
  });
});

describe('PolicyStorage', () => {
  test('stores and retrieves a policy by user ID', () => {
    const storage = new PolicyStorage();
    const purchasePolicy = createPolicy();

    storage.setPolicy(purchasePolicy);

    expect(storage.getPolicy('user-1')).toEqual(purchasePolicy);
    expect(storage.getPolicy('missing-user')).toBeUndefined();
  });

  test('retrieves policy events globally or filtered by user', () => {
    const storage = new PolicyStorage();
    storage.addEvent(createEvent('user-1', 'AUTO_ALLOW'));
    storage.addEvent(createEvent('user-2', 'BLOCK'));

    expect(storage.getEvents()).toHaveLength(2);
    expect(storage.getEvents('user-1').map((event) => event.userId)).toEqual([
      'user-1',
    ]);
  });

  test('reports neutral request, block, allow, and order-correlation statistics', () => {
    const storage = new PolicyStorage();
    storage.addEvent(createEvent('user-1', 'AUTO_ALLOW', 'order-1'));
    storage.addEvent(createEvent('user-1', 'REQUIRE_CONFIRMATION'));
    storage.addEvent(createEvent('user-1', 'BLOCK'));
    storage.addEvent(createEvent('user-2', 'BLOCK', 'order-2'));

    expect(storage.getStats('user-1')).toEqual({
      totalRequests: 3,
      blocked: 1,
      allowed: 2,
      correlatedWithOrder: 1,
    });
    expect(storage.getStats()).toEqual({
      totalRequests: 4,
      blocked: 2,
      allowed: 2,
      correlatedWithOrder: 2,
    });
  });
});
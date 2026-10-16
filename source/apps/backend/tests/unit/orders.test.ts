import { OrderService, getTransitions } from '../../src/orders/service';
import { validateOrderItems } from '../../src/orders/validation';
import { AppError } from '../../src/middleware/error-handler';
import { OrderStatus, OrderOrigin, OrderItem } from '../../src/orders/domain';
import { CatalogService, Product } from '../../src/catalog/service';

// Fresh singleton per file (Jest isolates modules per test file).
const orderService = OrderService.getInstance();

function makeItem(productId: string, quantity: number): OrderItem {
  return {
    productId,
    name: productId,
    quantity,
    unitPriceMinor: 100,
    lineTotalMinor: 100 * quantity,
  };
}

describe('OrderService — state machine (FIX #5)', () => {
  test('valid forward transitions succeed', () => {
    const order = orderService.create('s', [makeItem('p', 1)], 'EUR', OrderOrigin.HUMAN);
    expect(order.status).toBe(OrderStatus.CART_READY);

    expect(orderService.updateStatus(order.id, OrderStatus.AWAITING_CONFIRMATION)?.status).toBe(
      OrderStatus.AWAITING_CONFIRMATION
    );
    expect(orderService.updateStatus(order.id, OrderStatus.PAYMENT_PENDING)?.status).toBe(
      OrderStatus.PAYMENT_PENDING
    );
    expect(orderService.updateStatus(order.id, OrderStatus.PAID)?.status).toBe(OrderStatus.PAID);
    expect(orderService.updateStatus(order.id, OrderStatus.ORDER_CONFIRMED)?.status).toBe(
      OrderStatus.ORDER_CONFIRMED
    );
  });

  test('invalid transition throws', () => {
    const order = orderService.create('s', [makeItem('p', 1)], 'EUR', OrderOrigin.HUMAN);
    // CART_READY → PAID is not allowed.
    expect(() => orderService.updateStatus(order.id, OrderStatus.PAID)).toThrow(
      /Invalid transition/
    );
  });

  test('TRANSITIONS table is complete and closed for terminal states', () => {
    const t = getTransitions();
    expect(t[OrderStatus.ORDER_CONFIRMED]).toEqual([]);
    expect(t[OrderStatus.PAYMENT_FAILED]).toEqual([]);
    expect(t[OrderStatus.ORDER_CANCELLED]).toEqual([]);
    expect(t[OrderStatus.CART_READY]).toContain(OrderStatus.AWAITING_CONFIRMATION);
  });
});

describe('OrderService — quantity validation (FIX #12)', () => {
  test('rejects non-positive, fractional, and >100 quantities', () => {
    expect(() => orderService.create('s', [makeItem('p', 0)], 'EUR', OrderOrigin.HUMAN)).toThrow(
      /Invalid quantity/
    );
    expect(() => orderService.create('s', [makeItem('p', 101)], 'EUR', OrderOrigin.HUMAN)).toThrow(
      /Invalid quantity/
    );
    expect(() =>
      orderService.create('s', [{ ...makeItem('p', 2), quantity: 2.5 } as any], 'EUR', OrderOrigin.HUMAN)
    ).toThrow(/Invalid quantity/);
  });
});

describe('validateOrderItems — currency (FIX #9) + pricing + quantity (FIX #12)', () => {
  const eurProduct: Product = {
    id: 'eur',
    name: 'EUR Item',
    description: '',
    priceMinor: 250,
    currency: 'EUR',
    category: 'x',
    tags: [],
    dietary: [],
    occasion: [],
    available: true,
  };
  const usdProduct: Product = { ...eurProduct, id: 'usd', currency: 'USD' };

  const fakeCatalog = {
    getById: (id: string) => (id === 'eur' ? eurProduct : id === 'usd' ? usdProduct : undefined),
  } as unknown as CatalogService;

  test('accepts EUR product and returns authoritative line totals', () => {
    const items = validateOrderItems([{ productId: 'eur', quantity: 3 }], fakeCatalog);
    expect(items).toHaveLength(1);
    expect(items[0].unitPriceMinor).toBe(250);
    expect(items[0].lineTotalMinor).toBe(750); // server-computed, not trusted from client
  });

  test('rejects currency mismatch (FIX #9)', () => {
    expect(() => validateOrderItems([{ productId: 'usd', quantity: 1 }], fakeCatalog)).toThrow(
      AppError
    );
    expect(() => validateOrderItems([{ productId: 'usd', quantity: 1 }], fakeCatalog)).toThrow(
      /Currency mismatch/
    );
  });

  test('rejects bad quantity (FIX #12)', () => {
    expect(() => validateOrderItems([{ productId: 'eur', quantity: 0 }], fakeCatalog)).toThrow(
      /Invalid quantity/
    );
  });

  test('rejects unknown product', () => {
    expect(() => validateOrderItems([{ productId: 'nope', quantity: 1 }], fakeCatalog)).toThrow(
      /Product not found/
    );
  });

  test('rejects empty items array', () => {
    expect(() => validateOrderItems([], fakeCatalog)).toThrow(/items array required/);
  });
});

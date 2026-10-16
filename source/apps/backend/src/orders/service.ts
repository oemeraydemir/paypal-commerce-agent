import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { formatMoney } from '../utils/money';
import { currentBusiness } from '../config/business-config';
import { Order, OrderStatus, OrderItem, OrderOrigin } from './domain';

const orders = new Map<string, Order>();

// FIX #5: State transition table. Drives updateStatus validation.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DISCOVERING]: [OrderStatus.CART_READY],
  [OrderStatus.CART_READY]: [OrderStatus.AWAITING_CONFIRMATION, OrderStatus.ORDER_CANCELLED],
  [OrderStatus.AWAITING_CONFIRMATION]: [OrderStatus.PAYMENT_PENDING, OrderStatus.ORDER_CANCELLED],
  [OrderStatus.PAYMENT_PENDING]: [OrderStatus.PAID, OrderStatus.PAYMENT_FAILED, OrderStatus.ORDER_CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.ORDER_CONFIRMED],
  [OrderStatus.ORDER_CONFIRMED]: [],
  [OrderStatus.PAYMENT_FAILED]: [],
  [OrderStatus.ORDER_CANCELLED]: [],
};

export function getTransitions(): Record<OrderStatus, OrderStatus[]> {
  return TRANSITIONS;
}

export class OrderService {
  private static instance: OrderService;
  private static createdAtCursor = 0;

  private constructor() {}

  // Singleton / DI pattern — single in-memory store.
  static getInstance(): OrderService {
    if (!OrderService.instance) {
      OrderService.instance = new OrderService();
    }
    return OrderService.instance;
  }

  create(
    sessionId: string,
    items: OrderItem[],
    currency: string,
    origin: OrderOrigin, // FIX #7: server-side, never taken from the client
    idempotencyKey?: string,
    requestFingerprint?: string
  ): Order {
    // Validate quantities
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 100) {
        throw new Error(`Invalid quantity for ${item.productId}: ${item.quantity}`);
      }
    }

    const totalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
    const now = new Date(Date.now() + OrderService.createdAtCursor);
    OrderService.createdAtCursor += 1;

    const order: Order = {
      id: uuidv4(),
      sessionId,
      status: OrderStatus.CART_READY,
      origin,
      items,
      totalMinor,
      currency,
      idempotencyKey,
      requestFingerprint,
      createdAt: now,
      updatedAt: now,
    };

    orders.set(order.id, order);
    return order;
  }

  getById(id: string): Order | undefined {
    return orders.get(id);
  }

  // S5: correlate an internal order to an incoming PayPal webhook by PayPal Order ID.
  getByPayPalOrderId(paypalOrderId: string): Order | undefined {
    return Array.from(orders.values()).find(
      (order) => order.paypalOrderId === paypalOrderId
    );
  }

  // FIX #5: Validate state transitions before mutating status.
  updateStatus(id: string, status: OrderStatus): Order | undefined {
    const order = orders.get(id);
    if (!order) return undefined;

    // S5 idempotent no-op: if the order is already in the target state, return
    // success without re-transitioning. PAID → PAID and PAYMENT_FAILED →
    // PAYMENT_FAILED are harmless no-ops, so a retried webhook never throws.
    if (order.status === status) {
      console.log(`Order ${id} already in state ${status} (idempotent no-op)`);
      return order;
    }

    const allowed = TRANSITIONS[order.status];
    if (!allowed.includes(status)) {
      throw new Error(`Invalid transition: ${order.status} → ${status}`);
    }

    order.status = status;
    order.updatedAt = new Date();
    orders.set(id, order);
    return order;
  }

  getByReservationId(reservationId: string): Order | undefined {
    return [...orders.values()].find((order) => order.reservationId === reservationId);
  }

  // Gateway-confirmed payment. PayPal (verified webhook or a direct order
  // lookup) is the source of truth for money: if it says the capture COMPLETED
  // the order must become PAID even when we had locally failed/cancelled it
  // (e.g. a reservation expired while the capture response was lost). This is
  // deliberately NOT part of the TRANSITIONS table, which stays closed for
  // terminal states. Idempotent.
  reconcileLateCapture(id: string, captureId?: string): Order | undefined {
    const order = orders.get(id);
    if (!order) return undefined;

    if (order.status === OrderStatus.PAID || order.status === OrderStatus.ORDER_CONFIRMED) {
      if (captureId && !order.paypalCaptureId) {
        order.paypalCaptureId = captureId;
        order.updatedAt = new Date();
      }
      return order;
    }
    if (
      order.status === OrderStatus.PAYMENT_PENDING ||
      order.status === OrderStatus.PAYMENT_FAILED ||
      order.status === OrderStatus.ORDER_CANCELLED
    ) {
      order.status = OrderStatus.PAID;
      order.paypalStatus = 'COMPLETED';
      if (captureId) order.paypalCaptureId = captureId;
      order.updatedAt = new Date();
      orders.set(id, order);
      return order;
    }
    // Any other state is a programming error; reuse the validated path.
    return this.updateStatus(id, OrderStatus.PAID);
  }

  setPayPalOrderId(orderId: string, paypalOrderId: string): Order | undefined {
    const order = orders.get(orderId);
    if (!order) return undefined;

    order.paypalOrderId = paypalOrderId;
    order.status = OrderStatus.PAYMENT_PENDING;
    order.updatedAt = new Date();
    orders.set(orderId, order);
    return order;
  }

  setPayPalCaptureResult(
    orderId: string,
    captureId: string,
    paypalStatus: string
  ): Order | undefined {
    const order = orders.get(orderId);
    if (!order) return undefined;

    // A PAID order is never downgraded by a late/duplicate capture response
    // (e.g. a PENDING reply racing a COMPLETED webhook).
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.ORDER_CONFIRMED) {
      if (captureId && captureId !== 'unknown' && !order.paypalCaptureId) {
        order.paypalCaptureId = captureId;
      }
      order.updatedAt = new Date();
      orders.set(orderId, order);
      return order;
    }

    order.paypalCaptureId = captureId;
    order.paypalStatus = paypalStatus;

    if (paypalStatus === 'COMPLETED') {
      order.status = OrderStatus.PAID;
    } else if (paypalStatus === 'DECLINED' || paypalStatus === 'FAILED') {
      order.status = OrderStatus.PAYMENT_FAILED;
    } else if (paypalStatus === 'PENDING') {
      order.status = OrderStatus.PAYMENT_PENDING;
    } else {
      order.status = OrderStatus.PAYMENT_FAILED;
    }

    order.updatedAt = new Date();
    orders.set(orderId, order);
    return order;
  }

  getAll(): Order[] {
    return Array.from(orders.values());
  }

  getStats() {
    const all = this.getAll();
    const total = all.length;
    const aiAssisted = all.filter((o) => o.origin === OrderOrigin.AI_AGENT).length;
    const paid = all.filter((o) => o.status === OrderStatus.PAID);
    const revenueMinor = paid.reduce((sum, o) => sum + o.totalMinor, 0);
    const aiAssistedRevenueMinor = paid
      .filter((o) => o.origin === OrderOrigin.AI_AGENT)
      .reduce((sum, o) => sum + o.totalMinor, 0);

    return {
      total,
      aiAssisted,
      aiAssistedPercentage: total > 0 ? Math.round((aiAssisted / total) * 100) : 0,
      revenueMinor,
      revenueFormatted: formatMoney(revenueMinor, currentBusiness.currency, currentBusiness.locale),
      aiAssistedRevenueMinor,
      aiAssistedRevenueFormatted: formatMoney(
        aiAssistedRevenueMinor,
        currentBusiness.currency,
        currentBusiness.locale
      ),
    };
  }

  /**
   * TEST-ONLY: clears the in-memory order store.
   * NEVER call from production code paths. Used for test isolation (H4).
   */
  reset(): void {
    orders.clear();
    OrderService.createdAtCursor = 0;
  }
}

// FIX #4 (S1): canonical request fingerprint via fast-json-stable-stringify.
export function createRequestFingerprint(body: any): string {
  const normalized = {
    sessionId: body?.sessionId,
    origin: body?.origin,
    items: (body?.items || [])
      .map((item: any) => ({
        productId: item?.productId,
        quantity: item?.quantity,
      }))
      .sort((a: any, b: any) => String(a.productId).localeCompare(String(b.productId))),
  };

  const canonical = stringify(normalized);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

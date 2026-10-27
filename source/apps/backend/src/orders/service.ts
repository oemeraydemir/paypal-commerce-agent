import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { formatMoney } from '../utils/money';
import { currentBusiness } from '../config/business-config';
import { Order, OrderStatus, OrderItem, OrderOrigin } from './domain';
import { getRepos, writeQueue } from '../persistence/registry';

const orders = new Map<string, Order>();
// Orders whose last durable write failed even after retries; re-saved by the sweeper.
const dirty = new Set<string>();

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
    this.persist(order.id);
    return order;
  }

  getById(id: string): Order | undefined {
    return orders.get(id);
  }

  /**
   * Latest order for this (session-scoped) idempotency key that is still live.
   * Cancelled/failed orders are not reusable: a retry then creates a fresh order.
   */
  findReusableByIdempotencyKey(key: string): Order | undefined {
    const live = new Set<OrderStatus>([
      OrderStatus.CART_READY,
      OrderStatus.AWAITING_CONFIRMATION,
      OrderStatus.PAYMENT_PENDING,
      OrderStatus.PAID,
      OrderStatus.ORDER_CONFIRMED,
    ]);
    return Array.from(orders.values())
      .filter((o) => o.idempotencyKey === key && live.has(o.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  // ---- durability -------------------------------------------------------------
  // The Map stays the read model (fast, synchronous). Every mutation is written
  // through to PostgreSQL when a repository is attached; without one this is a no-op.

  /** Loads all persisted orders into memory. Called once at boot, before listen(). */
  async hydrate(): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    const loaded = await repos.orders.loadAll();
    for (const order of loaded) orders.set(order.id, order);
    return loaded.length;
  }

  private persist(id: string): void {
    if (!getRepos()) return;
    dirty.add(id);
    writeQueue.enqueue(`order:${id}`, () => this.saveSnapshot(id)).catch(() => undefined);
  }

  private async saveSnapshot(id: string): Promise<void> {
    const repos = getRepos();
    const order = orders.get(id);
    if (!repos || !order) return;
    await repos.orders.save(order); // snapshot is read NOW, i.e. the latest state
    dirty.delete(id);
  }

  /**
   * Awaitable durable save for the points where an acknowledgement must not
   * precede storage (write-ahead of an order / capture, response after a capture).
   * Rejects if the write fails (no retry loop here: request paths answer quickly).
   */
  async saveNow(id: string): Promise<void> {
    if (!getRepos()) return;
    dirty.add(id);
    await writeQueue.enqueue(`order:${id}`, () => this.saveSnapshot(id), { retries: 0 });
  }

  /** Re-saves orders whose earlier write failed. Returns how many were attempted. */
  async retryDirty(): Promise<number> {
    const ids = [...dirty];
    for (const id of ids) {
      await writeQueue.enqueue(`order-retry:${id}`, () => this.saveSnapshot(id), { retries: 0 });
    }
    return ids.length;
  }

  setReservationId(id: string, reservationId: string): Order | undefined {
    const order = orders.get(id);
    if (!order) return undefined;
    order.reservationId = reservationId;
    order.updatedAt = new Date();
    this.persist(id);
    return order;
  }

  /** Write-ahead marker for a capture attempt (see Order.captureStartedAt). */
  markCaptureStarted(id: string): Order | undefined {
    const order = orders.get(id);
    if (!order) return undefined;
    order.captureStartedAt = new Date();
    order.updatedAt = new Date();
    this.persist(id);
    return order;
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
    this.persist(id);
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
        this.persist(id);
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
      this.persist(id);
      return order;
    }
    // Any other state is a programming error; reuse the validated path.
    return this.updateStatus(id, OrderStatus.PAID);
  }

  setPayPalOrderId(orderId: string, paypalOrderId: string): Order | undefined {
    const order = orders.get(orderId);
    if (!order) return undefined;

    // A late/duplicate create response must never downgrade a settled order.
    // (The normal call happens before capture, while the order is CART_READY.)
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.ORDER_CONFIRMED) {
      if (!order.paypalOrderId) {
        order.paypalOrderId = paypalOrderId;
        order.updatedAt = new Date();
        this.persist(orderId);
      }
      return order;
    }

    order.paypalOrderId = paypalOrderId;
    order.status = OrderStatus.PAYMENT_PENDING;
    order.updatedAt = new Date();
    orders.set(orderId, order);
    this.persist(orderId);
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
      this.persist(orderId);
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
    this.persist(orderId);
    return order;
  }

  getAll(): Order[] {
    return Array.from(orders.values());
  }

  /**
   * `refundedMinorFor` is injected (the refund queue imports the order service, not the other way
   * round). Without it no refunds are subtracted. revenueMinor stays the GROSS captured amount;
   * netRevenueMinor is what the merchant actually keeps after approved refunds.
   */
  getStats(refundedMinorFor?: (orderId: string) => number, pendingRefundMinorFor?: (orderId: string) => number) {
    const all = this.getAll();
    const total = all.length;
    // "AI-assisted" covers BOTH AI origins (FIX-04 / PP18):
    //   AI_ASSISTED — the storefront chat assistant helped a human shopper
    //   AI_AGENT    — an external agent prepared the cart through MCP
    // Both were prepared by AI; only the actor differs. Excluding AI_ASSISTED
    // here would under-report the AI share the merchant sees on the dashboard.
    const isAiOrigin = (o: Order): boolean =>
      o.origin === OrderOrigin.AI_AGENT || o.origin === OrderOrigin.AI_ASSISTED;
    const aiAssisted = all.filter(isAiOrigin).length;
    const paid = all.filter((o) => o.status === OrderStatus.PAID);
    const revenueMinor = paid.reduce((sum, o) => sum + o.totalMinor, 0);
    const aiAssistedRevenueMinor = paid.filter(isAiOrigin).reduce((sum, o) => sum + o.totalMinor, 0);
    // Refunds can exist for any captured order (status stays PAID); never subtract more than captured.
    const refundedOf = (o: Order) =>
      refundedMinorFor ? Math.min(Math.max(refundedMinorFor(o.id), 0), o.totalMinor) : 0;
    const refundedMinor = paid.reduce((sum, o) => sum + refundedOf(o), 0);
    const netRevenueMinor = revenueMinor - refundedMinor;
    // Pending refunds are shown separately and are NOT subtracted until PayPal confirms them.
    const pendingRefundMinor = pendingRefundMinorFor
      ? paid.reduce((sum, o) => sum + Math.max(pendingRefundMinorFor(o.id), 0), 0)
      : 0;

    return {
      total,
      aiAssisted,
      aiAssistedPercentage: total > 0 ? Math.round((aiAssisted / total) * 100) : 0,
      revenueMinor,
      revenueFormatted: formatMoney(revenueMinor, currentBusiness.currency, currentBusiness.locale),
      refundedMinor,
      pendingRefundMinor,
      refundedFormatted: formatMoney(refundedMinor, currentBusiness.currency, currentBusiness.locale),
      netRevenueMinor,
      netRevenueFormatted: formatMoney(netRevenueMinor, currentBusiness.currency, currentBusiness.locale),
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
    dirty.clear();
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

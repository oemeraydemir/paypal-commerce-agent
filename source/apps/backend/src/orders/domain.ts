import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';

// Order domain model. CRITICAL FIX #6: OrderOrigin enum replaces the previous
// `aiGenerated: boolean` flag so the origin of an order is explicit and
// extensible (HUMAN / AI_ASSISTED / AI_AGENT).

export function createCartId(
  sessionId: string,
  items: Array<{ productId: string; quantity: number }>
): string {
  const canonical = stringify({
    sessionId,
    items: [...items]
      .map((item) => ({ productId: item.productId, quantity: item.quantity }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  });
  return `cart_${crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`;
}

export enum OrderStatus {
  DISCOVERING = 'DISCOVERING',
  CART_READY = 'CART_READY',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAID = 'PAID',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
}

export enum OrderOrigin {
  HUMAN = 'HUMAN',
  AI_ASSISTED = 'AI_ASSISTED',
  AI_AGENT = 'AI_AGENT',
}

export interface AgentContext {
  agentId?: string;
  sessionId: string;
  model?: string;
  intentId?: string;
  requiresConfirmation: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface Order {
  id: string;
  sessionId: string;
  status: OrderStatus;
  origin: OrderOrigin; // CRITICAL FIX #6
  agentContext?: AgentContext; // CRITICAL FIX #6
  items: OrderItem[];
  totalMinor: number;
  currency: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalStatus?: string;
  idempotencyKey?: string;
  requestFingerprint?: string;
  // S10 (R13): server-owned reservation correlation. Set by /orders/create
  // immediately after a daily-spend reservation is taken, so the /capture route
  // can confirm or cancel it. NEVER accepted from the client.
  reservationId?: string;
  // Write-ahead marker: set and PERSISTED before the capture call goes to PayPal.
  // If the process dies mid-capture, startup reconciliation asks PayPal for the truth.
  captureStartedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

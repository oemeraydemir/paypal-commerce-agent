import { v4 as uuidv4 } from 'uuid';
import { OrderService } from '../orders/service';
import { Order, OrderStatus } from '../orders/domain';
import { paypalClient } from '../paypal/client';
import { redactSecrets } from '../utils/redact';
import { formatError } from '../utils/error';

// Human-approved refunds.
//
// Same safety model as checkout, mirrored on the merchant side: an AI (the Ops Copilot) or a
// merchant may PROPOSE a refund, but only an authenticated merchant APPROVAL moves money, and the
// amount is always computed/validated here — never taken from the model.
//
//   PROPOSED --approve--> PROCESSING --PayPal ok--> REFUNDED
//       |                     |--PayPal error--> PROPOSED (lastError set, safe to retry: same PayPal-Request-Id)
//       +--reject--> REJECTED

export type RefundStatus = 'PROPOSED' | 'PROCESSING' | 'REFUNDED' | 'REJECTED';
export type RefundProposer = 'OPS_COPILOT' | 'MERCHANT';

export interface RefundRequestRecord {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  proposedBy: RefundProposer;
  status: RefundStatus;
  paypalRefundId?: string;
  paypalRefundStatus?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
}

export class RefundError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const REFUNDABLE_ORDER_STATUSES = new Set<OrderStatus>([OrderStatus.PAID, OrderStatus.ORDER_CONFIRMED]);
const OPEN: ReadonlySet<RefundStatus> = new Set<RefundStatus>(['PROPOSED', 'PROCESSING']);

export const toPayPalAmount = (minor: number) => (minor / 100).toFixed(2);

export class RefundService {
  private static instance: RefundService;
  private readonly records = new Map<string, RefundRequestRecord>();

  static getInstance(): RefundService {
    if (!RefundService.instance) RefundService.instance = new RefundService();
    return RefundService.instance;
  }

  /** Test hook. */
  reset(): void {
    this.records.clear();
  }

  list(): RefundRequestRecord[] {
    return Array.from(this.records.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  get(id: string): RefundRequestRecord | undefined {
    return this.records.get(id);
  }

  refundedMinor(orderId: string): number {
    return this.list()
      .filter((r) => r.orderId === orderId && r.status === 'REFUNDED')
      .reduce((sum, r) => sum + r.amountMinor, 0);
  }

  private requireRefundableOrder(orderId: string): Order {
    const order = OrderService.getInstance().getById(orderId);
    if (!order) throw new RefundError(404, 'Order not found.');
    if (!REFUNDABLE_ORDER_STATUSES.has(order.status) || !order.paypalCaptureId) {
      throw new RefundError(409, 'Only paid orders with a captured PayPal payment can be refunded.');
    }
    return order;
  }

  /** Creates a PROPOSED refund. Moves no money. `amountMinor` defaults to the full remaining amount. */
  propose(input: { orderId: string; amountMinor?: number; reason: string; proposedBy: RefundProposer }): RefundRequestRecord {
    const reason = (input.reason ?? '').trim();
    if (reason.length < 3 || reason.length > 200) {
      throw new RefundError(400, 'reason must be 3 to 200 characters.');
    }
    const order = this.requireRefundableOrder(input.orderId);

    const open = this.list().find((r) => r.orderId === order.id && OPEN.has(r.status));
    if (open) throw new RefundError(409, `Order already has an open refund request (${open.id}).`);

    const remaining = order.totalMinor - this.refundedMinor(order.id);
    if (remaining <= 0) throw new RefundError(409, 'Order is already fully refunded.');

    const amountMinor = input.amountMinor ?? remaining;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new RefundError(400, 'amountMinor must be a positive integer (minor units).');
    }
    if (amountMinor > remaining) {
      throw new RefundError(422, `Refund exceeds the refundable amount (${remaining} minor units remaining).`);
    }

    const now = new Date().toISOString();
    const record: RefundRequestRecord = {
      id: uuidv4(),
      orderId: order.id,
      amountMinor,
      currency: order.currency,
      reason,
      proposedBy: input.proposedBy,
      status: 'PROPOSED',
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  /**
   * Executes a PROPOSED refund after merchant approval. The PROPOSED -> PROCESSING flip happens
   * synchronously before the first await, so two concurrent approvals can never both reach PayPal.
   * The PayPal-Request-Id is derived from the request id, so even a retry after a timeout is idempotent.
   */
  async approve(id: string): Promise<RefundRequestRecord> {
    const record = this.records.get(id);
    if (!record) throw new RefundError(404, 'Refund request not found.');
    if (record.status !== 'PROPOSED') throw new RefundError(409, `Refund request is ${record.status}, not PROPOSED.`);

    const order = this.requireRefundableOrder(record.orderId);
    record.status = 'PROCESSING';
    record.lastError = undefined;
    record.updatedAt = new Date().toISOString();

    try {
      const result = await paypalClient.refundCapture(
        order.paypalCaptureId!,
        {
          amount: { currencyCode: record.currency, value: toPayPalAmount(record.amountMinor) },
          noteToPayer: record.reason,
          invoiceId: `aicafe-refund-${record.id}`,
        },
        `aicafe-refund-${record.id}`
      );
      record.status = 'REFUNDED';
      record.paypalRefundId = result?.id;
      record.paypalRefundStatus = result?.status;
      record.decidedAt = new Date().toISOString();
    } catch (err: any) {
      record.status = 'PROPOSED';
      record.lastError = 'PayPal could not process the refund; it was not issued. You can retry.';
      console.error(`REFUND_FAILED id=${record.id} error=${redactSecrets(formatError(err)).slice(0, 200)}`);
    }
    record.updatedAt = new Date().toISOString();
    return record;
  }

  reject(id: string): RefundRequestRecord {
    const record = this.records.get(id);
    if (!record) throw new RefundError(404, 'Refund request not found.');
    if (record.status !== 'PROPOSED') throw new RefundError(409, `Refund request is ${record.status}, not PROPOSED.`);
    record.status = 'REJECTED';
    record.decidedAt = record.updatedAt = new Date().toISOString();
    return record;
  }
}

export const refundService = RefundService.getInstance();

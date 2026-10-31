import { v4 as uuidv4 } from 'uuid';
import { emitAutomationEvent } from '../automation/emitter';
import { resolveRefundedMinor } from './refunded-total';
import { OrderService } from '../orders/service';
import { Order, OrderStatus } from '../orders/domain';
import { paypalClient } from '../paypal/client';
import { redactSecrets } from '../utils/redact';
import { formatError } from '../utils/error';
import { getRepos, writeQueue } from '../persistence/registry';

// Human-approved refunds.
//
// Same safety model as checkout, mirrored on the merchant side: an AI (the Ops Copilot) or a
// merchant may PROPOSE a refund, but only an authenticated merchant APPROVAL moves money, and the
// amount is always computed/validated here — never taken from the model.
//
//   PROPOSED --approve--> PROCESSING --PayPal COMPLETED--> REFUNDED
//       |                     |--definitive failure--> PROPOSED
//       |                     +--indeterminate--> PROPOSED (capture reconciliation required before retry)
//       +--reject--> REJECTED
//
// Durability (PostgreSQL when DATABASE_URL is set, see docs/DATABASE.md): a proposal is stored before
// it is acknowledged, and PROCESSING is stored BEFORE PayPal is asked. A restart in the middle of an
// approval therefore leaves a record that is re-opened as PROPOSED with an explicit warning (the
// refund may already exist at PayPal); capture/refund status is verified before a retry is sent.

// Marker (persisted in last_error) for a refund re-opened after a crash while PayPal was being asked.
export const INTERRUPTED_PREFIX = 'Interrupted by a server restart';
const INDETERMINATE_PREFIX = 'Refund outcome indeterminate';

export type RefundStatus = 'PROPOSED' | 'PROCESSING' | 'REFUNDED' | 'REJECTED';
export type RefundProposer = 'OPS_COPILOT' | 'MERCHANT' | 'CUSTOMER';

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
  private readonly dirty = new Set<string>();

  // ---- durability (write-through; a no-op without a repository) ----------------
  private async saveRow(id: string): Promise<void> {
    const repos = getRepos();
    const record = this.records.get(id);
    if (!repos || !record) return;
    await repos.refunds.save({ ...record });
    this.dirty.delete(id);
  }

  private persist(id: string): void {
    if (!getRepos()) return;
    this.dirty.add(id);
    writeQueue.enqueue(`refund:${id}`, () => this.saveRow(id)).catch(() => undefined);
  }

  /** Awaitable durable save for the points where an answer must not precede storage. */
  async saveNow(id: string): Promise<void> {
    if (!getRepos()) return;
    this.dirty.add(id);
    await writeQueue.enqueue(`refund:${id}`, () => this.saveRow(id), { retries: 0 });
  }

  async retryDirty(): Promise<number> {
    const ids = [...this.dirty];
    for (const id of ids) {
      await writeQueue.enqueue(`refund-retry:${id}`, () => this.saveRow(id), { retries: 0 });
    }
    return ids.length;
  }

  /**
   * Loads the queue at boot. A record stored as PROCESSING means the process died while PayPal
   * was being asked: nobody knows whether the refund was issued.
   *
   * When the record already has a paypal_refund_id (from a previous successful PayPal response
   * that was persisted), we look it up at PayPal to determine the true status. If PayPal
   * confirms COMPLETED, the record is corrected to REFUNDED. If PayPal says FAILED/CANCELLED,
   * the record is corrected to PROPOSED (retryable). If the lookup fails or returns PENDING,
   * the record stays PROPOSED with a warning — an operator must check the PayPal dashboard.
   *
   * If the record has NO paypal_refund_id (crash before PayPal responded), it is re-opened as
   * PROPOSED with an explicit warning (the refund may already exist at PayPal).
   */
  async hydrate(): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    const rows = await repos.refunds.loadAll();
    for (const row of rows) {
      const record = { ...row } as RefundRequestRecord;
      if (record.status === 'PROCESSING') {
        const order = OrderService.getInstance().getById(record.orderId);
        const captureId = order?.paypalCaptureId;
        if (captureId && record.paypalRefundId) {
          // Best-effort reconciliation: ask PayPal for the true refund status.
          try {
            const refund = await paypalClient.getRefund(record.paypalRefundId);
            const paypalStatus = refund?.status;
            record.paypalRefundStatus = paypalStatus;
            if (paypalStatus === 'COMPLETED') {
              record.status = 'REFUNDED';
              record.lastError = undefined;
              record.decidedAt = new Date().toISOString();
            } else if (paypalStatus === 'FAILED' || paypalStatus === 'CANCELLED') {
              record.status = 'PROPOSED';
              record.lastError = `PayPal reports status "${paypalStatus}" for refund ${record.paypalRefundId}; retry is safe.`;
            } else {
              // PENDING or unknown — still indeterminate.
              record.status = 'PROPOSED';
              record.lastError =
                `Indeterminate refund status "${paypalStatus}" from PayPal for ${record.paypalRefundId}. ` +
                'Check the PayPal dashboard before retrying.';
            }
          } catch (err: any) {
            // Cannot reach PayPal — cannot determine truth. Leave as PROPOSED with warning.
            record.status = 'PROPOSED';
            record.lastError =
              `Could not verify refund ${record.paypalRefundId ?? 'unknown'} at PayPal: ${err?.message ?? err}. ` +
              'Check the PayPal dashboard, then approve to retry (the capture is verified first) or reject.';
          }
        } else {
          // No refund id persisted — crash before PayPal responded.
          record.status = 'PROPOSED';
          record.lastError =
            `${INTERRUPTED_PREFIX} while PayPal was being asked: the refund may already exist. ` +
            'Check the PayPal dashboard, then approve to retry (the capture is verified first) or reject.';
        }
        record.updatedAt = new Date().toISOString();
        this.records.set(record.id, record);
        this.persist(record.id);
      } else {
        this.records.set(record.id, record);
      }
    }
    return rows.length;
  }

  /**
   * Checks whether a refund record was already completed at PayPal before allowing a retry.
   * Returns true if the record is already REFUNDED (no retry needed).
   * Throws if PayPal is unreachable or reports a non-final status — the caller must not retry blindly.
   */
  private async reconcileRefundStatus(id: string, record: RefundRequestRecord): Promise<boolean> {
    if (!record.paypalRefundId) return false; // nothing to verify, proceed as normal retry
    try {
      const refund = await paypalClient.getRefund(record.paypalRefundId);
      const paypalStatus = refund?.status;
      record.paypalRefundStatus = paypalStatus;
      if (paypalStatus === 'COMPLETED') {
        // PayPal already completed this refund — mark it and do not re-issue.
        record.status = 'REFUNDED';
        record.decidedAt = new Date().toISOString();
        record.lastError = undefined;
        this.records.set(id, record);
        return true;
      }
      if (paypalStatus === 'FAILED' || paypalStatus === 'CANCELLED') {
        // PayPal definitively failed or cancelled, so another attempt is safe.
        record.status = 'PROPOSED';
        record.lastError = `PayPal reports status "${paypalStatus}" for refund ${record.paypalRefundId}; retry is safe.`;
        record.updatedAt = new Date().toISOString();
        this.records.set(id, record);
        return false;
      }
      // PENDING or unknown: ambiguous; block approval until PayPal confirms a final state.
      record.status = 'PROPOSED';
      record.lastError =
        `Indeterminate refund status "${paypalStatus}" from PayPal for ${record.paypalRefundId}. ` +
        'Check the PayPal dashboard before retrying.';
      record.updatedAt = new Date().toISOString();
      this.records.set(id, record);
      throw new RefundError(
        409,
        `Refund status at PayPal is indeterminate (${paypalStatus ?? 'unknown'}). Check the PayPal dashboard before retrying.`
      );
    } catch (err: any) {
      if (err instanceof RefundError) throw err;
      record.status = 'PROPOSED';
      record.lastError =
        `Could not verify refund ${record.paypalRefundId} at PayPal: ${err?.message ?? err}. ` +
        'Check the PayPal dashboard before retrying.';
      record.updatedAt = new Date().toISOString();
      this.records.set(id, record);
      throw new RefundError(
        503,
        `Cannot verify refund status at PayPal. Check the PayPal dashboard for ${record.paypalRefundId} before retrying.`
      );
    }
  }

  /** Removes a proposal that could not be stored (it was never acknowledged). */
  discard(id: string): void {
    this.records.delete(id);
    this.dirty.delete(id);
  }

  static getInstance(): RefundService {
    if (!RefundService.instance) RefundService.instance = new RefundService();
    return RefundService.instance;
  }

  /** Test hook. */
  reset(): void {
    this.records.clear();
    this.dirty.clear();
  }

  list(): RefundRequestRecord[] {
    return Array.from(this.records.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  listForOrder(orderId: string): RefundRequestRecord[] {
    return this.list().filter((r) => r.orderId === orderId);
  }

  get(id: string): RefundRequestRecord | undefined {
    return this.records.get(id);
  }

  refundedMinor(orderId: string): number {
    return this.list()
      .filter((r) => r.orderId === orderId && r.status === 'REFUNDED')
      .reduce((sum, r) => sum + r.amountMinor, 0);
  }

  /** Refunds PayPal accepted but has not confirmed (PENDING): not counted as refunded, not retried. */
  pendingMinor(orderId: string): number {
    return this.list()
      .filter((r) => r.orderId === orderId && r.status === 'PROCESSING')
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
    this.persist(record.id);
    return record;
  }

  /**
   * Decides whether an interrupted refund (no refund id) reached PayPal, from the capture's total
   * refunded amount compared with what this queue already refunded for the order:
   *   total >= ours + this  -> ISSUED        (do not send again)
   *   total == ours         -> NOT_ISSUED    (safe to send)
   *   anything else / PayPal unreachable / total missing -> blocked, nothing is sent.
   */
  private async verifyRefundViaCapture(
    record: RefundRequestRecord,
    captureId: string,
    paypalOrderId?: string
  ): Promise<'ISSUED' | 'NOT_ISSUED'> {
    const block = (status: number, message: string): never => {
      record.status = 'PROPOSED';
      record.lastError = `${INTERRUPTED_PREFIX}: ${message}`;
      record.updatedAt = new Date().toISOString();
      this.persist(record.id);
      throw new RefundError(status, message);
    };
    let capture: any;
    try {
      capture = await paypalClient.getCapture(captureId);
    } catch (err: any) {
      return block(
        503,
        'Cannot verify at PayPal whether the interrupted refund was issued. Nothing was re-sent; check the PayPal dashboard or retry when PayPal is reachable.'
      );
    }
    const atPayPal = await resolveRefundedMinor(capture, record.currency, paypalOrderId);
    if (atPayPal === null) {
      return block(503, 'PayPal did not report the refunded total for this capture. Nothing was re-sent; check the PayPal dashboard.');
    }
    const ours = Array.from(this.records.values())
      .filter((r) => r.orderId === record.orderId && r.status === 'REFUNDED' && r.id !== record.id)
      .reduce((sum, r) => sum + r.amountMinor, 0);
    if (atPayPal >= ours + record.amountMinor) return 'ISSUED';
    if (atPayPal === ours) return 'NOT_ISSUED';
    return block(
      409,
      `PayPal reports ${atPayPal} refunded on this capture but this queue accounts for ${ours} (+${record.amountMinor} pending): a refund outside this queue or a partial state. Nothing was re-sent; reconcile in the PayPal dashboard.`
    );
  }

  /**
   * Executes a PROPOSED refund after merchant approval. The PROPOSED -> PROCESSING flip happens
   * synchronously before the first await, so two concurrent approvals can never both reach PayPal.
   * The PayPal-Request-Id is stable across attempts, but the unverified idempotency window is not
   * relied upon: an ambiguous result must be reconciled against PayPal before another request.
   *
   * Before calling PayPal, if this record was reopened after a restart (i.e. it has a
   * paypal_refund_id from a previous attempt), we verify the refund's true status at PayPal.
   * If PayPal already shows COMPLETED, we mark it REFUNDED and return without re-issuing.
   * If the status is indeterminate, we block another request so the merchant can check PayPal.
   */
  async approve(id: string): Promise<RefundRequestRecord> {
    const record = this.records.get(id);
    if (!record) throw new RefundError(404, 'Refund request not found.');
    if (record.status !== 'PROPOSED') throw new RefundError(409, `Refund request is ${record.status}, not PROPOSED.`);

    const order = this.requireRefundableOrder(record.orderId);

    // CLAIM THE IN-FLIGHT STATE SYNCHRONOUSLY, before any await. This covers the
    // reopened-retry path too: a second concurrent approval then sees PROCESSING
    // and is rejected instead of both entering the PayPal request path. If the
    // process dies here, the durable row is still PROPOSED (nothing was saved
    // yet), so a restart re-opens it safely.
    const interrupted =
      !record.paypalRefundId &&
      (record.lastError?.startsWith(INTERRUPTED_PREFIX) === true ||
        record.lastError?.startsWith(INDETERMINATE_PREFIX) === true);
    const previousError = record.lastError;
    record.status = 'PROCESSING';
    record.lastError = undefined;
    record.updatedAt = new Date().toISOString();

    try {
      // A refund interrupted by a crash has no refund id to look up. Before anything is sent again,
      // PayPal's refunded total on the capture says whether it was issued; if that cannot be
      // established the request stays blocked (503/409) and NOTHING is re-sent.
      if (interrupted) {
        const verdict = await this.verifyRefundViaCapture(record, order.paypalCaptureId!, order.paypalOrderId);
        if (verdict === 'ISSUED') {
          record.status = 'REFUNDED';
          record.decidedAt = new Date().toISOString();
          record.lastError =
            'Confirmed at PayPal through the capture\'s refunded total; the refund id was not recorded before the interruption.';
          record.updatedAt = new Date().toISOString();
          await this.saveNow(record.id).catch((err: any) =>
            console.error(`REFUND_PERSIST_FAILED id=${record.id} error=${err?.message ?? err}`)
          );
          return record;
        }
      }

      // Pre-flight: if this is a retry of a crashed refund that already has a PayPal
      // refund id, verify at PayPal before re-issuing. If PayPal is unreachable,
      // refuse to auto-retry — the merchant must check the dashboard first.
      if (record.paypalRefundId) {
        const alreadyCompleted = await this.reconcileRefundStatus(id, record);
        if (alreadyCompleted) {
          record.updatedAt = new Date().toISOString();
          await this.saveNow(record.id).catch((err: any) =>
            console.error(`REFUND_PERSIST_FAILED id=${record.id} error=${err?.message ?? err}`)
          );
          return record;
        }
        // A false result means PayPal confirmed the prior refund FAILED or CANCELLED.
        // Start a fresh attempt without carrying that terminal refund ID forward.
        record.paypalRefundId = undefined;
        record.paypalRefundStatus = undefined;
        record.status = 'PROCESSING';
        record.updatedAt = new Date().toISOString();
      }

      // WRITE-AHEAD: PROCESSING must be durable BEFORE PayPal is contacted. If storage is
      // down nothing was sent to PayPal and the request goes back to PROPOSED.
      await this.saveNow(record.id);
    } catch (err: any) {
      // Reconciliation could not prove the prior refund's state (503), or the
      // write-ahead save failed. Nothing was sent to PayPal in either case.
      record.status = 'PROPOSED';
      record.updatedAt = new Date().toISOString();
      if (err instanceof RefundError) {
        record.lastError = record.lastError ?? previousError;
        throw err;
      }
      console.error(`REFUND_PERSIST_FAILED id=${record.id} error=${err?.message ?? err}`);
      throw new RefundError(503, 'Storage unavailable; the refund was not attempted. Please retry.');
    }

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
      record.paypalRefundId = result?.id;
      record.paypalRefundStatus = result?.status;
      if (result?.status === 'COMPLETED') {
        record.status = 'REFUNDED';
        record.lastError = undefined;
        record.decidedAt = new Date().toISOString();
        void emitAutomationEvent('refund.completed', {
          refundRequestId: record.id,
          orderId: record.orderId,
          amountMinor: record.amountMinor,
          currency: record.currency,
        }, { dedupeKey: record.id });
      } else if (result?.status === 'FAILED' || result?.status === 'CANCELLED') {
        record.status = 'PROPOSED';
        record.lastError = `PayPal reports status "${result.status}" for refund ${result.id ?? 'without an id'}.`;
      } else {
        record.status = 'PROCESSING';
        record.lastError =
          `PayPal returned an indeterminate refund status "${result?.status ?? 'unknown'}". ` +
          'The refund will not be retried until its status is verified.';
      }
    } catch (err: any) {
      record.status = 'PROPOSED';
      record.paypalRefundId = undefined;
      record.paypalRefundStatus = undefined;
      record.lastError =
        `${INDETERMINATE_PREFIX}: PayPal did not return a refund result; the refund may already have been issued. ` +
        'The capture total must be checked before any retry.';
      console.error(`REFUND_FAILED id=${record.id} error=${redactSecrets(formatError(err)).slice(0, 200)}`);
    }
    record.updatedAt = new Date().toISOString();
    // Money may have moved: store the outcome, but a storage error must not turn a
    // successful refund into an error response (retry loop + boot reload converge).
    try {
      await this.saveNow(record.id);
    } catch (err: any) {
      console.error(`REFUND_PERSIST_FAILED_AFTER_PAYPAL id=${record.id} error=${err?.message ?? err}`);
    }
    return record;
  }

  async reject(id: string): Promise<RefundRequestRecord> {
    const record = this.records.get(id);
    if (!record) throw new RefundError(404, 'Refund request not found.');
    if (record.status !== 'PROPOSED') throw new RefundError(409, `Refund request is ${record.status}, not PROPOSED.`);

    const previousStatus = record.status;
    const previousUpdatedAt = record.updatedAt;
    const previousDecidedAt = record.decidedAt;
    record.status = 'REJECTED';
    record.decidedAt = record.updatedAt = new Date().toISOString();

    try {
      // Do not acknowledge a rejection until its state is durably stored.
      await this.saveNow(record.id);
    } catch {
      // Keep the in-memory queue aligned with the last durable database state.
      record.status = previousStatus;
      record.updatedAt = previousUpdatedAt;
      if (previousDecidedAt === undefined) delete record.decidedAt;
      else record.decidedAt = previousDecidedAt;
      throw new RefundError(503, 'Storage unavailable; the refund rejection was not saved. Please retry.');
    }

    return record;
  }
}

export const refundService = RefundService.getInstance();

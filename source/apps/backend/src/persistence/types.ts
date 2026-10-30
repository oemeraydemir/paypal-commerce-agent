import { Order } from '../orders/domain';
import { BillGroup } from '../bills/domain';
import { BillShare } from '../bills/domain';

export type ReservationRowState = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export interface ReservationRow {
  id: string;
  userId: string;
  amountMinor: number;
  state: ReservationRowState;
  createdAt: Date;
  settledAt?: Date;
}

export interface IdempotencyRow {
  key: string;
  status: number;
  body: unknown;
  fingerprint: string;
  createdAt: Date;
}

export interface SessionRow {
  sessionId: string;
  userId: string;
  /** hex SHA-256 of the bearer token; the token itself is never stored */
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface SessionRepository {
  loadAll(): Promise<SessionRow[]>;
  save(row: SessionRow): Promise<void>;
  remove(sessionId: string): Promise<void>;
}

export interface RefundRow {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  proposedBy: string;
  status: string;
  paypalRefundId?: string;
  paypalRefundStatus?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
}

export interface RefundRepository {
  loadAll(): Promise<RefundRow[]>;
  save(row: RefundRow): Promise<void>;
}

export interface PolicyEventRepository {
  /** Most recent events, returned oldest-first. */
  loadRecent(limit: number): Promise<any[]>;
  save(event: { id: string; userId: string; timestamp: string }): Promise<void>;
}

export interface OrderRepository {
  loadAll(): Promise<Order[]>;
  /** Upserts the full current snapshot of one order (self-healing: last write wins). */
  save(order: Order): Promise<void>;
}

export interface ReservationRepository {
  /** All PENDING reservations plus settled ones newer than `retentionMs`. */
  loadActive(retentionMs: number): Promise<ReservationRow[]>;
  save(row: ReservationRow): Promise<void>;
}

export interface IdempotencyRepository {
  get(key: string): Promise<IdempotencyRow | undefined>;
  save(row: IdempotencyRow): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}

/** Safe, normalised evidence of a webhook that was held for review (never the raw payload or headers). */
export interface WebhookReviewRecord {
  eventId: string;
  orderId: string;
  reason: 'AMOUNT_MISMATCH' | 'EVIDENCE_INCOMPLETE';
  expectedMinor: number;
  expectedCurrency: string;
  reportedValue?: string;
  reportedCurrency?: string;
  captureStatus?: string;
  captureId?: string;
}

export interface WebhookReviewRepository {
  /** Idempotent per event id. Throws when the write fails (the caller must then NOT answer 2xx). */
  record(review: WebhookReviewRecord): Promise<void>;
  listForOrder(orderId: string): Promise<WebhookReviewRecord[]>;
}

export interface WebhookEventRepository {
  /** Most recent processed event ids. */
  loadRecentIds(limit: number): Promise<string[]>;
  /** Idempotent: recording the same id twice is a no-op. */
  save(eventId: string): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}

export interface CaptureClaimRepository {
  /** true when this caller now owns the order's capture claim; false when another live claim exists. */
  tryClaim(orderId: string, ttlMs: number): Promise<boolean>;
  release(orderId: string): Promise<void>;
}

export interface InviteNonceRow {
  nonce: string;
  billId: string;
  status: 'PENDING' | 'CONSUMED';
  expiresAt: Date;
  createdAt: Date;
  consumedAt?: Date;
}

export type BillJoinResult =
  | { ok: true; shareId: string }
  | { ok: false; reason: 'INVALID_OR_EXPIRED' | 'ALREADY_USED' | 'FULL' | 'ALREADY_PARTICIPANT' | 'BILL_NOT_FOUND' };

/**
 * Split Bill P3 repository. Decisions that MUST be atomic across instances are
 * performed by the DB (atomic UPDATEs / a transaction) and are NEVER routed
 * through the fire-and-forget write queue; the write queue is only used for
 * convergent snapshot persistence of already-decided state.
 */
export interface BillRepository {
  loadAllGroups(): Promise<BillGroup[]>;
  loadAllShares(): Promise<(BillShare & { billId: string })[]>;
  /** Loads one group with its shares (durable read). */
  getGroup(billId: string): Promise<BillGroup | undefined>;
  /** Loads one share (with its bill id). */
  getShare(shareId: string): Promise<(BillShare & { billId: string }) | undefined>;
  /** Loads all invite nonces (used to rebuild the single-use sets on hydrate). */
  loadAllNonces(): Promise<InviteNonceRow[]>;
  /** Upserts a group and all of its shares (convergent snapshot). */
  saveGroup(group: BillGroup): Promise<void>;
  /** Registers a freshly minted invite nonce (PENDING). */
  insertInviteNonce(row: InviteNonceRow): Promise<void>;
  /**
   * Atomic per-share payment claim. The `bill_share_claims` mutex (PK on
   * share_id, `INSERT … ON CONFLICT DO NOTHING`) makes exactly one of N
   * concurrent callers the winner; the losers get false and must NOT create an
   * order. The winner also records `order_id` on the share (the unique index
   * `bill_shares_order_uq` is a backstop). Only the winner mutates the share.
   */
  claimShareForPayment(shareId: string, orderId: string): Promise<boolean>;
  /** Releases a failed claim so the share can be paid again (only if still this order). */
  releaseClaim(shareId: string, orderId: string): Promise<boolean>;
  /**
   * Atomic, transactional join: consumes the invite nonce AND binds an open slot
   * in one transaction. Serializes per-bill joins so two different tokens racing
   * for the last slot cannot both bind, and the same token can never be replayed.
   */
  joinBill(opts: { billId: string; nonce: string; userId: string }): Promise<BillJoinResult>;
  /**
   * Boot recovery: clears claims whose order row does not exist AND that are
   * older than the TTL (`claimed_at < now() - 5min`). A claim that is minutes-old
   * with no order means the instance crashed between the claim and the order
   * row insert — safe to free. A claim set moments ago (order row merely not yet
   * written) is NEVER cleared, so an in-flight payment can never be double-claimed.
   * Returns the number of cleared claims.
   */
  reconcileOrphanClaims(): Promise<number>;
}

export type PickupBookingStatus = 'HELD' | 'CONFIRMED' | 'RELEASED';

export interface PickupSlotRow {
  id: string;
  /** Pickup calendar day (server-owned; never from the client). */
  day: string;
  startTs: Date;
  endTs: Date;
  /** Server-owned maximum concurrent bookings for this window. */
  capacity: number;
  /** Authoritative, server-owned occupancy. Only mutated inside a DB transaction. */
  reservedCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PickupBookingRow {
  id: string;
  slotId: string;
  /** NULL until linked to the order the customer pays (separate, non-capture endpoint). */
  orderId?: string;
  sessionId: string;
  status: PickupBookingStatus;
  createdAt: Date;
  updatedAt: Date;
  /** Definitive non-payment cutoff for an UNLINKED HELD booking (no order ever created). */
  expiresAt: Date;
}

export interface PickupReserveInput {
  slotId: string;
  sessionId: string;
  bookingId: string;
  expiresAt: Date;
}

export interface PickupReserveOutcome {
  outcome: 'OK' | 'FULL' | 'SLOT_NOT_FOUND' | 'ALREADY_HELD';
  bookingId?: string;
}

export interface PickupReconcileSummary {
  examined: number;
  confirmed: number;
  released: number;
  kept: number;
  errors: number;
}

/**
 * Pickup capacity is the server's authoritative state. Every implementation MUST
 * make the capacity check and the booking write atomic (a DB transaction with
 * SELECT … FOR UPDATE in production). An in-memory implementation is dev-only and
 * not safe across instances — never a substitute for the PostgreSQL guarantee.
 */
export interface PickupRepository {
  createSlot(row: PickupSlotRow): Promise<void>;
  getAvailability(day: string): Promise<PickupSlotRow[]>;
  getSlot(slotId: string): Promise<PickupSlotRow | undefined>;
  /** Merchant view: every slot with its bookings (server-owned, no client trust). */
  getMerchantPlan(): Promise<{ slot: PickupSlotRow; bookings: PickupBookingRow[] }[]>;
  /** Atomic + idempotent: reserves capacity and writes a HELD booking, or returns FULL. */
  reserve(input: PickupReserveInput): Promise<'OK' | 'FULL' | 'SLOT_NOT_FOUND' | 'ALREADY_HELD'>;
  /** Atomic + idempotent: releases a HELD booking and frees one capacity unit. Never double-decrements. */
  release(input: { bookingId: string; sessionId: string }): Promise<
    'RELEASED' | 'ALREADY_RELEASED' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFIRMED'
  >;
  /** Links a HELD booking to its (same-session, server-created) order. No capture change.
   *  Returns 'CONFIRMED' when the linked order was already paid (booking confirmed at
   *  link time) and 'OK' when linked but still HELD (awaiting reconciliation). */
  link(input: { bookingId: string; orderId: string; sessionId: string }): Promise<
    'OK' | 'CONFIRMED' | 'NOT_FOUND' | 'FORBIDDEN' | 'MISMATCH'
  >;
  /**
   * Idempotent reconciliation. Reads the EXISTING orders.status (authoritative
   * payment result) and moves HELD bookings to CONFIRMED / RELEASED / keep:
   *   - linked booking + PAID/ORDER_CONFIRMED → CONFIRMED (capacity kept)
   *   - linked booking + PAYMENT_FAILED/ORDER_CANCELLED → RELEASED (capacity freed)
   *   - linked booking in any other state → KEEP (ambiguous: never fabricate)
   *   - UNLINKED booking past expires_at → RELEASED (definitive non-payment)
   *   - UNLINKED booking still within expires_at → KEEP
   * Each transition is its own transaction and re-runnable, so a crash mid-sweep
   * leaves the booking record and capacity counter consistent.
   */
  reconcile(): Promise<PickupReconcileSummary>;
}

export interface Repositories {
  mode: 'postgres';
  orders: OrderRepository;
  reservations: ReservationRepository;
  idempotency: IdempotencyRepository;
  sessions: SessionRepository;
  refunds: RefundRepository;
  policyEvents: PolicyEventRepository;
  webhookEvents: WebhookEventRepository;
  webhookReviews: WebhookReviewRepository;
  captureClaims: CaptureClaimRepository;
  bills: BillRepository;
  pickup: PickupRepository;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** The subset of pg.Pool / pg-mem's pool that this layer needs. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

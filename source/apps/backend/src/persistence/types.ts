import { Order } from '../orders/domain';

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
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** The subset of pg.Pool / pg-mem's pool that this layer needs. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

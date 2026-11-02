// Split Bill domain model (Priority 6, P1: read-only group).
//
// P1 covers: create a bill group from a server-priced cart, mint/verify invite
// tokens, join (which binds the caller to the next open share), and read group
// state + progress. It deliberately does NOT move money yet (P2 reuses the
// existing order/capture pipeline per share).
//
// Invariants carried from the design doc (docs/split-bill-design.md):
// - Every amount is computed server-side from the shared cart; a participant can
//   never send their own amount.
// - Group status is DERIVED from shares, never stored as the source of truth
//   for money.
// - A share is bound to exactly one participant; a participant owns one share.

export enum BillStatus {
  OPEN = 'OPEN',
  PARTIALLY_SETTLED = 'PARTIALLY_SETTLED',
  SETTLED = 'SETTLED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

/** Why a bill was closed. Persisted for the audit trail (never inferred later). */
export enum BillCloseReason {
  DEADLINE_EXPIRED = 'DEADLINE_EXPIRED',
  CANCELLED_BY_OWNER = 'CANCELLED_BY_OWNER',
}

export enum ShareStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  WAIVED = 'WAIVED',
  FAILED = 'FAILED',
}

export enum SplitStrategy {
  EQUAL = 'EQUAL',
  ITEMIZED = 'ITEMIZED',
  CUSTOM = 'CUSTOM',
}

export interface BillItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface BillShare {
  id: string;
  /** Bound when the owner creates the bill (slot 0) or a joiner claims a slot. */
  participantUserId?: string;
  /** Optional, user-supplied display name; never trusted for amounts. */
  displayName?: string;
  amountMinor: number;
  status: ShareStatus;
  orderId?: string;
  paidAt?: Date;
}

export interface BillGroup {
  id: string;
  merchantId: string;
  currency: string;
  /** Derived from shares on read; stored for convenience/audit only. */
  status: BillStatus;
  createdByUserId: string;
  totalMinor: number;
  items: BillItem[];
  strategy: SplitStrategy;
  shares: BillShare[];
  /** Payment deadline, fixed ONCE at creation (no hard-coded duration anywhere). */
  expiresAt?: Date;
  /** Set when the bill is closed; together with closeReason this is the audit record. */
  closedAt?: Date;
  closeReason?: BillCloseReason;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillProgress {
  sharesTotal: number;
  sharesPaid: number;
  sharesWaived: number;
  paidMinor: number;
}

/** Minimum/maximum number of participants a bill may have (P1: EQUAL split). */
export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 20;

/**
 * Bounds for the owner-chosen payment window. The default is only a pre-filled
 * suggestion for clients; the effective value is always stored on the bill as
 * `expiresAt`.
 */
export const MIN_BILL_DEADLINE_MINUTES = 15;
export const MAX_BILL_DEADLINE_MINUTES = 7 * 24 * 60;
export const DEFAULT_BILL_DEADLINE_MINUTES = 120;

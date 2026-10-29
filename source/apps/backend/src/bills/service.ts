// Split Bill service — P1 (read-only group) + P2 (per-share payment).
//
// ⚠️  PERSISTENCE LIMITATION — PROTOTYPE-ONLY.
//   All state here (groups, invite nonces) is IN MEMORY and per process instance:
//   restarts lose groups/nonces, and the single-use nonce reservation and the
//   per-share payment claim are only atomic within one process — NOT across
//   multiple instances. Multi-instance production requires a durable,
//   atomically-reserved store (e.g. Postgres unique constraint / row lock) and
//   explicit approval.
//
// Holds the in-memory group store, computes server-authoritative shares, and
// mints/verifies signed single-use invite tokens. P1 deliberately exposes no
// payment/settlement path: shares stay PENDING until P2 reuses the existing
// order/capture pipeline per share.
//
// Invite token format: `<b64url(canonical payload)>.<signature>.<kid>` where the
// payload is `{ billId, nonce, exp }` signed with the SAME Ed25519 keyring as
// the Cart Mandate (one public key verifies both). Replay/abuse protection:
//   - single-use nonce registered at mint time (a token can never be replayed);
//   - short expiry (1h);
//   - signature verified against the active/previous keyring;
//   - a user can join only once per bill, and only while a PENDING slot is open.

import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { signPayload, verifyPayloadSignature } from '../mandate/mandate-service';
import { AppError } from '../middleware/error-handler';
import { OrderService } from '../orders/service';
import { OrderStatus, Order } from '../orders/domain';
import { getRepos, writeQueue } from '../persistence/registry';
import {
  BillGroup,
  BillItem,
  BillProgress,
  BillShare,
  BillStatus,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  ShareStatus,
  SplitStrategy,
} from './domain';

const INVITE_TTL_MS = 60 * 60 * 1000; // invites are short-lived

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Deterministic EQUAL split: floor(total / n) to everyone, with the `total % n`
 * remainder minor units spread one-per-share over the lowest-indexed shares.
 * The result always sums exactly to `totalMinor` and differs by at most 1 unit.
 * Amounts are frozen at bill creation (a paid share can never be re-split).
 */
export function computeEqualSplit(totalMinor: number, n: number): number[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new Error('totalMinor must be a non-negative integer');
  }
  if (!Number.isInteger(n) || n < MIN_PARTICIPANTS || n > MAX_PARTICIPANTS) {
    throw new Error(`participant count must be an integer between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}`);
  }
  const base = Math.floor(totalMinor / n);
  const rem = totalMinor % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Group status is DERIVED from shares; never a stored source of truth for money. */
export function deriveBillStatus(shares: BillShare[]): BillStatus {
  if (shares.length === 0) return BillStatus.OPEN;
  const resolved = shares.filter(
    (s) => s.status === ShareStatus.PAID || s.status === ShareStatus.WAIVED
  ).length;
  if (resolved === shares.length) return BillStatus.SETTLED;
  if (shares.some((s) => s.status === ShareStatus.PAID)) return BillStatus.PARTIALLY_SETTLED;
  return BillStatus.OPEN;
}

export function deriveBillProgress(shares: BillShare[]): BillProgress {
  const paid = shares.filter((s) => s.status === ShareStatus.PAID);
  return {
    sharesTotal: shares.length,
    sharesPaid: paid.length,
    sharesWaived: shares.filter((s) => s.status === ShareStatus.WAIVED).length,
    paidMinor: paid.reduce((sum, s) => sum + s.amountMinor, 0),
  };
}

/**
 * P2: a share's effective status is DERIVED from its underlying order (the
 * single source of truth for money). The stored `BillShare.status` field is a
 * fallback only; once a share has an order, PayPal/order state decides.
 */
export function effectiveShareStatus(share: BillShare): ShareStatus {
  const order: Order | undefined = share.orderId
    ? OrderService.getInstance().getById(share.orderId)
    : undefined;
  if (order) {
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.ORDER_CONFIRMED) {
      return ShareStatus.PAID;
    }
    if (
      order.status === OrderStatus.PAYMENT_FAILED ||
      order.status === OrderStatus.ORDER_CANCELLED
    ) {
      return ShareStatus.FAILED;
    }
    // PAYMENT_PENDING / CART_READY etc. still count as pending.
  }
  return share.status;
}

export class BillService {
  private static instance: BillService;
  private readonly groups = new Map<string, BillGroup>();
  /** Reserved invite nonces (minted). A token whose nonce is not reserved is forged. */
  private readonly pendingInviteNonces = new Set<string>();
  /** Nonces consumed by a successful join. Enforces true single-use per token. */
  private readonly consumedInviteNonces = new Set<string>();

  private constructor() {}

  static getInstance(): BillService {
    if (!BillService.instance) BillService.instance = new BillService();
    return BillService.instance;
  }

  createGroup(opts: {
    createdByUserId: string;
    items: BillItem[];
    participantCount: number;
    currency: string;
    merchantId: string;
  }): BillGroup {
    const totalMinor = opts.items.reduce((sum, i) => sum + i.lineTotalMinor, 0);
    const amounts = computeEqualSplit(totalMinor, opts.participantCount);
    const id = `bill_${crypto
      .createHash('sha256')
      .update(`${opts.createdByUserId}:${stringify(opts.items)}:${opts.participantCount}`)
      .digest('hex')
      .slice(0, 16)}`;
    const now = new Date();
    const shares: BillShare[] = amounts.map((amountMinor, i) => ({
      id: `share_${crypto.createHash('sha256').update(`${id}:${i}`).digest('hex').slice(0, 16)}`,
      // The owner occupies slot 0; the remaining slots fill in join order.
      participantUserId: i === 0 ? opts.createdByUserId : undefined,
      amountMinor,
      status: ShareStatus.PENDING,
    }));
    const group: BillGroup = {
      id,
      merchantId: opts.merchantId,
      currency: opts.currency,
      status: BillStatus.OPEN,
      createdByUserId: opts.createdByUserId,
      totalMinor,
      items: opts.items,
      strategy: SplitStrategy.EQUAL,
      shares,
      createdAt: now,
      updatedAt: now,
    };
    this.groups.set(id, group);
    // Convergent snapshot to the durable store (retryable, serialized) — the DB
    // is the source of truth for atomic decisions; this only heals the read model.
    const repos = getRepos();
    if (repos) {
      writeQueue
        .enqueue(`bill-group:${id}`, () => repos.bills.saveGroup(group))
        .catch((err: any) =>
          console.error(`BILL_GROUP_PERSIST_FAILED id=${id} error=${err?.message ?? err}`)
        );
    }
    return group;
  }

  getById(id: string): BillGroup | undefined {
    return this.groups.get(id);
  }

  isParticipant(group: BillGroup, userId: string): boolean {
    if (group.createdByUserId === userId) return true;
    return group.shares.some((s) => s.participantUserId === userId);
  }

  /** Snapshot of shares with effective (order-derived) status for read serialization. */
  effectiveShares(group: BillGroup): BillShare[] {
    return group.shares.map((s) => ({ ...s, status: effectiveShareStatus(s) }));
  }

  mintInvite(billId: string): { token: string; ttlSeconds: number } {
    const group = this.groups.get(billId);
    if (!group) throw new AppError(404, 'Bill not found');
    const nonce = crypto.randomUUID();
    // Reserve before returning so a minted nonce is tracked even if the response is lost.
    this.pendingInviteNonces.add(nonce);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const repos = getRepos();
    if (repos) {
      // Persist the nonce so a restart keeps it single-use (token fails closed if lost).
      repos.bills
        .insertInviteNonce({ nonce, billId, status: 'PENDING', expiresAt, createdAt: new Date() })
        .catch((err: any) =>
          console.error(`BILL_NONCE_PERSIST_FAILED nonce=${nonce} error=${err?.message ?? err}`)
        );
    }
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const payload = { billId, nonce, exp };
    const { signature, kid } = signPayload(payload);
    const token = `${b64url(Buffer.from(stringify(payload)))}.${signature}.${kid}`;
    return { token, ttlSeconds: INVITE_TTL_MS / 1000 };
  }

  /**
   * Repopulates the in-memory read model from the durable store. Must run once at
   * boot (before listen). The DB remains the source of truth for atomic decisions;
   * memory is just the fast read/serve model. Returns the number of groups loaded.
   */
  async hydrate(): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    const groups = await repos.bills.loadAllGroups();
    let loaded = 0;
    for (const g of groups) {
      const full = await repos.bills.getGroup(g.id);
      if (full) {
        this.groups.set(full.id, full);
        loaded++;
      }
    }
    const nonces = await repos.bills.loadAllNonces();
    for (const n of nonces) {
      if (n.status === 'PENDING') this.pendingInviteNonces.add(n.nonce);
      else this.consumedInviteNonces.add(n.nonce);
    }
    return loaded;
  }

  joinWithToken(token: string, userId: string): Promise<{ group: BillGroup; shareId: string }> {
    return this.joinWithTokenImpl(token, userId);
  }

  private async joinWithTokenImpl(token: string, userId: string): Promise<{ group: BillGroup; shareId: string }> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new AppError(400, 'Malformed invite token');
    const [rawPayload, signature, kid] = parts;
    let payload: object;
    try {
      const parsed: unknown = JSON.parse(fromB64url(rawPayload).toString('utf8'));
      if (typeof parsed !== 'object' || parsed === null) throw new Error();
      payload = parsed;
    } catch {
      throw new AppError(400, 'Malformed invite token');
    }
    if (!verifyPayloadSignature(signature, kid, payload)) {
      throw new AppError(400, 'Invalid invite token');
    }
    const { billId, nonce, exp } = payload as { billId?: unknown; nonce?: unknown; exp?: unknown };
    if (typeof billId !== 'string' || typeof nonce !== 'string' || typeof exp !== 'number') {
      throw new AppError(400, 'Invalid invite token');
    }
    // True single-use: a token can be redeemed exactly once. Check this BEFORE
    // the pending/forged check so a replayed (already-consumed) token is clearly
    // distinguished from a forged/unknown one.
    if (this.consumedInviteNonces.has(nonce)) {
      throw new AppError(409, 'Invite token already used');
    }
    if (!this.pendingInviteNonces.has(nonce)) {
      throw new AppError(400, 'Invalid or expired invite token');
    }
    if (exp <= Math.floor(Date.now() / 1000)) {
      throw new AppError(400, 'Invite token expired');
    }
    const group = this.groups.get(billId);
    if (!group) throw new AppError(404, 'Bill not found');
    if (this.isParticipant(group, userId)) {
      throw new AppError(409, 'You are already a participant in this bill');
    }

    const repos = getRepos();
    if (repos) {
      // Atomic, transactional decision in the DB: consumes the nonce AND binds an
      // open slot. Every failure rolls back and leaves the nonce PENDING (reusable).
      const res = await repos.bills.joinBill({ billId, nonce, userId });
      if (!res.ok) {
        switch (res.reason) {
          case 'ALREADY_USED':
            throw new AppError(409, 'Invite token already used');
          case 'FULL':
            throw new AppError(409, 'Bill is full');
          case 'ALREADY_PARTICIPANT':
            throw new AppError(409, 'You are already a participant in this bill');
          case 'INVALID_OR_EXPIRED':
            throw new AppError(400, 'Invalid or expired invite token');
          case 'BILL_NOT_FOUND':
          default:
            throw new AppError(404, 'Bill not found');
        }
      }
      // Mirror the committed DB decision in memory (joinBill already persisted it).
      const share = group.shares.find((s) => s.id === res.shareId);
      if (share) {
        share.participantUserId = userId;
        share.status = ShareStatus.PENDING;
      }
      group.updatedAt = new Date();
      this.consumedInviteNonces.add(nonce);
      this.pendingInviteNonces.delete(nonce);
      return { group, shareId: res.shareId };
    }

    // In-memory only (no durable store): original single-instance behavior.
    const open = group.shares.find((s) => !s.participantUserId && s.status === ShareStatus.PENDING);
    if (!open) throw new AppError(409, 'Bill is full');
    open.participantUserId = userId;
    group.updatedAt = new Date();
    this.consumedInviteNonces.add(nonce);
    this.pendingInviteNonces.delete(nonce);
    return { group, shareId: open.id };
  }

  /** TEST-ONLY: clears in-memory groups and invite nonces. Never used in production paths. */
  reset(): void {
    this.groups.clear();
    this.pendingInviteNonces.clear();
    this.consumedInviteNonces.clear();
  }
}

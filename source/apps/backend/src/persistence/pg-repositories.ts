import { Order, OrderOrigin, OrderStatus } from '../orders/domain';
import { BillGroup, BillShare, BillStatus, ShareStatus, SplitStrategy } from '../bills/domain';
import {
  IdempotencyRepository,
  OrderRepository,
  Queryable,
  Repositories,
  PickupRepository,
  PickupSlotRow,
  PickupBookingRow,
  PickupBookingStatus,
  PickupReserveInput,
  PickupReconcileSummary,
  PolicyEventRepository,
  WebhookEventRepository,
  WebhookReviewRecord,
  WebhookReviewRepository,
  CaptureClaimRepository,
  BillRepository,
  BillJoinResult,
  InviteNonceRow,
  RefundRepository,
  RefundRow,
  ReservationRepository,
  ReservationRow,
  SessionRepository,
  SessionRow,
} from './types';

const toDate = (value: unknown): Date | undefined =>
  value === null || value === undefined ? undefined : value instanceof Date ? value : new Date(value as string);

const parseJson = <T>(value: unknown): T =>
  (typeof value === 'string' ? JSON.parse(value) : value) as T;

function rowToOrder(row: any): Order {
  const order: Order = {
    id: row.id,
    sessionId: row.session_id,
    status: row.status as OrderStatus,
    origin: row.origin as OrderOrigin,
    items: parseJson(row.items),
    totalMinor: Number(row.total_minor),
    currency: row.currency,
    createdAt: toDate(row.created_at)!,
    updatedAt: toDate(row.updated_at)!,
  };
  if (row.paypal_order_id) order.paypalOrderId = row.paypal_order_id;
  if (row.paypal_capture_id) order.paypalCaptureId = row.paypal_capture_id;
  if (row.paypal_status) order.paypalStatus = row.paypal_status;
  if (row.idempotency_key) order.idempotencyKey = row.idempotency_key;
  if (row.request_fingerprint) order.requestFingerprint = row.request_fingerprint;
  if (row.reservation_id) order.reservationId = row.reservation_id;
  const started = toDate(row.capture_started_at);
  if (started) order.captureStartedAt = started;
  if (row.agent_context) order.agentContext = parseJson(row.agent_context);
  return order;
}

class PgOrderRepository implements OrderRepository {
  constructor(private readonly db: Queryable) {}

  async loadAll(): Promise<Order[]> {
    const { rows } = await this.db.query('SELECT * FROM orders ORDER BY created_at ASC');
    return rows.map(rowToOrder);
  }

  async save(o: Order): Promise<void> {
    // Immutable facts (session, origin, items, total, currency, idempotency key)
    // are written once; only the lifecycle columns are updated on conflict.
    await this.db.query(
      `INSERT INTO orders (
         id, session_id, status, origin, items, total_minor, currency,
         paypal_order_id, paypal_capture_id, paypal_status, idempotency_key,
         request_fingerprint, reservation_id, capture_started_at, agent_context,
         created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         paypal_order_id = EXCLUDED.paypal_order_id,
         paypal_capture_id = EXCLUDED.paypal_capture_id,
         paypal_status = EXCLUDED.paypal_status,
         reservation_id = EXCLUDED.reservation_id,
         capture_started_at = EXCLUDED.capture_started_at,
         updated_at = EXCLUDED.updated_at`,
      [
        o.id,
        o.sessionId,
        o.status,
        o.origin,
        JSON.stringify(o.items),
        o.totalMinor,
        o.currency,
        o.paypalOrderId ?? null,
        o.paypalCaptureId ?? null,
        o.paypalStatus ?? null,
        o.idempotencyKey ?? null,
        o.requestFingerprint ?? null,
        o.reservationId ?? null,
        o.captureStartedAt ?? null,
        o.agentContext ? JSON.stringify(o.agentContext) : null,
        o.createdAt,
        o.updatedAt,
      ]
    );
  }
}

class PgReservationRepository implements ReservationRepository {
  constructor(private readonly db: Queryable) {}

  async loadActive(retentionMs: number): Promise<ReservationRow[]> {
    const cutoff = new Date(Date.now() - retentionMs);
    const { rows } = await this.db.query(
      `SELECT * FROM spend_reservations
        WHERE state = 'PENDING' OR settled_at >= $1
        ORDER BY created_at ASC`,
      [cutoff]
    );
    return rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      amountMinor: Number(r.amount_minor),
      state: r.state,
      createdAt: toDate(r.created_at)!,
      settledAt: toDate(r.settled_at),
    }));
  }

  async save(row: ReservationRow): Promise<void> {
    await this.db.query(
      `INSERT INTO spend_reservations (id, user_id, amount_minor, state, created_at, settled_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, settled_at = EXCLUDED.settled_at`,
      [row.id, row.userId, row.amountMinor, row.state, row.createdAt, row.settledAt ?? null]
    );
  }
}

class PgIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly db: Queryable) {}

  async get(key: string) {
    const { rows } = await this.db.query('SELECT * FROM idempotency_records WHERE key = $1', [key]);
    const r = rows[0];
    if (!r) return undefined;
    return {
      key: r.key as string,
      status: Number(r.status),
      body: parseJson<unknown>(r.body),
      fingerprint: r.fingerprint as string,
      createdAt: toDate(r.created_at)!,
    };
  }

  async save(row: { key: string; status: number; body: unknown; fingerprint: string; createdAt: Date }) {
    await this.db.query(
      `INSERT INTO idempotency_records (key, status, body, fingerprint, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO NOTHING`,
      [row.key, row.status, JSON.stringify(row.body ?? null), row.fingerprint, row.createdAt]
    );
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const res = await this.db.query('DELETE FROM idempotency_records WHERE created_at < $1', [cutoff]);
    return res.rowCount ?? 0;
  }
}

class PgSessionRepository implements SessionRepository {
  constructor(private readonly db: Queryable) {}

  async loadAll(): Promise<SessionRow[]> {
    const { rows } = await this.db.query('SELECT * FROM sessions');
    return rows.map((r: any) => ({
      sessionId: r.session_id,
      userId: r.user_id,
      tokenHash: r.token_hash,
      createdAt: toDate(r.created_at)!,
      lastSeenAt: toDate(r.last_seen_at)!,
    }));
  }

  async save(row: SessionRow): Promise<void> {
    await this.db.query(
      `INSERT INTO sessions (session_id, user_id, token_hash, created_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (session_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
      [row.sessionId, row.userId, row.tokenHash, row.createdAt, row.lastSeenAt]
    );
  }

  async remove(sessionId: string): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
  }
}

const iso = (value: unknown): string | undefined => toDate(value)?.toISOString();

class PgRefundRepository implements RefundRepository {
  constructor(private readonly db: Queryable) {}

  async loadAll(): Promise<RefundRow[]> {
    const { rows } = await this.db.query('SELECT * FROM refund_requests ORDER BY created_at ASC');
    return rows.map((r: any) => ({
      id: r.id,
      orderId: r.order_id,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      reason: r.reason,
      proposedBy: r.proposed_by,
      status: r.status,
      paypalRefundId: r.paypal_refund_id ?? undefined,
      paypalRefundStatus: r.paypal_refund_status ?? undefined,
      lastError: r.last_error ?? undefined,
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
      decidedAt: iso(r.decided_at),
    }));
  }

  async save(r: RefundRow): Promise<void> {
    // Only lifecycle columns change after creation; amount/order/reason are immutable.
    await this.db.query(
      `INSERT INTO refund_requests (
         id, order_id, amount_minor, currency, reason, proposed_by, status,
         paypal_refund_id, paypal_refund_status, last_error, created_at, updated_at, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         paypal_refund_id = EXCLUDED.paypal_refund_id,
         paypal_refund_status = EXCLUDED.paypal_refund_status,
         last_error = EXCLUDED.last_error,
         updated_at = EXCLUDED.updated_at,
         decided_at = EXCLUDED.decided_at`,
      [
        r.id, r.orderId, r.amountMinor, r.currency, r.reason, r.proposedBy, r.status,
        r.paypalRefundId ?? null, r.paypalRefundStatus ?? null, r.lastError ?? null,
        new Date(r.createdAt), new Date(r.updatedAt), r.decidedAt ? new Date(r.decidedAt) : null,
      ]
    );
  }
}

class PgPolicyEventRepository implements PolicyEventRepository {
  constructor(private readonly db: Queryable) {}

  async loadRecent(limit: number): Promise<any[]> {
    const { rows } = await this.db.query(
      'SELECT event FROM policy_events ORDER BY occurred_at DESC, id DESC LIMIT $1',
      [limit]
    );
    return rows.reverse().map((r: any) => parseJson<any>(r.event));
  }

  async save(event: { id: string; userId: string; timestamp: string }): Promise<void> {
    await this.db.query(
      `INSERT INTO policy_events (id, user_id, occurred_at, event)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.userId, new Date(event.timestamp), JSON.stringify(event)]
    );
  }
}

class PgWebhookEventRepository implements WebhookEventRepository {
  constructor(private readonly db: Queryable) {}

  async loadRecentIds(limit: number): Promise<string[]> {
    const { rows } = await this.db.query(
      'SELECT event_id FROM webhook_events ORDER BY processed_at DESC, event_id DESC LIMIT $1',
      [limit]
    );
    return rows.map((r: any) => String(r.event_id));
  }

  async save(eventId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO webhook_events (event_id, processed_at) VALUES ($1,$2)
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId, new Date()]
    );
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const res = await this.db.query('DELETE FROM webhook_events WHERE processed_at < $1', [cutoff]);
    return res.rowCount ?? 0;
  }
}

class PgWebhookReviewRepository implements WebhookReviewRepository {
  constructor(private readonly db: Queryable) {}

  async record(r: WebhookReviewRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO webhook_reviews
         (event_id, order_id, reason, expected_minor, expected_currency, reported_value, reported_currency,
          capture_status, capture_id, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        r.eventId,
        r.orderId,
        r.reason,
        r.expectedMinor,
        r.expectedCurrency,
        r.reportedValue ?? null,
        r.reportedCurrency ?? null,
        r.captureStatus ?? null,
        r.captureId ?? null,
        new Date(),
      ]
    );
  }

  async listForOrder(orderId: string): Promise<WebhookReviewRecord[]> {
    const { rows } = await this.db.query(
      'SELECT * FROM webhook_reviews WHERE order_id = $1 ORDER BY recorded_at DESC',
      [orderId]
    );
    return rows.map((x: any) => ({
      eventId: String(x.event_id),
      orderId: String(x.order_id),
      reason: x.reason,
      expectedMinor: Number(x.expected_minor),
      expectedCurrency: String(x.expected_currency),
      reportedValue: x.reported_value ?? undefined,
      reportedCurrency: x.reported_currency ?? undefined,
      captureStatus: x.capture_status ?? undefined,
      captureId: x.capture_id ?? undefined,
    }));
  }
}

class PgCaptureClaimRepository implements CaptureClaimRepository {
  constructor(private readonly db: Queryable) {}

  // One atomic statement: insert, or take over only a claim older than the TTL. RETURNING yields a row
  // only for the caller that won, so two instances (or ten concurrent requests) cannot both proceed.
  async tryClaim(orderId: string, ttlMs: number): Promise<boolean> {
    // Times are passed as parameters (not computed in SQL) so the statement is plain portable SQL.
    const now = new Date();
    const cutoff = new Date(now.getTime() - Math.max(1, Math.floor(ttlMs)));
    const res = await this.db.query(
      `INSERT INTO capture_claims (order_id, claimed_at) VALUES ($1, $2)
       ON CONFLICT (order_id) DO UPDATE SET claimed_at = $2
         WHERE capture_claims.claimed_at < $3
       RETURNING order_id`,
      [orderId, now, cutoff]
    );
    return (res.rowCount ?? res.rows.length) > 0;
  }

  async release(orderId: string): Promise<void> {
    await this.db.query('DELETE FROM capture_claims WHERE order_id = $1', [orderId]);
  }
}

function rowToGroup(row: any): BillGroup {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    currency: row.currency,
    totalMinor: Number(row.total_minor),
    strategy: row.strategy as SplitStrategy,
    createdByUserId: row.created_by_user_id,
    status: row.status as BillStatus,
    items: parseJson(row.items),
    shares: [],
    createdAt: toDate(row.created_at)!,
    updatedAt: toDate(row.updated_at)!,
  };
}

function rowToNonce(row: any): InviteNonceRow {
  return {
    nonce: row.nonce,
    billId: row.bill_id,
    status: row.status as 'PENDING' | 'CONSUMED',
    expiresAt: toDate(row.expires_at)!,
    createdAt: toDate(row.created_at)!,
    consumedAt: row.consumed_at ? toDate(row.consumed_at) : undefined,
  };
}

function rowToShare(row: any): BillShare & { billId: string } {
  const share: BillShare = {
    id: row.id,
    amountMinor: Number(row.amount_minor),
    status: row.status as ShareStatus,
  };
  if (row.participant_user_id) share.participantUserId = row.participant_user_id;
  if (row.order_id) share.orderId = row.order_id;
  if (row.paid_at) share.paidAt = toDate(row.paid_at);
  return { ...share, billId: row.bill_id };
}

interface TxClient extends Queryable {
  release(): void;
}
interface Connectable extends Queryable {
  connect(): Promise<TxClient>;
}

class PgBillRepository implements BillRepository {
  constructor(private readonly db: Queryable) {}

  private async withClient<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
    const client = await (this.db as unknown as Connectable).connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async loadAllGroups(): Promise<BillGroup[]> {
    const { rows } = await this.db.query('SELECT * FROM bill_groups ORDER BY created_at ASC');
    return rows.map(rowToGroup);
  }

  async getGroup(billId: string): Promise<BillGroup | undefined> {
    const g = await this.db.query('SELECT * FROM bill_groups WHERE id = $1', [billId]);
    if (g.rows.length === 0) return undefined;
    const group = rowToGroup(g.rows[0]);
    const s = await this.db.query('SELECT * FROM bill_shares WHERE bill_id = $1 ORDER BY id ASC', [billId]);
    group.shares = s.rows.map((r: any) => rowToShare(r));
    return group;
  }

  async loadAllShares(): Promise<(BillShare & { billId: string })[]> {
    const { rows } = await this.db.query('SELECT * FROM bill_shares ORDER BY id ASC');
    return rows.map(rowToShare);
  }

  async getShare(shareId: string): Promise<(BillShare & { billId: string }) | undefined> {
    const { rows } = await this.db.query('SELECT * FROM bill_shares WHERE id = $1', [shareId]);
    return rows[0] ? rowToShare(rows[0]) : undefined;
  }

  async loadAllNonces(): Promise<InviteNonceRow[]> {
    const { rows } = await this.db.query('SELECT * FROM bill_invite_nonces');
    return rows.map(rowToNonce);
  }

  async saveGroup(group: BillGroup): Promise<void> {
    await this.db.query(
      `INSERT INTO bill_groups (
         id, merchant_id, currency, total_minor, strategy, created_by_user_id, status, items, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        group.id,
        group.merchantId,
        group.currency,
        group.totalMinor,
        group.strategy,
        group.createdByUserId,
        group.status,
        JSON.stringify(group.items),
        group.createdAt,
        group.updatedAt,
      ]
    );
    for (const share of group.shares) {
      await this.saveShareRow(group.id, share);
    }
  }

  private async saveShareRow(billId: string, share: BillShare): Promise<void> {
    // The authoritative decision columns (participant_user_id, order_id, paid_at)
    // are written ONLY on the first insert (the share is created with them). On
    // conflict the snapshot is convergent: it may ONLY refresh the derived `status`
    // and `updated_at`. This is the guard that prevents a stale fire-and-forget
    // `writeQueue` snapshot (e.g. a share captured before a join/claim bound it)
    // from clobbering an atomic decision that the DB already holds.
    await this.db.query(
      `INSERT INTO bill_shares (
         id, bill_id, participant_user_id, amount_minor, status, order_id, paid_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        share.id,
        billId,
        share.participantUserId ?? null,
        share.amountMinor,
        share.status,
        share.orderId ?? null,
        share.paidAt ? new Date(share.paidAt) : null,
        new Date(),
        new Date(),
      ]
    );
  }

  async insertInviteNonce(row: InviteNonceRow): Promise<void> {
    await this.db.query(
      `INSERT INTO bill_invite_nonces (nonce, bill_id, status, expires_at, created_at, consumed_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (nonce) DO NOTHING`,
      [row.nonce, row.billId, row.status, row.expiresAt, row.createdAt, row.consumedAt ?? null]
    );
  }

  /**
   * Atomic per-share payment claim. The `bill_share_claims` mutex (PK on
   * `share_id`, `INSERT … ON CONFLICT (share_id) DO NOTHING RETURNING`) makes
   * exactly one of N concurrent callers the winner; the losers get no row and
   * MUST NOT create an order. Only the winner binds `order_id` on the share, so
   * claim-before-order guarantees a single order per share. The partial unique
   * index `bill_shares_order_uq` is a backstop against a double bind.
   *
   * NB: the binding uses `WHERE id = $1` (not `… AND order_id IS NULL`). The
   * mutex already guarantees a single winner, so an extra `IS NULL` guard is
   * redundant — and pg-mem cannot model `IS NULL` against stored NULLs, so the
   * winner path is kept emulator-verifiable.
   */
  async claimShareForPayment(shareId: string, orderId: string): Promise<boolean> {
    // Atomic per-share payment claim (mutex on the `bill_share_claims` PK). The
    // first INSERT wins; a concurrent/duplicate INSERT is a no-op (ON CONFLICT DO
    // NOTHING). We then read back the row we (may) own: we won iff the stored
    // `order_id` equals the one we attempted. This detection works on BOTH the
    // pg-mem emulator and real PostgreSQL — relying on `ON CONFLICT … RETURNING`
    // row counts is unsafe because pg-mem misreports them on conflict. Only the
    // winner binds the order to the share, guaranteeing a single order per share.
    await this.db.query(
      `INSERT INTO bill_share_claims (share_id, order_id, claimed_at) VALUES ($1, $2, now())
       ON CONFLICT (share_id) DO NOTHING`,
      [shareId, orderId]
    );
    const sel = await this.db.query(
      'SELECT order_id FROM bill_share_claims WHERE share_id = $1',
      [shareId]
    );
    if (sel.rows.length === 0 || sel.rows[0].order_id !== orderId) return false;
    // Winner-only: bind the order to the share. The mutex guarantees exactly one
    // winner, so this can never double-bind a settled share.
    const bind = await this.db.query(
      `UPDATE bill_shares SET order_id = $2, updated_at = now() WHERE id = $1 RETURNING id`,
      [shareId, orderId]
    );
    if (bind.rows.length === 0) {
      // Defensive: share row vanished between claim and bind. Release the dangling
      // claim so it does not block a retry.
      await this.db.query(
        'DELETE FROM bill_share_claims WHERE share_id = $1 AND order_id = $2',
        [shareId, orderId]
      );
      return false;
    }
    return true;
  }

  /**
   * Releases a failed claim so the share can be paid again. Only OUR claim (same
   * orderId) is released, so a concurrent winner's claim is never freed. Also
   * clears the orphaned `order_id` binding on the share so the share is retryable.
   */
  async releaseClaim(shareId: string, orderId: string): Promise<boolean> {
    const del = await this.db.query(
      'DELETE FROM bill_share_claims WHERE share_id = $1 AND order_id = $2 RETURNING share_id',
      [shareId, orderId]
    );
    const released = (del.rowCount ?? del.rows.length) > 0;
    if (released) {
      await this.db.query(
        'UPDATE bill_shares SET order_id = NULL, updated_at = now() WHERE id = $1 AND order_id = $2',
        [shareId, orderId]
      );
    }
    return released;
  }

  /**
   * Boot recovery: clears claims whose order row does not exist AND that are
   * older than the TTL (`claimed_at < now() - 5min`, computed in the app so the
   * statement is plain portable SQL). A claim set moments ago — the order row
   * merely not yet written by the claim-before-order flow — is NEVER cleared,
   * so an in-flight payment can never be double-claimed (the original orphan
   * bug). The orphaned `order_id` binding is cleared so the share becomes
   * retryable. Returns the number of cleared claims.
   */
  async reconcileOrphanClaims(): Promise<number> {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    // Load stale claims together with their (optional) backing order, then decide
    // IN APPLICATION CODE which are safe to release. This avoids relying on pg-mem's
    // `IS NULL` handling for stored columns while producing identical behavior on
    // real PostgreSQL.
    //
    // A claim is released ONLY when it is STALE (older than the TTL) AND one of:
    //   - no backing order row exists (crashed before the order was written); OR
    //   - the backing order is CART_READY with NO paypal_order_id — i.e. the order
    //     was created but PayPal checkout never started (crashed between the order
    //     save and the PayPal create).
    // EVERYTHING ELSE IS KEPT: a recent (in-flight) claim, or an order that has
    // actually progressed (PAYMENT_PENDING / PAID / etc., or a CART_READY that
    // already has a paypal_order_id) is an ACTIVE payment and must never be
    // released — doing so would let a second order / PayPal order be created for
    // the same share (double charge). The CART_READY-without-paypal case is
    // TTL-gated precisely so a merely in-flight checkout is never mistaken for an
    // abandoned one.
    const { rows } = await this.db.query(
      `SELECT c.share_id, c.order_id,
              o.status AS o_status, o.paypal_order_id AS o_paypal
       FROM bill_share_claims c
       LEFT JOIN orders o ON o.id = c.order_id
       WHERE c.claimed_at < $1`,
      [cutoff]
    );
    let cleared = 0;
    for (const r of rows) {
      const noOrder = r.o_status == null;
      const abandonedCartReady =
        r.o_status === 'CART_READY' && (r.o_paypal == null || r.o_paypal === '');
      if (!noOrder && !abandonedCartReady) continue; // active / in-flight → keep

      // Releasing a share is a COMPOUND mutation that MUST be atomic:
      //   (a) delete the orphan claim,
      //   (b) unbind the share (order_id = NULL) so it is retryable, and
      //   (c) when the backing order is an abandoned CART_READY, cancel that
      //       order so it can never be captured (it was never paid).
      // If these ran as separate auto-committed statements, a crash between
      // them would leave a TORN STATE — e.g. the claim gone but the order still
      // CART_READY and retryable → a second PayPal order could be created for
      // the same share (double charge). They are therefore wrapped in ONE
      // PostgreSQL transaction: they commit together or roll back together.
      //
      // The candidate scan above is a plain read-only SELECT; identifying what
      // to release is idempotent, so a crash before a candidate is processed is
      // simply retried on the next boot. The mutations themselves are
      // idempotent too, so two reconcilers (e.g. two instances booting) cannot
      // double-release the same share even without a row lock.
      await this.withClient(async (client) => {
        await client.query('BEGIN');
        try {
          await client.query(
            'DELETE FROM bill_share_claims WHERE share_id = $1 AND order_id = $2',
            [r.share_id, r.order_id]
          );
          await client.query(
            'UPDATE bill_shares SET order_id = NULL, updated_at = now() WHERE id = $1 AND order_id = $2',
            [r.share_id, r.order_id]
          );
          if (abandonedCartReady) {
            // Cancel the orphaned CART_READY order (never paid) so it can never
            // be captured. The unique index backstops any later order for share.
            await client.query(
              "UPDATE orders SET status = 'ORDER_CANCELLED', updated_at = now() WHERE id = $1 AND status = 'CART_READY'",
              [r.order_id]
            );
          }
          await client.query('COMMIT');
          cleared++;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        }
      });
    }
    return cleared;
  }

  async joinBill(opts: { billId: string; nonce: string; userId: string }): Promise<BillJoinResult> {
    return this.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        // Serialize all joins for this bill: only one join transaction advances at a time.
        const g = await client.query('SELECT id FROM bill_groups WHERE id = $1 FOR UPDATE', [opts.billId]);
        if (g.rowCount === 0) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'BILL_NOT_FOUND' };
        }
        // Atomic single-use consumption of the nonce.
        const n = await client.query(
          `UPDATE bill_invite_nonces SET status = 'CONSUMED', consumed_at = now()
           WHERE nonce = $1 AND status = 'PENDING' AND expires_at > now()
           RETURNING nonce`,
          [opts.nonce]
        );
        if ((n.rowCount ?? 0) === 0) {
          const chk = await client.query('SELECT status FROM bill_invite_nonces WHERE nonce = $1', [opts.nonce]);
          await client.query('ROLLBACK');
          if (chk.rows.length > 0 && chk.rows[0].status === 'CONSUMED') {
            return { ok: false, reason: 'ALREADY_USED' };
          }
          return { ok: false, reason: 'INVALID_OR_EXPIRED' };
        }
        const dup = await client.query(
          'SELECT 1 FROM bill_shares WHERE bill_id = $1 AND participant_user_id = $2 LIMIT 1',
          [opts.billId, opts.userId]
        );
        if ((dup.rowCount ?? 0) > 0) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'ALREADY_PARTICIPANT' };
        }
        // Bind the first open slot atomically.
        const b = await client.query(
          `UPDATE bill_shares SET participant_user_id = $2, updated_at = now()
           WHERE id = (SELECT id FROM bill_shares
                       WHERE bill_id = $1 AND participant_user_id IS NULL AND status = 'PENDING'
                       ORDER BY id LIMIT 1)
             AND participant_user_id IS NULL
           RETURNING id`,
          [opts.billId, opts.userId]
        );
        if ((b.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'FULL' };
        }
        await client.query('COMMIT');
        return { ok: true, shareId: b.rows[0].id };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    });
  }
}

const toSlot = (r: any): PickupSlotRow => ({
  id: r.id,
  day: String(r.day),
  startTs: toDate(r.start_ts)!,
  endTs: toDate(r.end_ts)!,
  capacity: Number(r.capacity),
  reservedCount: Number(r.reserved_count),
  version: Number(r.version),
  createdAt: toDate(r.created_at)!,
  updatedAt: toDate(r.updated_at)!,
});

const toBooking = (r: any): PickupBookingRow => ({
  id: r.id,
  slotId: r.slot_id,
  orderId: r.order_id ?? undefined,
  sessionId: r.session_id,
  status: r.status as PickupBookingStatus,
  createdAt: toDate(r.created_at)!,
  updatedAt: toDate(r.updated_at)!,
  expiresAt: toDate(r.expires_at)!,
});

class PgPickupRepository implements PickupRepository {
  constructor(private readonly db: Queryable) {}

  private async withClient<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
    const client = await (this.db as unknown as Connectable).connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async createSlot(row: PickupSlotRow): Promise<void> {
    await this.db.query(
      `INSERT INTO pickup_slots (id, day, start_ts, end_ts, capacity, reserved_count, version, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        row.day,
        row.startTs,
        row.endTs,
        row.capacity,
        row.reservedCount,
        row.version,
        row.createdAt,
        row.updatedAt,
      ]
    );
  }

  async getSlot(slotId: string): Promise<PickupSlotRow | undefined> {
    const { rows } = await this.db.query(`SELECT * FROM pickup_slots WHERE id = $1`, [slotId]);
    return rows.length ? toSlot(rows[0]) : undefined;
  }

  async getAvailability(day: string): Promise<PickupSlotRow[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM pickup_slots WHERE day = $1 ORDER BY start_ts ASC`,
      [day]
    );
    return rows.map(toSlot);
  }

  async getMerchantPlan(): Promise<{ slot: PickupSlotRow; bookings: PickupBookingRow[] }[]> {
    const slots = (await this.db.query(`SELECT * FROM pickup_slots ORDER BY start_ts ASC`)).rows.map(toSlot);
    const bookings = (await this.db.query(`SELECT * FROM pickup_bookings ORDER BY created_at ASC`)).rows.map(
      toBooking
    );
    return slots.map((slot) => ({
      slot,
      bookings: bookings.filter((b) => b.slotId === slot.id),
    }));
  }

  async reserve(input: PickupReserveInput): Promise<'OK' | 'FULL' | 'SLOT_NOT_FOUND' | 'ALREADY_HELD'> {
    // The one-active-HELD-per-session invariant is enforced by the partial
    // unique index `pickup_bookings_one_held_per_session_uq` (migration 009),
    // NOT by a client-side read. Two concurrent reserves for the same session
    // therefore cannot both succeed: the second INSERT raises a unique_violation
    // (pg code 23505) inside its transaction and is mapped to ALREADY_HELD.
    return this.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const slot = await client.query(
          'SELECT id, capacity, reserved_count FROM pickup_slots WHERE id = $1 FOR UPDATE',
          [input.slotId]
        );
        if (slot.rows.length === 0) {
          await client.query('ROLLBACK');
          return 'SLOT_NOT_FOUND' as const;
        }
        const { capacity, reserved_count } = slot.rows[0];
        if (reserved_count >= capacity) {
          await client.query('ROLLBACK');
          return 'FULL' as const;
        }
        await client.query(
          'UPDATE pickup_slots SET reserved_count = reserved_count + 1, version = version + 1, updated_at = now() WHERE id = $1',
          [input.slotId]
        );
        try {
          await client.query(
            `INSERT INTO pickup_bookings (id, slot_id, order_id, session_id, status, created_at, updated_at, expires_at)
             VALUES ($1,$2,NULL,$3,'HELD',now(),now(),$4)`,
            [input.bookingId, input.slotId, input.sessionId, input.expiresAt]
          );
        } catch (insertErr) {
          // unique_violation (pg code 23505): this session already holds a HELD
          // booking → roll back (freeing the capacity increment) and report it.
          if ((insertErr as any)?.code === '23505') {
            await client.query('ROLLBACK').catch(() => undefined);
            return 'ALREADY_HELD' as const;
          }
          throw insertErr;
        }
        await client.query('COMMIT');
        return 'OK' as const;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    });
  }

  async release(input: { bookingId: string; sessionId: string }): Promise<
    'RELEASED' | 'ALREADY_RELEASED' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFIRMED'
  > {
    return this.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const b = await client.query(
          'SELECT id, slot_id, session_id, status FROM pickup_bookings WHERE id = $1 FOR UPDATE',
          [input.bookingId]
        );
        if (b.rows.length === 0) {
          await client.query('ROLLBACK');
          return 'NOT_FOUND' as const;
        }
        const row = b.rows[0];
        if (row.session_id !== input.sessionId) {
          await client.query('ROLLBACK');
          return 'FORBIDDEN' as const;
        }
        if (row.status === 'RELEASED') {
          await client.query('ROLLBACK');
          return 'ALREADY_RELEASED' as const;
        }
        if (row.status === 'CONFIRMED') {
          // A paid booking's capacity is legitimately taken; never free it.
          await client.query('ROLLBACK');
          return 'CONFIRMED' as const;
        }
        // HELD → RELEASED: free exactly one capacity unit (idempotent: a second call sees RELEASED).
        await client.query(
          "UPDATE pickup_bookings SET status = 'RELEASED', updated_at = now() WHERE id = $1",
          [input.bookingId]
        );
        await client.query(
          'UPDATE pickup_slots SET reserved_count = GREATEST(reserved_count - 1, 0), version = version + 1, updated_at = now() WHERE id = $1',
          [row.slot_id]
        );
        await client.query('COMMIT');
        return 'RELEASED' as const;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    });
  }

  async link(input: { bookingId: string; orderId: string; sessionId: string }): Promise<
    'OK' | 'CONFIRMED' | 'NOT_FOUND' | 'FORBIDDEN' | 'MISMATCH'
  > {
    return this.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const b = await client.query(
          'SELECT id, session_id, status FROM pickup_bookings WHERE id = $1 FOR UPDATE',
          [input.bookingId]
        );
        if (b.rows.length === 0) {
          await client.query('ROLLBACK');
          return 'NOT_FOUND' as const;
        }
        const row = b.rows[0];
        if (row.session_id !== input.sessionId) {
          await client.query('ROLLBACK');
          return 'FORBIDDEN' as const;
        }
        if (row.status !== 'HELD') {
          // Already CONFIRMED (paid) or RELEASED: cannot re-link.
          await client.query('ROLLBACK');
          return 'MISMATCH' as const;
        }
        const o = await client.query('SELECT session_id, status FROM orders WHERE id = $1', [input.orderId]);
        if (o.rows.length === 0) {
          await client.query('ROLLBACK');
          return 'NOT_FOUND' as const;
        }
        if (o.rows[0].session_id !== input.sessionId) {
          await client.query('ROLLBACK');
          return 'FORBIDDEN' as const;
        }
        await client.query(
          'UPDATE pickup_bookings SET order_id = $2, updated_at = now() WHERE id = $1',
          [input.bookingId, input.orderId]
        );
        // If the order was already paid by the time it is linked, confirm now.
        if (o.rows[0].status === 'PAID' || o.rows[0].status === 'ORDER_CONFIRMED') {
          await client.query(
            "UPDATE pickup_bookings SET status = 'CONFIRMED', updated_at = now() WHERE id = $1",
            [input.bookingId]
          );
          await client.query('COMMIT');
          return 'CONFIRMED' as const;
        }
        await client.query('COMMIT');
        return 'OK' as const;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    });
  }

  /**
   * Idempotent reconciliation. Per candidate it locks the booking and performs a
   * single atomic transition; a crash mid-sweep leaves the record and the
   * capacity counter consistent (the next run re-processes it). The capacity
   * counter is decremented ONLY on the HELD → RELEASED edge, never on CONFIRMED,
   * so re-runs never double-decrement.
   */
  async reconcile(): Promise<PickupReconcileSummary> {
    const summary: PickupReconcileSummary = {
      examined: 0,
      confirmed: 0,
      released: 0,
      kept: 0,
      errors: 0,
    };
    const { rows } = await this.db.query(
      `SELECT b.id, b.order_id, b.expires_at, o.status AS o_status
       FROM pickup_bookings b
       LEFT JOIN orders o ON o.id = b.order_id
       WHERE b.status = 'HELD'`
    );
    const now = Date.now();
    for (const r of rows) {
      summary.examined++;
      let target: PickupBookingStatus | null = null;
      if (!r.order_id) {
        // UNLINKED: no order was ever created → definitively nothing could be paid.
        // This is a cleanup of a never-started checkout, NOT a payment decision.
        if (new Date(r.expires_at).getTime() < now) target = 'RELEASED';
      } else if (r.o_status === 'PAID' || r.o_status === 'ORDER_CONFIRMED') {
        target = 'CONFIRMED';
      } else if (r.o_status === 'PAYMENT_FAILED' || r.o_status === 'ORDER_CANCELLED') {
        target = 'RELEASED';
      } else {
        // CART_READY / AWAITING_CONFIRMATION / PAYMENT_PENDING / unknown / NULL → ambiguous: KEEP.
        target = null;
      }
      if (!target) {
        summary.kept++;
        continue;
      }
      try {
        await this.withClient(async (client) => {
          await client.query('BEGIN');
          try {
            const transitioned = await this.transition(client, r.id, target!);
            await client.query('COMMIT');
            if (transitioned) {
              if (target === 'CONFIRMED') summary.confirmed++;
              else summary.released++;
            }
          } catch (err) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw err;
          }
        });
      } catch {
        summary.errors++;
        summary.kept++;
      }
    }
    return summary;
  }

  /** Locks the booking and performs HELD → target atomically. Re-runnable: returns false if already there. */
  private async transition(client: TxClient, bookingId: string, target: PickupBookingStatus): Promise<boolean> {
    const b = await client.query(
      'SELECT slot_id, status FROM pickup_bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    );
    if (b.rows.length === 0) return false;
    const { slot_id, status } = b.rows[0];
    if (status === target) return false; // already in the desired state
    if (target === 'RELEASED' && status !== 'HELD') return false; // never free a CONFIRMED/RELEASED slot
    if (target === 'CONFIRMED' && status !== 'HELD') return false;
    await client.query(
      'UPDATE pickup_bookings SET status = $2, updated_at = now() WHERE id = $1',
      [bookingId, target]
    );
    if (target === 'RELEASED') {
      await client.query(
        'UPDATE pickup_slots SET reserved_count = GREATEST(reserved_count - 1, 0), version = version + 1, updated_at = now() WHERE id = $1',
        [slot_id]
      );
    }
    return true;
  }
}

export function createPgRepositories(db: Queryable, close: () => Promise<void>): Repositories {
  return {
    mode: 'postgres',
    orders: new PgOrderRepository(db),
    reservations: new PgReservationRepository(db),
    idempotency: new PgIdempotencyRepository(db),
    sessions: new PgSessionRepository(db),
    refunds: new PgRefundRepository(db),
    policyEvents: new PgPolicyEventRepository(db),
    webhookEvents: new PgWebhookEventRepository(db),
    webhookReviews: new PgWebhookReviewRepository(db),
    captureClaims: new PgCaptureClaimRepository(db),
    bills: new PgBillRepository(db),
    pickup: new PgPickupRepository(db),
    ping: async () => {
      await db.query('SELECT 1');
    },
    close,
  };
}

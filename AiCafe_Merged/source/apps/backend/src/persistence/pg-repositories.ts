import { Order, OrderOrigin, OrderStatus } from '../orders/domain';
import { BillGroup, BillShare, BillStatus, ShareStatus, SplitStrategy } from '../bills/domain';
import { randomUUID } from 'crypto';
import { PurchasePolicy } from '../policy/domain';
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
  RefundAuditRow,
  DisputeRepository,
  DisputeCaseRow,
  DisputeCaseStatus,
  DisputeAuditRow,
  ReservationRepository,
  ReservationRow,
  SessionRepository,
  SessionRow,
  StoredSpendingMandate,
  SpendingMandateEvent,
  SpendingMandateRepository,
  BillMandateReservationRow,
  BillMandateResult,
  ReservationResult,
  MandateBlockReason,
  MandateEventsRepo,
} from './types';

const toDate = (value: unknown): Date | undefined =>
  value === null || value === undefined ? undefined : value instanceof Date ? value : new Date(value as string);

const parseJson = <T>(value: unknown): T =>
  (typeof value === 'string' ? JSON.parse(value) : value) as T;

function rowToPolicy(row: any): PurchasePolicy {
  const policy = parseJson<PurchasePolicy>(row.policy);
  return {
    ...policy,
    validUntil: policy.validUntil ? new Date(policy.validUntil) : undefined,
    createdAt: new Date(policy.createdAt),
    updatedAt: new Date(policy.updatedAt),
  };
}

function policySnapshot(policy: PurchasePolicy): Record<string, unknown> {
  return {
    enabled: policy.enabled,
    currency: policy.currency,
    maxPerPurchaseMinor: policy.maxPerPurchaseMinor,
    dailySpendLimitMinor: policy.dailySpendLimitMinor,
    confirmationThresholdMinor: policy.confirmationThresholdMinor,
    allowedMerchantIds: policy.allowedMerchantIds,
    blockedCategoryIds: policy.blockedCategoryIds,
    validUntil: policy.validUntil?.toISOString() ?? null,
    revision: (policy as PurchasePolicy & { revision?: number }).revision ?? null,
  };
}

async function withTransaction<T>(db: Queryable, operation: (client: TxClient) => Promise<T>): Promise<T> {
  const client = await (db as unknown as Connectable).connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* retain the original failure */ }
    throw error;
  } finally {
    client.release();
  }
}

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

class PgSpendingMandateRepository implements SpendingMandateRepository {
  constructor(private readonly db: Queryable) {}

  async getOrCreate(policy: PurchasePolicy): Promise<StoredSpendingMandate> {
    return withTransaction(this.db, async (client) => {
      const now = new Date();
      const { rows: inserted } = await client.query(
        `INSERT INTO spending_mandates (user_id, revision, policy, created_at, updated_at)
         VALUES ($1, 1, $2, $3, $3) ON CONFLICT (user_id) DO NOTHING RETURNING user_id`,
        [policy.userId, JSON.stringify(policy), now]
      );
      const { rows } = await client.query(
        'SELECT user_id, revision, policy FROM spending_mandates WHERE user_id = $1 FOR UPDATE',
        [policy.userId]
      );
      if (!rows[0]) throw new Error('Unable to load the spending mandate.');
      if (inserted.length) {
        await client.query(
          `INSERT INTO spending_mandate_events
             (id, user_id, event_type, revision, after_snapshot, occurred_at)
           VALUES ($1,$2,'CREATED',1,$3,$4) ON CONFLICT (id) DO NOTHING`,
          [randomUUID(), policy.userId, JSON.stringify(policySnapshot(policy)), now]
        );
      }
      return { policy: rowToPolicy(rows[0]), revision: Number(rows[0].revision) };
    });
  }

  async loadAll(): Promise<StoredSpendingMandate[]> {
    const { rows } = await this.db.query('SELECT revision, policy FROM spending_mandates ORDER BY user_id');
    return rows.map((row: any) => ({ policy: rowToPolicy(row), revision: Number(row.revision) }));
  }

  async getLastEvent(userId: string): Promise<SpendingMandateEvent | undefined> {
    const { rows } = await this.db.query(
      `SELECT * FROM spending_mandate_events WHERE user_id = $1
       ORDER BY occurred_at DESC, id DESC LIMIT 1`, [userId]
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id ?? undefined,
      eventType: row.event_type,
      revision: Number(row.revision),
      amountMinor: row.amount_minor == null ? undefined : Number(row.amount_minor),
      currency: row.currency ?? undefined,
      subjectId: row.subject_id ?? undefined,
      beforeSnapshot: row.before_snapshot ? parseJson(row.before_snapshot) : undefined,
      afterSnapshot: parseJson(row.after_snapshot),
      occurredAt: new Date(row.occurred_at),
    };
  }

  async update(input: {
    policy: PurchasePolicy;
    expectedRevision: number;
    sessionId: string;
    eventId: string;
    eventType: 'UPDATED' | 'BILL_REAUTHORIZED';
  }): Promise<StoredSpendingMandate | undefined> {
    return withTransaction(this.db, async (client) => {
      const { rows } = await client.query(
        'SELECT revision, policy FROM spending_mandates WHERE user_id = $1 FOR UPDATE',
        [input.policy.userId]
      );
      if (!rows[0] || Number(rows[0].revision) !== input.expectedRevision) return undefined;
      const previous = rowToPolicy(rows[0]);
      const revision = input.expectedRevision + 1;
      const policy = { ...input.policy, updatedAt: new Date() };
      await client.query(
        `UPDATE spending_mandates SET revision = $2, policy = $3, updated_at = $4 WHERE user_id = $1`,
        [policy.userId, revision, JSON.stringify(policy), policy.updatedAt]
      );
      await client.query(
        `INSERT INTO spending_mandate_events
           (id, user_id, session_id, event_type, revision, before_snapshot, after_snapshot, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [input.eventId, policy.userId, input.sessionId, input.eventType, revision,
          JSON.stringify(policySnapshot(previous)), JSON.stringify(policySnapshot(policy)), policy.updatedAt]
      );
      return { policy, revision };
    });
  }
}

class PgReservationRepository implements ReservationRepository {
  constructor(private readonly db: Queryable, private readonly pgmem = false) {}

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
      mandateRevision: r.mandate_revision == null ? undefined : Number(r.mandate_revision),
      billMandateReservationId: r.bill_mandate_reservation_id ?? undefined,
    }));
  }

  async save(row: ReservationRow): Promise<void> {
    await this.db.query(
      `INSERT INTO spend_reservations
         (id, user_id, amount_minor, state, created_at, settled_at, mandate_revision, bill_mandate_reservation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, settled_at = EXCLUDED.settled_at,
         mandate_revision = COALESCE(EXCLUDED.mandate_revision, spend_reservations.mandate_revision),
         bill_mandate_reservation_id = COALESCE(EXCLUDED.bill_mandate_reservation_id, spend_reservations.bill_mandate_reservation_id)`,
      [row.id, row.userId, row.amountMinor, row.state, row.createdAt, row.settledAt ?? null,
        row.mandateRevision ?? null, row.billMandateReservationId ?? null]
    );
  }

  async reserveWithinMandate(input: {
    id: string; userId: string; amountMinor: number; currency: string; merchantId: string;
    mandateRevision: number; billMandateReservationId?: string; createdAt: Date;
  }): Promise<ReservationResult> {
    return withTransaction(this.db, async (client) => {
      // Read the linked bill owner first, then lock both involved mandates in a
      // stable order. This keeps participant checkout atomic with owner mandate
      // edits without introducing a lock-order cycle across instances.
      let billOwnerId: string | undefined;
      if (input.billMandateReservationId) {
        const { rows } = await client.query(
          'SELECT owner_user_id FROM bill_mandate_reservations WHERE id = $1',
          [input.billMandateReservationId]
        );
        billOwnerId = rows[0]?.owner_user_id;
        if (!billOwnerId) return { ok: false, reason: 'BILL_MANDATE_RENEWAL_REQUIRED' };
      }
      const userIds = [...new Set([input.userId, ...(billOwnerId ? [billOwnerId] : [])])].sort();
      // pg-mem compatibility (emulator-only): the emulator evaluates
      // `user_id = ANY($1::text[])` with an ARRAY parameter as zero rows, which
      // would make every payer look like its mandate vanished (false
      // MANDATE_CHANGED). `IN ($1,$2)` is also mis-evaluated (duplicates rows),
      // but the OR form is correct. `userIds` has at most two entries (payer +
      // optional bill owner). Production keeps the array form verbatim; the
      // `FOR UPDATE` lock is preserved on both paths.
      const mandateQuery = this.pgmem
        ? `SELECT user_id, revision, policy FROM spending_mandates
            WHERE (user_id = $1 OR user_id = $2) ORDER BY user_id FOR UPDATE`
        : `SELECT user_id, revision, policy FROM spending_mandates
            WHERE user_id = ANY($1::text[]) ORDER BY user_id FOR UPDATE`;
      const mandateParams = this.pgmem
        ? [userIds[0], userIds[1] ?? userIds[0]]
        : [userIds];
      const { rows: mandateRows } = await client.query(mandateQuery, mandateParams);
      const mandateByUser = new Map(mandateRows.map((row: any) => [row.user_id, row]));
      const payerMandate = mandateByUser.get(input.userId);
      if (!payerMandate || Number(payerMandate.revision) !== input.mandateRevision) {
        return { ok: false, reason: 'MANDATE_CHANGED' };
      }
      const policy = rowToPolicy(payerMandate);
      const now = input.createdAt;
      if (policy.validUntil && policy.validUntil.getTime() <= now.getTime()) return { ok: false, reason: 'ALLOWANCE_EXPIRED' };
      if (policy.enabled && input.amountMinor > policy.maxPerPurchaseMinor) return { ok: false, reason: 'MAX_PURCHASE_EXCEEDED' };
      if (policy.enabled && input.currency !== policy.currency) return { ok: false, reason: 'CURRENCY_MISMATCH' };
      if (policy.enabled && policy.allowedMerchantIds.length > 0 && !policy.allowedMerchantIds.includes(input.merchantId)) {
        return { ok: false, reason: 'MERCHANT_NOT_ALLOWED' };
      }

      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      // pg-mem compatibility (emulator-only): the emulator cannot resolve the
      // OUTER `r.bill_mandate_reservation_id` inside a correlated NOT EXISTS, so
      // the aggregate is computed in application code there. Production keeps the
      // single-statement aggregate verbatim.
      let spendTotals: { pendingMinor: number; spentMinor: number };
      if (this.pgmem) {
        spendTotals = await this.pgmemSpendTotals(client, input.userId, dayStart);
      } else {
        const { rows: spendRows } = await client.query(
          `SELECT
             COALESCE(SUM(CASE WHEN r.state = 'PENDING' THEN r.amount_minor ELSE 0 END), 0) AS pending_minor,
             COALESCE(SUM(CASE WHEN r.state = 'CONFIRMED' AND r.settled_at >= $2 THEN r.amount_minor ELSE 0 END), 0) AS spent_minor
           FROM spend_reservations r
           WHERE r.user_id = $1
             AND (r.state = 'PENDING' OR (r.state = 'CONFIRMED' AND r.settled_at >= $2))
             AND NOT EXISTS (
               SELECT 1 FROM bill_mandate_reservations h
                WHERE h.id = r.bill_mandate_reservation_id AND h.owner_user_id = $1 AND h.status = 'ACTIVE'
             )`, [input.userId, dayStart]
        );
        spendTotals = {
          pendingMinor: Number(spendRows[0]?.pending_minor ?? 0),
          spentMinor: Number(spendRows[0]?.spent_minor ?? 0),
        };
      }
      const { rows: holdRows } = await client.query(
        `SELECT COALESCE(SUM(amount_minor), 0) AS held_minor FROM bill_mandate_reservations
          WHERE owner_user_id = $1 AND status = 'ACTIVE'`,
        [input.userId]
      );

      let amountToAdd = input.amountMinor;
      if (input.billMandateReservationId) {
        const { rows: billRows } = await client.query(
          `SELECT h.*, b.total_minor AS group_total_minor, b.currency AS group_currency,
                  b.merchant_id AS group_merchant_id
             FROM bill_mandate_reservations h
             JOIN bill_groups b ON b.id = h.bill_id
            WHERE h.id = $1 AND h.status = 'ACTIVE'
            ${this.pgmem ? 'FOR UPDATE' : 'FOR UPDATE OF h, b'}`, [input.billMandateReservationId]
        );
        if (!billRows[0]) return { ok: false, reason: 'BILL_MANDATE_RENEWAL_REQUIRED' };
        const hold = rowToBillMandateReservation(billRows[0]);
        const ownerMandate = mandateByUser.get(hold.ownerUserId);
        if (!ownerMandate || Number(ownerMandate.revision) !== hold.mandateRevision ||
            Number(billRows[0].group_total_minor) !== hold.amountMinor ||
            billRows[0].group_currency !== hold.currency || billRows[0].group_merchant_id !== hold.merchantId ||
            !!billMandateViolation(rowToPolicy(ownerMandate), hold.amountMinor, hold.currency, hold.merchantId, now)) {
          return { ok: false, reason: 'BILL_MANDATE_RENEWAL_REQUIRED' };
        }
        // The full cart reservation already covers the creator's share. The
        // payment reservation remains attached to its order, but is not counted
        // a second time against the creator's daily mandate capacity.
        if (billRows[0].owner_user_id === input.userId) amountToAdd = 0;
      }
      const spent = spendTotals.spentMinor;
      const pending = spendTotals.pendingMinor;
      const held = Number(holdRows[0]?.held_minor ?? 0);
      if (spent + pending + held + amountToAdd > policy.dailySpendLimitMinor) {
        return { ok: false, reason: 'DAILY_LIMIT_EXCEEDED' };
      }

      const reservation: ReservationRow = {
        id: input.id, userId: input.userId, amountMinor: input.amountMinor,
        state: 'PENDING', createdAt: input.createdAt, mandateRevision: input.mandateRevision,
        billMandateReservationId: input.billMandateReservationId,
      };
      await client.query(
        `INSERT INTO spend_reservations
           (id,user_id,amount_minor,state,created_at,mandate_revision,bill_mandate_reservation_id)
         VALUES ($1,$2,$3,'PENDING',$4,$5,$6)`,
        [reservation.id, reservation.userId, reservation.amountMinor, reservation.createdAt,
          reservation.mandateRevision, reservation.billMandateReservationId ?? null]
      );
      return { ok: true, reservation };
    });
  }

  /**
   * pg-mem-only equivalent of the spend aggregate below. The emulator cannot
   * resolve the OUTER `r.bill_mandate_reservation_id` inside a correlated
   * NOT EXISTS, so we load the ACTIVE bill holds owned by the user and the
   * candidate reservations separately, then exclude/sum in application code.
   * Produces the SAME pending/spent totals as the production aggregate.
   */
  private async pgmemSpendTotals(
    client: Queryable, userId: string, dayStart: Date
  ): Promise<{ pendingMinor: number; spentMinor: number }> {
    const { rows: holds } = await client.query(
      `SELECT id FROM bill_mandate_reservations WHERE owner_user_id = $1 AND status = 'ACTIVE'`,
      [userId]
    );
    const activeHoldIds = new Set(holds.map((h: any) => h.id));
    const { rows } = await client.query(
      `SELECT amount_minor, state, settled_at, bill_mandate_reservation_id
         FROM spend_reservations
        WHERE user_id = $1 AND (state = 'PENDING' OR (state = 'CONFIRMED' AND settled_at >= $2))`,
      [userId, dayStart]
    );
    let pendingMinor = 0;
    let spentMinor = 0;
    for (const r of rows) {
      if (r.bill_mandate_reservation_id && activeHoldIds.has(r.bill_mandate_reservation_id)) continue;
      if (r.state === 'PENDING') pendingMinor += Number(r.amount_minor);
      else if (r.state === 'CONFIRMED') spentMinor += Number(r.amount_minor);
    }
    return { pendingMinor, spentMinor };
  }

  async getDailyUsage(userId: string, dayStart: Date): Promise<{ spentMinor: number; pendingMinor: number; billReservedMinor: number }> {
    let spendTotals: { pendingMinor: number; spentMinor: number };
    if (this.pgmem) {
      spendTotals = await this.pgmemSpendTotals(this.db, userId, dayStart);
    } else {
      const { rows: spendRows } = await this.db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN r.state = 'PENDING' THEN r.amount_minor ELSE 0 END), 0) AS pending_minor,
           COALESCE(SUM(CASE WHEN r.state = 'CONFIRMED' AND r.settled_at >= $2 THEN r.amount_minor ELSE 0 END), 0) AS spent_minor
         FROM spend_reservations r
         WHERE r.user_id = $1
           AND (r.state = 'PENDING' OR (r.state = 'CONFIRMED' AND r.settled_at >= $2))
           AND NOT EXISTS (
             SELECT 1 FROM bill_mandate_reservations h
              WHERE h.id = r.bill_mandate_reservation_id AND h.owner_user_id = $1 AND h.status = 'ACTIVE'
           )`, [userId, dayStart]
      );
      spendTotals = {
        pendingMinor: Number(spendRows[0]?.pending_minor ?? 0),
        spentMinor: Number(spendRows[0]?.spent_minor ?? 0),
      };
    }
    const { rows: holdRows } = await this.db.query(
      `SELECT COALESCE(SUM(amount_minor), 0) AS held_minor FROM bill_mandate_reservations
        WHERE owner_user_id = $1 AND status = 'ACTIVE'`, [userId]
    );
    return {
      spentMinor: spendTotals.spentMinor,
      pendingMinor: spendTotals.pendingMinor,
      billReservedMinor: Number(holdRows[0]?.held_minor ?? 0),
    };
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
      wellbeingPreferences: r.wellbeing_preferences ? parseJson(r.wellbeing_preferences) : undefined,
    }));
  }

  async save(row: SessionRow): Promise<void> {
    await this.db.query(
      `INSERT INTO sessions (session_id, user_id, token_hash, created_at, last_seen_at, wellbeing_preferences)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (session_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at,
         wellbeing_preferences = COALESCE(EXCLUDED.wellbeing_preferences, sessions.wellbeing_preferences)`,
      [row.sessionId, row.userId, row.tokenHash, row.createdAt, row.lastSeenAt, row.wellbeingPreferences ? JSON.stringify(row.wellbeingPreferences) : null]
    );
  }

  async remove(sessionId: string): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
  }
}

const iso = (value: unknown): string | undefined => toDate(value)?.toISOString();

class PgRefundRepository implements RefundRepository {
  constructor(private readonly db: Queryable, private readonly pgmem = false) {}

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
      aiRecommendation: r.ai_recommendation ? parseJson(r.ai_recommendation) : undefined,
      merchantApprovedAt: iso(r.merchant_approved_at),
      merchantApprovedBy: r.merchant_approved_by ?? undefined,
      idempotencyKeyHash: r.idempotency_key_hash ?? undefined,
      idempotencyFingerprint: r.idempotency_fingerprint ?? undefined,
      lastError: r.last_error ?? undefined,
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
      decidedAt: iso(r.decided_at),
    }));
  }

  async getByIdempotencyHash(hash: string): Promise<RefundRow | undefined> {
    const { rows } = await this.db.query('SELECT * FROM refund_requests WHERE idempotency_key_hash = $1', [hash]);
    if (!rows[0]) return undefined;
    const r = rows[0];
    return {
      id: r.id, orderId: r.order_id, amountMinor: Number(r.amount_minor), currency: r.currency,
      reason: r.reason, proposedBy: r.proposed_by, status: r.status,
      paypalRefundId: r.paypal_refund_id ?? undefined, paypalRefundStatus: r.paypal_refund_status ?? undefined,
      aiRecommendation: r.ai_recommendation ? parseJson(r.ai_recommendation) : undefined,
      merchantApprovedAt: iso(r.merchant_approved_at), merchantApprovedBy: r.merchant_approved_by ?? undefined,
      idempotencyKeyHash: r.idempotency_key_hash ?? undefined, lastError: r.last_error ?? undefined,
      idempotencyFingerprint: r.idempotency_fingerprint ?? undefined,
      createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!, decidedAt: iso(r.decided_at),
    };
  }

  async save(r: RefundRow): Promise<void> {
    // Only lifecycle columns change after creation; amount/order/reason are immutable.
    await this.db.query(
      `INSERT INTO refund_requests (
         id, order_id, amount_minor, currency, reason, proposed_by, status,
         paypal_refund_id, paypal_refund_status, last_error, created_at, updated_at, decided_at,
         ai_recommendation, merchant_approved_at, merchant_approved_by, idempotency_key_hash, idempotency_fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         paypal_refund_id = EXCLUDED.paypal_refund_id,
         paypal_refund_status = EXCLUDED.paypal_refund_status,
         last_error = EXCLUDED.last_error,
         updated_at = EXCLUDED.updated_at,
         decided_at = EXCLUDED.decided_at,
         ai_recommendation = COALESCE(EXCLUDED.ai_recommendation, refund_requests.ai_recommendation),
         merchant_approved_at = COALESCE(EXCLUDED.merchant_approved_at, refund_requests.merchant_approved_at),
         merchant_approved_by = COALESCE(EXCLUDED.merchant_approved_by, refund_requests.merchant_approved_by),
         idempotency_key_hash = COALESCE(EXCLUDED.idempotency_key_hash, refund_requests.idempotency_key_hash),
         idempotency_fingerprint = COALESCE(EXCLUDED.idempotency_fingerprint, refund_requests.idempotency_fingerprint)`,
      [
        r.id, r.orderId, r.amountMinor, r.currency, r.reason, r.proposedBy, r.status,
        r.paypalRefundId ?? null, r.paypalRefundStatus ?? null, r.lastError ?? null,
        new Date(r.createdAt), new Date(r.updatedAt), r.decidedAt ? new Date(r.decidedAt) : null,
        r.aiRecommendation ? JSON.stringify(r.aiRecommendation) : null,
        r.merchantApprovedAt ? new Date(r.merchantApprovedAt) : null,
        r.merchantApprovedBy ?? null, r.idempotencyKeyHash ?? null, r.idempotencyFingerprint ?? null,
      ]
    );
  }

  async claimForProcessing(input: { id: string; orderId: string; approvedAt: string; approvedBy: string; auditId: string }): Promise<boolean> {
    // pg-mem compatibility (emulator-only): the emulator does not execute
    // data-modifying CTEs. The same atomic claim+audit is expressed as two
    // statements inside ONE transaction there, so it still commits or rolls back
    // together. Production keeps the single-statement CTE verbatim.
    if (this.pgmem) {
      return withTransaction(this.db, async (client) => {
        const { rows } = await client.query(
          `UPDATE refund_requests SET status = 'PROCESSING', last_error = NULL,
             merchant_approved_at = $3, merchant_approved_by = $4, updated_at = $3
            WHERE id = $1 AND order_id = $2 AND status = 'PROPOSED' RETURNING id, order_id`,
          [input.id, input.orderId, new Date(input.approvedAt), input.approvedBy]
        );
        if (rows.length !== 1) return false;
        await client.query(
          `INSERT INTO refund_audit_events (id,refund_id,order_id,event_type,actor,details,occurred_at)
           VALUES ($1,$2,$3,'MERCHANT_APPROVED',$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
          [input.auditId, rows[0].id, rows[0].order_id, input.approvedBy, JSON.stringify({}), new Date(input.approvedAt)]
        );
        return true;
      });
    }
    const { rows } = await this.db.query(
      `WITH claimed AS (
         UPDATE refund_requests SET status = 'PROCESSING', last_error = NULL,
           merchant_approved_at = $3, merchant_approved_by = $4, updated_at = $3
          WHERE id = $1 AND order_id = $2 AND status = 'PROPOSED' RETURNING id, order_id
       ), audited AS (
         INSERT INTO refund_audit_events (id,refund_id,order_id,event_type,actor,details,occurred_at)
         SELECT $5,id,order_id,'MERCHANT_APPROVED',$4,'{}'::jsonb,$3 FROM claimed
         ON CONFLICT (id) DO NOTHING RETURNING refund_id
       ) SELECT id FROM claimed`,
      [input.id, input.orderId, new Date(input.approvedAt), input.approvedBy, input.auditId]
    );
    return rows.length === 1;
  }

  async appendAudit(event: RefundAuditRow): Promise<void> {
    await this.db.query(
      `INSERT INTO refund_audit_events (id,refund_id,order_id,event_type,actor,details,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [event.id, event.refundId, event.orderId, event.eventType, event.actor,
        JSON.stringify(event.details), new Date(event.occurredAt)]
    );
  }

  async loadAuditForOrder(orderId: string): Promise<RefundAuditRow[]> {
    const { rows } = await this.db.query(
      `SELECT * FROM refund_audit_events WHERE order_id = $1 ORDER BY occurred_at, id`, [orderId]
    );
    return rows.map((row: any) => ({
      id: row.id, refundId: row.refund_id, orderId: row.order_id, eventType: row.event_type,
      actor: row.actor, details: parseJson(row.details), occurredAt: iso(row.occurred_at)!,
    }));
  }
}

function rowToDispute(row: any): DisputeCaseRow {
  return {
    id: row.id, orderId: row.order_id, paypalDisputeId: row.paypal_dispute_id,
    status: row.status, paypalStatus: row.paypal_status ?? undefined,
    lifecycleStage: row.lifecycle_stage ?? undefined,
    requestedEvidenceType: row.requested_evidence_type ?? undefined,
    sellerResponseDueAt: iso(row.seller_response_due_at), evidenceType: row.evidence_type ?? undefined,
    evidenceNotes: row.evidence_notes ?? undefined,
    evidenceSnapshot: row.evidence_snapshot ? parseJson(row.evidence_snapshot) : undefined,
    evidenceDigest: row.evidence_digest ?? undefined, lastError: row.last_error ?? undefined,
    createdBy: row.created_by, createdAt: iso(row.created_at)!, updatedAt: iso(row.updated_at)!,
    submittedAt: iso(row.submitted_at), resolvedAt: iso(row.resolved_at),
  };
}

class PgDisputeRepository implements DisputeRepository {
  constructor(private readonly db: Queryable) {}

  async loadAll(): Promise<DisputeCaseRow[]> {
    const { rows } = await this.db.query('SELECT * FROM dispute_cases ORDER BY created_at DESC');
    return rows.map(rowToDispute);
  }

  async get(id: string): Promise<DisputeCaseRow | undefined> {
    const { rows } = await this.db.query('SELECT * FROM dispute_cases WHERE id = $1', [id]);
    return rows[0] ? rowToDispute(rows[0]) : undefined;
  }

  async create(row: DisputeCaseRow): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO dispute_cases (
         id,order_id,paypal_dispute_id,status,paypal_status,lifecycle_stage,requested_evidence_type,
         seller_response_due_at,evidence_type,evidence_notes,evidence_snapshot,evidence_digest,last_error,
         created_by,created_at,updated_at,submitted_at,resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (paypal_dispute_id) DO NOTHING RETURNING id`,
      [row.id,row.orderId,row.paypalDisputeId,row.status,row.paypalStatus ?? null,row.lifecycleStage ?? null,
       row.requestedEvidenceType ?? null,row.sellerResponseDueAt ? new Date(row.sellerResponseDueAt) : null,
       row.evidenceType ?? null,row.evidenceNotes ?? null,row.evidenceSnapshot ? JSON.stringify(row.evidenceSnapshot) : null,
       row.evidenceDigest ?? null,row.lastError ?? null,row.createdBy,new Date(row.createdAt),new Date(row.updatedAt),
       row.submittedAt ? new Date(row.submittedAt) : null,row.resolvedAt ? new Date(row.resolvedAt) : null]
    );
    return rows.length === 1;
  }

  async save(row: DisputeCaseRow): Promise<void> {
    await this.db.query(
      `UPDATE dispute_cases SET status=$2,paypal_status=$3,lifecycle_stage=$4,requested_evidence_type=$5,
         seller_response_due_at=$6,evidence_type=$7,evidence_notes=$8,evidence_snapshot=$9,evidence_digest=$10,
         last_error=$11,updated_at=$12,submitted_at=$13,resolved_at=$14 WHERE id=$1`,
      [row.id,row.status,row.paypalStatus ?? null,row.lifecycleStage ?? null,row.requestedEvidenceType ?? null,
       row.sellerResponseDueAt ? new Date(row.sellerResponseDueAt) : null,row.evidenceType ?? null,
       row.evidenceNotes ?? null,row.evidenceSnapshot ? JSON.stringify(row.evidenceSnapshot) : null,
       row.evidenceDigest ?? null,row.lastError ?? null,new Date(row.updatedAt),
       row.submittedAt ? new Date(row.submittedAt) : null,row.resolvedAt ? new Date(row.resolvedAt) : null]
    );
  }

  async transition(row: DisputeCaseRow, expected: DisputeCaseStatus[]): Promise<boolean> {
    const { rows } = await this.db.query(
      `UPDATE dispute_cases SET status=$2,paypal_status=$3,lifecycle_stage=$4,requested_evidence_type=$5,
         seller_response_due_at=$6,evidence_type=$7,evidence_notes=$8,evidence_snapshot=$9,evidence_digest=$10,
         last_error=$11,updated_at=$12,submitted_at=$13,resolved_at=$14 WHERE id=$1 AND status = ANY($15::text[])
         RETURNING id`,
      [row.id,row.status,row.paypalStatus ?? null,row.lifecycleStage ?? null,row.requestedEvidenceType ?? null,
       row.sellerResponseDueAt ? new Date(row.sellerResponseDueAt) : null,row.evidenceType ?? null,
       row.evidenceNotes ?? null,row.evidenceSnapshot ? JSON.stringify(row.evidenceSnapshot) : null,
       row.evidenceDigest ?? null,row.lastError ?? null,new Date(row.updatedAt),
       row.submittedAt ? new Date(row.submittedAt) : null,row.resolvedAt ? new Date(row.resolvedAt) : null,expected]
    );
    return rows.length === 1;
  }

  async appendAudit(event: DisputeAuditRow): Promise<void> {
    await this.db.query(
      `INSERT INTO dispute_audit_events (id,dispute_case_id,event_type,actor,details,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [event.id,event.disputeCaseId,event.eventType,event.actor,JSON.stringify(event.details),new Date(event.occurredAt)]
    );
  }

  async loadAudit(caseId: string): Promise<DisputeAuditRow[]> {
    const { rows } = await this.db.query(
      'SELECT * FROM dispute_audit_events WHERE dispute_case_id=$1 ORDER BY occurred_at,id', [caseId]
    );
    return rows.map((row: any) => ({
      id: row.id, disputeCaseId: row.dispute_case_id, eventType: row.event_type,
      actor: row.actor, details: parseJson(row.details), occurredAt: iso(row.occurred_at)!,
    }));
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

function rowToBillMandateReservation(row: any): BillMandateReservationRow {
  return {
    id: row.id,
    billId: row.bill_id,
    ownerUserId: row.owner_user_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    merchantId: row.merchant_id,
    mandateRevision: Number(row.mandate_revision),
    policySnapshot: parseJson(row.policy_snapshot),
    status: row.status,
    expiresAt: toDate(row.expires_at),
    createdAt: toDate(row.created_at)!,
    closedAt: toDate(row.closed_at),
    closeReason: row.close_reason ?? undefined,
  };
}

function billMandateViolation(
  policy: PurchasePolicy,
  totalMinor: number,
  currency: string,
  merchantId: string,
  now: Date
): MandateBlockReason | undefined {
  if (policy.validUntil && policy.validUntil.getTime() <= now.getTime()) return 'ALLOWANCE_EXPIRED';
  if (!policy.enabled) return undefined;
  if (currency !== policy.currency) return 'CURRENCY_MISMATCH';
  if (totalMinor > policy.maxPerPurchaseMinor) return 'MAX_PURCHASE_EXCEEDED';
  if (policy.allowedMerchantIds.length > 0 && !policy.allowedMerchantIds.includes(merchantId)) return 'MERCHANT_NOT_ALLOWED';
  return undefined;
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
  constructor(private readonly db: Queryable, private readonly pgmem = false) {}

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
    await this.saveGroupRow(this.db, group);
    for (const share of group.shares) {
      await this.saveShareRow(group.id, share, this.db);
    }
  }

  private async saveGroupRow(db: Queryable, group: BillGroup): Promise<void> {
    await db.query(
      `INSERT INTO bill_groups (
         id, merchant_id, currency, total_minor, strategy, created_by_user_id, status, items, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      [group.id, group.merchantId, group.currency, group.totalMinor, group.strategy,
        group.createdByUserId, group.status, JSON.stringify(group.items), group.createdAt, group.updatedAt]
    );
  }

  private async saveShareRow(billId: string, share: BillShare, db: Queryable = this.db): Promise<void> {
    // The authoritative decision columns (participant_user_id, order_id, paid_at)
    // are written ONLY on the first insert (the share is created with them). On
    // conflict the snapshot is convergent: it may ONLY refresh the derived `status`
    // and `updated_at`. This is the guard that prevents a stale fire-and-forget
    // `writeQueue` snapshot (e.g. a share captured before a join/claim bound it)
    // from clobbering an atomic decision that the DB already holds.
    await db.query(
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

  async createGroupWithMandateReservation(input: {
    group: BillGroup; mandateRevision: number; sessionId: string; expiresAt?: Date; reservationId: string;
  }): Promise<BillMandateResult> {
    return withTransaction(this.db, async (client) => {
      const { group } = input;
      const { rows } = await client.query(
        'SELECT revision, policy FROM spending_mandates WHERE user_id = $1 FOR UPDATE', [group.createdByUserId]
      );
      if (!rows[0] || Number(rows[0].revision) !== input.mandateRevision) return { ok: false, reason: 'MANDATE_CHANGED' };
      const policy = rowToPolicy(rows[0]);
      const now = new Date();
      const violation = billMandateViolation(policy, group.totalMinor, group.currency, group.merchantId, now);
      if (violation) return { ok: false, reason: violation };

      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const { rows: usage } = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN r.state = 'PENDING' THEN r.amount_minor ELSE 0 END),0) AS pending_minor,
           COALESCE(SUM(CASE WHEN r.state = 'CONFIRMED' AND r.settled_at >= $2 THEN r.amount_minor ELSE 0 END),0) AS spent_minor
         FROM spend_reservations r
         WHERE r.user_id = $1
           AND (r.state = 'PENDING' OR (r.state = 'CONFIRMED' AND r.settled_at >= $2))
           AND NOT EXISTS (
             SELECT 1 FROM bill_mandate_reservations h
              WHERE h.id = r.bill_mandate_reservation_id AND h.owner_user_id = $1 AND h.status = 'ACTIVE'
           )`, [group.createdByUserId, dayStart]
      );
      const { rows: held } = await client.query(
        `SELECT COALESCE(SUM(amount_minor),0) AS amount_minor FROM bill_mandate_reservations
          WHERE owner_user_id = $1 AND status = 'ACTIVE'`, [group.createdByUserId]
      );
      if (Number(usage[0]?.spent_minor ?? 0) + Number(usage[0]?.pending_minor ?? 0) +
          Number(held[0]?.amount_minor ?? 0) + group.totalMinor > policy.dailySpendLimitMinor) {
        return { ok: false, reason: 'DAILY_LIMIT_EXCEEDED' };
      }

      await this.saveGroupRow(client, group);
      for (const share of group.shares) await this.saveShareRow(group.id, share, client);
      const reservation: BillMandateReservationRow = {
        id: input.reservationId, billId: group.id, ownerUserId: group.createdByUserId,
        amountMinor: group.totalMinor, currency: group.currency, merchantId: group.merchantId,
        mandateRevision: input.mandateRevision, policySnapshot: policySnapshot(policy), status: 'ACTIVE',
        expiresAt: input.expiresAt, createdAt: now,
      };
      await client.query(
        `INSERT INTO bill_mandate_reservations
           (id,bill_id,owner_user_id,amount_minor,currency,merchant_id,mandate_revision,policy_snapshot,status,expires_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$10)`,
        [reservation.id, reservation.billId, reservation.ownerUserId, reservation.amountMinor,
          reservation.currency, reservation.merchantId, reservation.mandateRevision,
          JSON.stringify(reservation.policySnapshot), reservation.expiresAt ?? null, reservation.createdAt]
      );
      await client.query(
        `INSERT INTO spending_mandate_events
           (id,user_id,session_id,event_type,revision,amount_minor,currency,subject_id,after_snapshot,occurred_at)
         VALUES ($1,$2,$3,'BILL_AUTHORIZED',$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [randomUUID(), reservation.ownerUserId, input.sessionId, reservation.mandateRevision, reservation.amountMinor,
          reservation.currency, reservation.billId, JSON.stringify({
            reservationId: reservation.id, status: reservation.status,
            merchantId: reservation.merchantId, expiresAt: reservation.expiresAt?.toISOString() ?? null,
            policy: reservation.policySnapshot,
          }), now]
      );
      return { ok: true, reservation };
    });
  }

  async validateMandateReservation(input: {
    billId: string; ownerUserId: string; totalMinor: number; currency: string; merchantId: string;
  }): Promise<BillMandateResult> {
    return withTransaction(this.db, async (client) => {
      const { rows: mandateRows } = await client.query(
        'SELECT revision, policy FROM spending_mandates WHERE user_id = $1 FOR UPDATE', [input.ownerUserId]
      );
      const { rows: billRows } = await client.query(
        'SELECT * FROM bill_groups WHERE id = $1 FOR UPDATE', [input.billId]
      );
      if (!billRows[0] || billRows[0].created_by_user_id !== input.ownerUserId ||
          Number(billRows[0].total_minor) !== input.totalMinor || billRows[0].currency !== input.currency ||
          billRows[0].merchant_id !== input.merchantId) {
        return { ok: false, reason: 'BILL_MANDATE_RENEWAL_REQUIRED' };
      }
      if (!mandateRows[0]) return { ok: false, reason: 'MANDATE_CHANGED' };
      const { rows: reservationRows } = await client.query(
        `SELECT * FROM bill_mandate_reservations WHERE bill_id = $1 AND status = 'ACTIVE'
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [input.billId]
      );
      const reservation = reservationRows[0] ? rowToBillMandateReservation(reservationRows[0]) : undefined;
      const revision = Number(mandateRows[0].revision);
      const policy = rowToPolicy(mandateRows[0]);
      const invalid = !reservation || reservation.ownerUserId !== input.ownerUserId ||
        reservation.amountMinor !== input.totalMinor || reservation.currency !== input.currency ||
        reservation.merchantId !== input.merchantId || reservation.mandateRevision !== revision ||
        (!!reservation.expiresAt && reservation.expiresAt.getTime() <= Date.now()) ||
        !!billMandateViolation(policy, input.totalMinor, input.currency, input.merchantId, new Date());
      return invalid ? { ok: false, reason: 'BILL_MANDATE_RENEWAL_REQUIRED' } : { ok: true, reservation: reservation! };
    });
  }

  async renewMandateReservation(input: {
    billId: string; ownerUserId: string; confirmedTotalMinor: number; mandateRevision: number;
    expiresAt?: Date; reservationId: string; sessionId: string; eventId: string;
  }): Promise<BillMandateResult> {
    return withTransaction(this.db, async (client) => {
      const { rows: mandateRows } = await client.query(
        'SELECT revision, policy FROM spending_mandates WHERE user_id = $1 FOR UPDATE', [input.ownerUserId]
      );
      if (!mandateRows[0] || Number(mandateRows[0].revision) !== input.mandateRevision) {
        return { ok: false, reason: 'MANDATE_CHANGED' };
      }
      const { rows: billRows } = await client.query(
        'SELECT * FROM bill_groups WHERE id = $1 FOR UPDATE', [input.billId]
      );
      if (!billRows[0] || billRows[0].created_by_user_id !== input.ownerUserId ||
          Number(billRows[0].total_minor) !== input.confirmedTotalMinor || billRows[0].status === 'CANCELLED') {
        return { ok: false, reason: 'BILL_MANDATE_RENEWAL_REQUIRED' };
      }
      const policy = rowToPolicy(mandateRows[0]);
      const currency = String(billRows[0].currency);
      const merchantId = String(billRows[0].merchant_id);
      const violation = billMandateViolation(policy, input.confirmedTotalMinor, currency, merchantId, new Date());
      if (violation) return { ok: false, reason: violation };

      const { rows: previousRows } = await client.query(
        `SELECT * FROM bill_mandate_reservations WHERE bill_id = $1 AND status = 'ACTIVE' FOR UPDATE`, [input.billId]
      );
      const previous = previousRows[0] ? rowToBillMandateReservation(previousRows[0]) : undefined;
      const now = new Date();
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const { rows: usage } = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN r.state = 'PENDING' THEN r.amount_minor ELSE 0 END),0) AS pending_minor,
           COALESCE(SUM(CASE WHEN r.state = 'CONFIRMED' AND r.settled_at >= $2 THEN r.amount_minor ELSE 0 END),0) AS spent_minor
         FROM spend_reservations r
         WHERE r.user_id = $1
           AND (r.state = 'PENDING' OR (r.state = 'CONFIRMED' AND r.settled_at >= $2))
           AND NOT EXISTS (
             SELECT 1 FROM bill_mandate_reservations h
              WHERE h.id = r.bill_mandate_reservation_id AND h.owner_user_id = $1 AND h.status = 'ACTIVE'
           )`, [input.ownerUserId, dayStart]
      );
      const { rows: held } = await client.query(
        `SELECT COALESCE(SUM(amount_minor),0) AS amount_minor FROM bill_mandate_reservations
          WHERE owner_user_id = $1 AND status = 'ACTIVE' AND bill_id <> $2`, [input.ownerUserId, input.billId]
      );
      if (Number(usage[0]?.spent_minor ?? 0) + Number(usage[0]?.pending_minor ?? 0) +
          Number(held[0]?.amount_minor ?? 0) + input.confirmedTotalMinor > policy.dailySpendLimitMinor) {
        return { ok: false, reason: 'DAILY_LIMIT_EXCEEDED' };
      }
      if (previous) {
        await client.query(
          `UPDATE bill_mandate_reservations SET status = 'REPLACED', closed_at = $2, close_reason = 'REAUTHORIZED'
            WHERE id = $1 AND status = 'ACTIVE'`, [previous.id, now]
        );
      }
      const reservation: BillMandateReservationRow = {
        id: input.reservationId, billId: input.billId, ownerUserId: input.ownerUserId,
        amountMinor: input.confirmedTotalMinor, currency, merchantId,
        mandateRevision: input.mandateRevision, policySnapshot: policySnapshot(policy), status: 'ACTIVE',
        expiresAt: input.expiresAt ?? policy.validUntil, createdAt: now,
      };
      await client.query(
        `INSERT INTO bill_mandate_reservations
           (id,bill_id,owner_user_id,amount_minor,currency,merchant_id,mandate_revision,policy_snapshot,status,expires_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$10)`,
        [reservation.id, reservation.billId, reservation.ownerUserId, reservation.amountMinor,
          reservation.currency, reservation.merchantId, reservation.mandateRevision,
          JSON.stringify(reservation.policySnapshot), reservation.expiresAt ?? null, reservation.createdAt]
      );
      await client.query(
        `INSERT INTO spending_mandate_events
           (id,user_id,session_id,event_type,revision,amount_minor,currency,subject_id,before_snapshot,after_snapshot,occurred_at)
         VALUES ($1,$2,$3,'BILL_REAUTHORIZED',$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
        [input.eventId, input.ownerUserId, input.sessionId, reservation.mandateRevision,
          reservation.amountMinor, reservation.currency, reservation.billId,
          previous ? JSON.stringify({ reservationId: previous.id, status: previous.status,
            amountMinor: previous.amountMinor, mandateRevision: previous.mandateRevision }) : null,
          JSON.stringify({ reservationId: reservation.id, status: reservation.status,
            amountMinor: reservation.amountMinor, mandateRevision: reservation.mandateRevision,
            expiresAt: reservation.expiresAt?.toISOString() ?? null }), now]
      );
      return { ok: true, reservation };
    });
  }

  async cancelGroupAndCloseMandate(billId: string, ownerUserId: string): Promise<boolean> {
    return withTransaction(this.db, async (client) => {
      await client.query('SELECT user_id FROM spending_mandates WHERE user_id = $1 FOR UPDATE', [ownerUserId]);
      const { rows } = await client.query('SELECT * FROM bill_groups WHERE id = $1 FOR UPDATE', [billId]);
      const group = rows[0];
      if (!group || group.created_by_user_id !== ownerUserId) return false;
      const { rows: activeOrders } = await client.query(
        `SELECT 1 FROM bill_shares bs JOIN orders o ON o.id = bs.order_id
          WHERE bs.bill_id = $1 AND o.status IN ('PAYMENT_PENDING','PAID','ORDER_CONFIRMED') LIMIT 1`, [billId]
      );
      if (activeOrders.length) return false;
      if (group.status !== 'CANCELLED') {
        await client.query(`UPDATE bill_groups SET status = 'CANCELLED', updated_at = now() WHERE id = $1`, [billId]);
      }
      await this.closeActiveBillMandate(client, billId, ownerUserId, 'CANCELLED', 'BILL_CANCELLED');
      return true;
    });
  }

  private async closeActiveBillMandate(
    client: Queryable, billId: string, ownerUserId: string,
    status: 'SETTLED' | 'CANCELLED' | 'EXPIRED', reason: string
  ): Promise<boolean> {
    const { rows } = await client.query(
      `UPDATE bill_mandate_reservations SET status = $3, closed_at = now(), close_reason = $4
        WHERE bill_id = $1 AND owner_user_id = $2 AND status = 'ACTIVE' RETURNING *`,
      [billId, ownerUserId, status, reason]
    );
    const reservation = rows[0] ? rowToBillMandateReservation(rows[0]) : undefined;
    if (!reservation) return false;
    await client.query(
      `INSERT INTO spending_mandate_events
         (id,user_id,event_type,revision,amount_minor,currency,subject_id,before_snapshot,after_snapshot,occurred_at)
       VALUES ($1,$2,'BILL_CLOSED',$3,$4,$5,$6,$7,$8,now()) ON CONFLICT (id) DO NOTHING`,
      [randomUUID(), ownerUserId, reservation.mandateRevision, reservation.amountMinor, reservation.currency,
        billId, JSON.stringify({ reservationId: reservation.id, status: 'ACTIVE' }),
        JSON.stringify({ reservationId: reservation.id, status, reason })]
    );
    return true;
  }

  async reconcileMandateReservations(): Promise<{ settled: number; expired: number; cancelled: number }> {
    return withTransaction(this.db, async (client) => {
      const counts = { settled: 0, expired: 0, cancelled: 0 };

      if (this.pgmem) {
        // pg-mem compatibility (emulator-only): the pg-mem SQL emulator cannot
        // resolve an OUTER alias (`h.bill_id`) inside a correlated subquery, so
        // the production statement below fails at EXECUTION with
        // `column "h.bill_id" does not exist`. We therefore load the active
        // reservations with a plain join and evaluate the SAME predicate in
        // application code, then close them through the identical
        // `closeActiveBillMandate` path. The read set and the decision logic are
        // unchanged — only the SQL shape differs. This branch is unreachable for
        // a real `pg.Pool` (see `createPgRepositories`), so production keeps the
        // fully-locked single-statement path verbatim.
        const { rows } = await client.query(
          `SELECT h.*, b.status AS bill_status FROM bill_mandate_reservations h
             JOIN bill_groups b ON b.id = h.bill_id
            WHERE h.status = 'ACTIVE'
            FOR UPDATE`
        );
        for (const row of rows) {
          const shares = await client.query(
            `SELECT bs.status AS share_status, o.status AS order_status
               FROM bill_shares bs LEFT JOIN orders o ON o.id = bs.order_id
              WHERE bs.bill_id = $1`,
            [row.bill_id]
          );
          // Mirrors the first `NOT EXISTS`: an UNPAID share is one whose own
          // status is not PAID/WAIVED and whose order is not PAID/ORDER_CONFIRMED
          // (COALESCE treats a missing status — e.g. no order row — as '').
          const hasUnpaidShare = shares.rows.some(
            (s: any) =>
              !['PAID', 'WAIVED'].includes(s.share_status ?? '') &&
              !['PAID', 'ORDER_CONFIRMED'].includes(s.order_status ?? '')
          );
          // Mirrors the second `NOT EXISTS`: a share whose order is still in
          // flight. An expired reservation must not be closed while one exists.
          const hasInFlightShare = shares.rows.some((s: any) =>
            ['CART_READY', 'AWAITING_CONFIRMATION', 'PAYMENT_PENDING'].includes(s.order_status ?? '')
          );
          const expired =
            row.expires_at != null && new Date(row.expires_at).getTime() <= Date.now();
          const selected =
            row.bill_status === 'CANCELLED' ||
            !hasUnpaidShare ||
            (expired && !hasInFlightShare);
          if (!selected) continue;
          const status: 'CANCELLED' | 'EXPIRED' | 'SETTLED' =
            row.bill_status === 'CANCELLED' ? 'CANCELLED' : expired ? 'EXPIRED' : 'SETTLED';
          const closed = await this.closeActiveBillMandate(
            client, row.bill_id, row.owner_user_id, status, `BILL_${status}`
          );
          if (closed) counts[status.toLowerCase() as keyof typeof counts]++;
        }
        return counts;
      }

      // Production PostgreSQL: ONE fully-locked statement. Byte-identical to the
      // historical form (`FOR UPDATE OF h SKIP LOCKED`); never weakened.
      const { rows } = await client.query(
        `SELECT h.*, b.status AS bill_status FROM bill_mandate_reservations h
           JOIN bill_groups b ON b.id = h.bill_id
          WHERE h.status = 'ACTIVE' AND (
            b.status = 'CANCELLED'
            OR NOT EXISTS (
              SELECT 1 FROM bill_shares bs LEFT JOIN orders o ON o.id = bs.order_id
               WHERE bs.bill_id = h.bill_id
                 AND COALESCE(bs.status, '') NOT IN ('PAID','WAIVED')
                 AND COALESCE(o.status, '') NOT IN ('PAID','ORDER_CONFIRMED')
            )
            OR (h.expires_at IS NOT NULL AND h.expires_at <= now() AND NOT EXISTS (
              SELECT 1 FROM bill_shares bs JOIN orders o ON o.id = bs.order_id
               WHERE bs.bill_id = h.bill_id AND o.status IN ('CART_READY','AWAITING_CONFIRMATION','PAYMENT_PENDING')
            ))
          ) FOR UPDATE OF h SKIP LOCKED`
      );
      for (const row of rows) {
        const status = row.bill_status === 'CANCELLED' ? 'CANCELLED'
          : row.expires_at && new Date(row.expires_at).getTime() <= Date.now() ? 'EXPIRED' : 'SETTLED';
        const closed = await this.closeActiveBillMandate(client, row.bill_id, row.owner_user_id, status, `BILL_${status}`);
        if (closed) counts[status.toLowerCase() as keyof typeof counts]++;
      }
      return counts;
    });
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

// `pickup_slots.day` is a SQL `date`; node-pg hands it back as a JS Date (local midnight).
// Normalize to the plain YYYY-MM-DD string the API and UI use, never String(Date).
export const toDayString = (v: any): string => {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
};
const toSlot = (r: any): PickupSlotRow => ({
  id: r.id,
  day: toDayString(r.day),
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

/**
 * Append-only, hash-chained store for spending-mandate audit events. Mirrors the in-memory
 * MandateAudit chain in policy/mandate-audit.ts; the chain hash is computed by that module and
 * stored verbatim, so a tampered row is detectable on reload (verify()).
 */
class PgMandateEventsRepository implements MandateEventsRepo {
  constructor(private readonly db: Queryable) {}

  async loadAll(): Promise<Array<{ userId: string; seq: number; event: unknown; at: string }>> {
    const { rows } = await this.db.query(
      'SELECT * FROM mandate_events ORDER BY user_id ASC, seq ASC'
    );
    return rows.map((r: any) => ({
      userId: r.user_id,
      seq: Number(r.seq),
      event: typeof r.event === 'string' ? JSON.parse(r.event) : r.event,
      at: new Date(r.at).toISOString(),
    }));
  }

  // ON CONFLICT DO NOTHING: re-sending the same event after a retry never rewrites history.
  async append(row: { userId: string; seq: number; event: unknown; at: string }): Promise<void> {
    await this.db.query(
      `INSERT INTO mandate_events (user_id, seq, event, at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, seq) DO NOTHING`,
      [row.userId, row.seq, JSON.stringify(row.event), row.at]
    );
  }
}

export function createPgRepositories(db: Queryable, close: () => Promise<void>): Repositories {
  // pg-mem compatibility (OPT-IN, emulator-only): the pg-mem SQL emulator's parser
  // only accepts a BARE `FOR UPDATE`. It rejects PostgreSQL's table-qualified lock
  // list (`FOR UPDATE OF h` / `OF h, b`) and `SKIP LOCKED`. The emulator is
  // single-threaded/serial, so neither feature has any observable effect in tests —
  // the reconciler's read set and decision logic are identical, only the lock clause
  // differs.
  //
  // This path is activated EXPLICITLY only for the pg-mem emulator, so it is
  // guaranteed to stay INERT in a real PostgreSQL configuration: production keeps
  // the full `FOR UPDATE OF ... SKIP LOCKED` semantics verbatim. We detect the
  // emulator by two independent signals a real `pg.Pool` never has at the same
  // time:
  //   - the adapter pool's class name is `MemPg` (real pg pools are `Pool`/`BoundPool`);
  //   - it exposes a `.connection` member (real `pg.Pool` does not).
  // Requiring both means a wrong match would have to satisfy both, so a real
  // PostgreSQL pool cannot accidentally enter this path and weaken its row locks.
  const candidate = db as unknown as { constructor?: { name?: string }; connection?: unknown };
  const pgmem =
    candidate.constructor?.name === 'MemPg' &&
    Object.prototype.hasOwnProperty.call(candidate, 'connection');
  return {
    mode: 'postgres',
    orders: new PgOrderRepository(db),
    reservations: new PgReservationRepository(db, pgmem),
    mandates: new PgSpendingMandateRepository(db),
    idempotency: new PgIdempotencyRepository(db),
    sessions: new PgSessionRepository(db),
    refunds: new PgRefundRepository(db, pgmem),
    disputes: new PgDisputeRepository(db),
    mandateEvents: new PgMandateEventsRepository(db),
    policyEvents: new PgPolicyEventRepository(db),
    webhookEvents: new PgWebhookEventRepository(db),
    webhookReviews: new PgWebhookReviewRepository(db),
    captureClaims: new PgCaptureClaimRepository(db),
    bills: new PgBillRepository(db, pgmem),
    pickup: new PgPickupRepository(db),
    ping: async () => {
      await db.query('SELECT 1');
    },
    close,
  };
}

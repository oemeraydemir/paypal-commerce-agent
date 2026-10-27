import { Order, OrderOrigin, OrderStatus } from '../orders/domain';
import {
  IdempotencyRepository,
  OrderRepository,
  Queryable,
  Repositories,
  PolicyEventRepository,
  WebhookEventRepository,
  WebhookReviewRecord,
  WebhookReviewRepository,
  CaptureClaimRepository,
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
    ping: async () => {
      await db.query('SELECT 1');
    },
    close,
  };
}

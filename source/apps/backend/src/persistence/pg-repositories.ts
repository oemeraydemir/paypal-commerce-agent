import { Order, OrderOrigin, OrderStatus } from '../orders/domain';
import {
  IdempotencyRepository,
  OrderRepository,
  Queryable,
  Repositories,
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

export function createPgRepositories(db: Queryable, close: () => Promise<void>): Repositories {
  return {
    mode: 'postgres',
    orders: new PgOrderRepository(db),
    reservations: new PgReservationRepository(db),
    idempotency: new PgIdempotencyRepository(db),
    sessions: new PgSessionRepository(db),
    ping: async () => {
      await db.query('SELECT 1');
    },
    close,
  };
}

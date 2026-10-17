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

export interface Repositories {
  mode: 'postgres';
  orders: OrderRepository;
  reservations: ReservationRepository;
  idempotency: IdempotencyRepository;
  sessions: SessionRepository;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** The subset of pg.Pool / pg-mem's pool that this layer needs. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

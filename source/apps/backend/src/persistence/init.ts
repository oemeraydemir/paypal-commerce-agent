import { Pool } from 'pg';
import { env } from '../config/environment';
import { OrderService } from '../orders/service';
import { sessionStore } from '../session';
import { refundService } from '../refunds/service';
import { policyStorage } from '../policy/storage';
import { webhookService } from '../paypal/webhook-service';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import { migrate } from './migrations';
import { Queryable } from './types';
import { createPgRepositories } from './pg-repositories';
import { registerRetrier, setRepos } from './registry';

export interface PersistenceStatus {
  mode: 'postgres' | 'memory';
  migrationsApplied: string[];
  ordersLoaded: number;
  reservationsLoaded: number;
}

/** What attachPersistence needs: pg.Pool or pg-mem's equivalent. */
export interface PoolLike extends Queryable {
  connect(): Promise<Queryable & { release(): void }>;
  end(): Promise<void>;
}

const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
// PayPal retries undelivered webhooks for up to ~3 days; keep ids well beyond that.
const WEBHOOK_EVENT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Connects the durable repositories to a pool, applies migrations and loads the
 * persisted state into the in-memory read model. Must finish BEFORE the server
 * listens, otherwise a request could be answered from a half-loaded state.
 */
export async function attachPersistence(
  pool: PoolLike,
  options: { advisoryLock?: boolean; startTimers?: boolean } = {}
): Promise<PersistenceStatus> {
  const migrationsApplied = await migrate(pool, { advisoryLock: options.advisoryLock });
  const repos = createPgRepositories(pool, () => pool.end());
  await repos.ping();
  setRepos(repos);

  const orderService = OrderService.getInstance();
  registerRetrier(() => orderService.retryDirty());
  registerRetrier(() => dailySpendTracker.retryDirty());
  registerRetrier(() => sessionStore.retryDirty());
  registerRetrier(() => refundService.retryDirty());
  registerRetrier(() => policyStorage.retryDirty());
  registerRetrier(() => webhookService.retryDirty());

  await sessionStore.hydrate();
  const reservationsLoaded = await dailySpendTracker.hydrate();
  const ordersLoaded = await orderService.hydrate();
  await refundService.hydrate();
  await policyStorage.hydrate();
  await webhookService.hydrate();

  const purge = () =>
    repos.idempotency
      .deleteOlderThan(new Date(Date.now() - IDEMPOTENCY_RETENTION_MS))
      .catch((err: any) => console.warn(`Idempotency purge failed: ${err?.message ?? err}`));
  const purgeWebhookEvents = () =>
    repos.webhookEvents
      .deleteOlderThan(new Date(Date.now() - WEBHOOK_EVENT_RETENTION_MS))
      .catch((err: any) => console.warn(`Webhook event purge failed: ${err?.message ?? err}`));
  await purge();
  await purgeWebhookEvents();
  if (options.startTimers) {
    setInterval(purge, 60 * 60 * 1000).unref();
    setInterval(purgeWebhookEvents, 6 * 60 * 60 * 1000).unref();
  }
  return { mode: 'postgres', migrationsApplied, ordersLoaded, reservationsLoaded };
}

/** Test isolation only: detaches the repositories (state returns to pure in-memory). */
export function detachPersistence(): void {
  setRepos(null);
}

/** Production entry: PostgreSQL via DATABASE_URL, or memory with a loud warning. */
export async function initPersistence(): Promise<PersistenceStatus> {
  if (!env.DATABASE_URL) {
    // The documented contract is environment-independent: when persistence is explicitly
    // required the service must NEVER silently fall back to volatile in-memory storage
    // (orders, reservations, sessions and idempotency keys would be lost on restart).
    if (env.REQUIRE_PERSISTENCE === 'true') {
      throw new Error('REQUIRE_PERSISTENCE=true but DATABASE_URL is not set; refusing to start.');
    }
    if (env.NODE_ENV === 'production') {
      console.warn(
        '⚠️  PERSISTENCE DISABLED: DATABASE_URL is not set. Orders, reservations and idempotency ' +
          'keys live in memory and are LOST on every restart/redeploy. Attach a managed PostgreSQL.'
      );
    }
    return { mode: 'memory', migrationsApplied: [], ordersLoaded: 0, reservationsLoaded: 0 };
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    connectionTimeoutMillis: 10_000,
    ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  pool.on('error', (err: any) => console.error(`DB_POOL_ERROR ${err.message}`));
  // Any failure here must stop the boot: silently falling back to memory would
  // hide data loss behind a healthy-looking service. The connection string is
  // never echoed into the error message.
  try {
    return await attachPersistence(pool as unknown as PoolLike, { startTimers: true });
  } catch (err: any) {
    await pool.end().catch(() => undefined);
    throw new Error(
      `PostgreSQL initialization failed (REQUIRE_PERSISTENCE=${env.REQUIRE_PERSISTENCE}): ` +
        `${err?.message ?? err}. Refusing to start with volatile in-memory storage.`
    );
  }
}

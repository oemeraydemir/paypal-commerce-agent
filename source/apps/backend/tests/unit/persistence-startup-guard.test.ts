/**
 * FIX-01 (verification finding D7): the persistence startup guard must be
 * environment-independent. REQUIRE_PERSISTENCE=true means "never silently fall
 * back to volatile in-memory storage", in development exactly as in production.
 */
import { newDb } from 'pg-mem';
import { env } from '../../src/config/environment';
import { initPersistence, attachPersistence, detachPersistence, PoolLike } from '../../src/persistence/init';

jest.mock('../../src/paypal/client', () => ({ paypalClient: {} }));

const original = {
  databaseUrl: env.DATABASE_URL,
  require: env.REQUIRE_PERSISTENCE,
  nodeEnv: env.NODE_ENV,
};

afterEach(() => {
  env.DATABASE_URL = original.databaseUrl;
  env.REQUIRE_PERSISTENCE = original.require;
  env.NODE_ENV = original.nodeEnv;
  detachPersistence();
});

describe('initPersistence: REQUIRE_PERSISTENCE=true must never fall back to memory', () => {
  test.each(['development', 'production', 'test'])(
    'refuses to start in %s when REQUIRE_PERSISTENCE=true and DATABASE_URL is not set',
    async (nodeEnv) => {
      env.NODE_ENV = nodeEnv as typeof env.NODE_ENV;
      env.DATABASE_URL = undefined;
      env.REQUIRE_PERSISTENCE = 'true';

      await expect(initPersistence()).rejects.toThrow(
        /REQUIRE_PERSISTENCE=true but DATABASE_URL is not set/
      );
    }
  );

  test('an unreachable database fails startup with a sanitized message (no connection string)', async () => {
    env.NODE_ENV = 'development';
    env.DATABASE_URL = 'postgres://aicafe:s3cret-pw-do-not-leak@127.0.0.1:1/aicafe_test';
    env.REQUIRE_PERSISTENCE = 'true';

    let error: Error | undefined;
    try {
      await initPersistence();
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/PostgreSQL initialization failed/);
    expect(error!.message).toMatch(/Refusing to start with volatile in-memory storage/);
    // The credentials inside DATABASE_URL must never reach the error surface.
    expect(error!.message).not.toContain('s3cret-pw-do-not-leak');
    expect(error!.message).not.toContain('aicafe_test');
  });
});

describe('intentional in-memory development behaviour is preserved', () => {
  test('without REQUIRE_PERSISTENCE and without DATABASE_URL the server still boots in memory', async () => {
    env.NODE_ENV = 'development';
    env.DATABASE_URL = undefined;
    env.REQUIRE_PERSISTENCE = 'false';

    await expect(initPersistence()).resolves.toMatchObject({ mode: 'memory' });
  });
});

describe('successful durable startup', () => {
  test('a working database attaches, migrates and reports durable mode', async () => {
    const { Pool } = newDb().adapters.createPg();
    const pool = new Pool() as unknown as PoolLike;
    const status = await attachPersistence(pool, { advisoryLock: false });
    expect(status.mode).toBe('postgres');
    expect(Array.isArray(status.migrationsApplied)).toBe(true);
  });
});

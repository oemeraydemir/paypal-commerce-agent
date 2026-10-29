/* Applies pending database migrations and prints the schema state.
 *   DATABASE_URL=postgres://... npm run db:migrate
 * The server also runs migrations on every boot, so this is only needed to prepare
 * or inspect a database ahead of a deploy. It never prints the connection string. */
import 'dotenv/config';
import { Pool } from 'pg';
import { migrate, MIGRATIONS } from '../src/persistence/migrations';
import { resolveDatabaseSslOptions } from '../src/persistence/database-ssl';

(async () => {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: url,
    ssl: resolveDatabaseSslOptions({
      nodeEnv: process.env.NODE_ENV,
      enabled: process.env.DATABASE_SSL,
      ca: process.env.DATABASE_SSL_CA,
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    }),
    connectionTimeoutMillis: 10_000,
  });
  try {
    const applied = await migrate(pool as any);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Schema already up to date.');
    const { rows } = await pool.query('SELECT id, applied_at FROM schema_migrations ORDER BY id');
    for (const r of rows) console.log(`  ${r.id}  (${new Date(r.applied_at).toISOString()})`);
    console.log(`Known migrations in this build: ${MIGRATIONS.map((m) => m.id).join(', ')}`);
  } catch (err: any) {
    console.error(`Migration failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

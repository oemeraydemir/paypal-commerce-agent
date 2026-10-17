import { createApp } from './app';
import { env } from './config/environment';
import { startReservationSweeper, reconcileAfterRestart } from './orders/payment-lifecycle';
import { initPersistence } from './persistence/init';

// CRITICAL FIX #1: dedicated entrypoint that calls listen(). Kept separate from
// app.ts so tests can import createApp() without starting a server.
async function main(): Promise<void> {
  // 1) Durable state first: migrations + load, BEFORE the first request is served.
  const persistence = await initPersistence();
  const app = createApp();

  app.listen(env.PORT, () => {
    if (env.isPayPalEnabled()) {
      startReservationSweeper();
      if (persistence.mode === 'postgres') {
        // 2) Recover payments whose capture may have completed while we were down.
        reconcileAfterRestart()
          .then((s) => console.log(`Restart reconcile: ${JSON.stringify(s)}`))
          .catch((err) => console.error(`Restart reconcile failed: ${err?.message ?? err}`));
      }
    }
    console.log(`🚀 Server running on port ${env.PORT}`);
    console.log(`📡 Environment: ${env.NODE_ENV}`);
    console.log(`💳 PayPal: ${env.isPayPalEnabled() ? 'enabled' : 'disabled (S1 mode)'}`);
    console.log(
      `🗄️  Storage: ${persistence.mode}` +
        (persistence.mode === 'postgres'
          ? ` (orders=${persistence.ordersLoaded}, reservations=${persistence.reservationsLoaded}, migrations=${persistence.migrationsApplied.join(',') || 'up-to-date'})`
          : ' (in-memory, NOT durable)')
    );
    console.log(`🌐 CORS: ${env.CORS_ORIGIN}`);
  });
}

main().catch((err) => {
  console.error(`FATAL: startup failed: ${err?.message ?? err}`);
  process.exit(1);
});

import { createApp } from './app';
import { env } from './config/environment';

// CRITICAL FIX #1: dedicated entrypoint that calls listen(). Kept separate from
// app.ts so tests can import createApp() without starting a server.
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`🚀 Server running on port ${env.PORT}`);
  console.log(`📡 Environment: ${env.NODE_ENV}`);
  console.log(`💳 PayPal: ${env.isPayPalEnabled() ? 'enabled' : 'disabled (S1 mode)'}`);
  console.log(`🌐 CORS: ${env.CORS_ORIGIN}`);
});

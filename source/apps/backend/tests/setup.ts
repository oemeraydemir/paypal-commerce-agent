// Jest setup — runs BEFORE test modules are imported, so env vars are present
// when src/config/environment.ts parses process.env at import time.
//
// We give PayPal a dummy-but-valid config so `env.isPayPalEnabled()` is true
// during tests. The actual PayPal client is mocked in integration tests, so no
// real network call is ever made. For the real sandbox smoke test, set these to
// real values (or use a .env) and run `npm run test:smoke`.

process.env.NODE_ENV = 'test';
process.env.PAYPAL_ENABLED = 'true';
process.env.PAYPAL_CLIENT_ID = 'test-client-id';
process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
process.env.PAYPAL_ENV = 'sandbox';
process.env.PAYPAL_RETURN_URL = 'http://10.0.2.2:3000/api/checkout/return';
process.env.PAYPAL_CANCEL_URL = 'http://10.0.2.2:3000/api/checkout/cancel';
// S5: dummy webhook ID so the webhook service believes it is configured.
process.env.PAYPAL_WEBHOOK_ID = 'test-webhook-id';
// Enable the AI module in tests; the OpenAI client is mocked in the AI suite.
process.env.OPENAI_API_KEY = 'test-openai-key';
// Pin the AI-chat rate-limit ceilings to their documented defaults. Without
// this, a developer's local `.env` (dotenv loads it, and a stricter local
// ceiling such as AI_CHAT_PER_IP_PER_MIN=4 is legitimate for manual quota
// protection) would silently change the limits and break the rate-limit tests.
// setupFiles run before module imports, and dotenv never overrides an existing
// process.env value, so these win over `.env`.
process.env.AI_CHAT_PER_SESSION_PER_MIN = '10';
process.env.AI_CHAT_PER_IP_PER_MIN = '30';
process.env.AI_CHAT_GLOBAL_PER_MIN = '120';
// Deterministic in-memory persistence for unit/integration tests. A developer
// `.env` may point at a remote (Render) PostgreSQL that is unreachable from a
// sandbox; booting the app would stall on connection retries past jest's default
// per-test timeout (this is exactly the storefront-branding full-suite failure).
// The app is designed to run in-memory when DATABASE_URL is empty/unset (see
// src/config/environment.ts). dotenv never overrides an existing process.env
// value, so setting '' here wins over `.env`. Smoke tests that need a real DB
// (tests/smoke/pg-*.test.ts) are excluded from `npm test` and set their own URL.
process.env.DATABASE_URL = '';
process.env.REQUIRE_PERSISTENCE = 'false';

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

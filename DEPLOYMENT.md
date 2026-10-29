# Deployment Guide

This project is a Node.js + TypeScript Express backend intended for a simple Render deployment. The app keeps the public dashboard read-only and persists orders in PostgreSQL for reliability; it is a sandbox hackathon demo, not a production payment service.

## Deployment target

Recommended deployment target: Render Web Service.

### Required runtime configuration

Set the following environment variables in the Render dashboard:

- NODE_ENV=production
- PORT=10000
- CORS_ORIGIN=https://<your-service>.onrender.com
- DATABASE_URL=<PostgreSQL connection string>
- REQUIRE_PERSISTENCE=true
- PAYPAL_ENABLED=true
- PAYPAL_CLIENT_ID=<PayPal sandbox app ID>
- PAYPAL_CLIENT_SECRET=<PayPal sandbox secret>
- PAYPAL_ENV=sandbox
- PAYPAL_RETURN_URL=https://<your-service>.onrender.com/api/checkout/return
- PAYPAL_CANCEL_URL=https://<your-service>.onrender.com/api/checkout/cancel
- PAYPAL_WEBHOOK_ID=<optional sandbox webhook ID>
- MANDATE_SIGNING_KEY=<Ed25519 private key for cart mandate signing>
- OPENAI_API_KEY=<OpenAI API key>
- GEMINI_API_KEY=<Google Gemini API key>
- GROQ_API_KEY=<Groq API key>
- OPENROUTER_API_KEY=<OpenRouter API key>
- AI_PROVIDER_ORDER=<comma-separated provider order, e.g., "gemini,groq,openrouter,openai">
- PUBLIC_BASE_URL=https://<your-service>.onrender.com
- DASHBOARD_PUBLIC=true
- OPS_COPILOT_ENABLED=false
- OPS_COPILOT_KEY=<optional operator key>

Use Render's secret environment-variable prompt for PayPal credentials, API keys, and the mandate signing key. The committed `render.yaml` marks these values `sync: false` and derives the default checkout return URLs from `RENDER_EXTERNAL_URL`.

## Build and start

Render will build and run from `source/apps/backend` using:

- Build command: `npm install && npm run build`
- Start command: `npm start`

The `render.yaml` file in this directory is a minimal deployment definition for the backend service.

## Operational notes

- While local development can use in-memory storage, the production Render environment enforces strict PostgreSQL persistence. Restarts do not lose order data; crash recovery is handled via `reconcileAfterRestart()`.
- The public dashboard should remain read-only and non-authenticated to follow the Sprint 7 design constraints.
- Webhook verification remains server-side and authoritative; the client is never trusted to set the order origin.
- PayPal live mode is rejected by configuration; this project is sandbox-only.
- The checkout return routes present a link back to the Flutter app. The app validates the returned PayPal order token before allowing the shopper to confirm capture.
- Use sandbox credentials in hackathon/demo environments. Do not commit secrets or production credentials to the repo.
- Multiple AI providers are configured for automatic fallback; if one provider returns 429/5xx or model-not-found, the next provider in `AI_PROVIDER_ORDER` is tried.

## Smoke verification after deployment

After deployment, validate these URLs:

1. `https://<your-service>/api/health` — Reports storage mode (postgres), PayPal sandbox status, and AI provider availability
2. `https://<your-service>/api/catalog` — Returns 25 products with server-authoritative prices
3. `https://<your-service>/api/orders?limit=5` — Returns recent orders from PostgreSQL
4. `https://<your-service>/api/orders/stats` — Returns aggregate metrics
5. `https://<your-service>/dashboard` — AG Grid dashboard (read-only)

This project is a demo deployment, not a production-grade payment system. The backend is designed for sandbox checkout, a read-only public summary, and demonstration only.

## Production persistence, access, and scaling guardrails

- `NODE_ENV=production` requires `DATABASE_URL` and defaults `REQUIRE_PERSISTENCE=true`; the process refuses to boot into volatile storage. Production PostgreSQL TLS defaults to certificate verification. Set `DATABASE_SSL_CA` when the database uses a private CA. The Render Blueprint uses the private same-region DB URL and explicitly sets `DATABASE_SSL=false`; do not reuse that exception for public database endpoints.
- The merchant dashboard is private unless `DASHBOARD_PUBLIC=true` is explicitly set. Only use public mode with sanitized demo data.
- Daily policy spend limits are currently attached to the anonymous server session/user identity, not a verified shopper account. They are not an account-wide limit.
- Some queues, caches, and coordination maps are process-local. Keep one backend instance until those components use shared atomic persistence/coordination; managed PostgreSQL does not automatically make every in-memory path multi-instance safe.
- Automation delivery is best-effort and lacks a transactional outbox/exactly-once guarantee. Reconcile refunds and provider payment state manually; see `PRIORITY_PLAN_IMPLEMENTATION.md` for the pre-demo checklist.


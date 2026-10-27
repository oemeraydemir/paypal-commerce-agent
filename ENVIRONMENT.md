# Environment and configuration

The backend reads `.env` from `source/apps/backend` in local development or
environment variables from its deployment platform. Copy `.env.example` to
`.env`; never commit the populated file.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production`. Production requires valid PayPal sandbox credentials. |
| `PORT` | No | `3000` | Local Express port. |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Explicit allowed browser origin; native Flutter requests do not use CORS. |
| `DATABASE_URL` | **Yes (Production)** | — | PostgreSQL connection string. Ensures durable storage and crash recovery. |
| `REQUIRE_PERSISTENCE` | No | `false` | Set `true` in production to reject startup if DB is unreachable. |
| `PAYPAL_ENABLED` | No | `false` | Set `true` to enable sandbox checkout. |
| `PAYPAL_CLIENT_ID` | When PayPal is enabled | — | PayPal sandbox REST app ID; required in production. |
| `PAYPAL_CLIENT_SECRET` | When PayPal is enabled | — | PayPal sandbox secret; required in production. |
| `PAYPAL_ENV` | No | `sandbox` | Only `sandbox` is accepted; live payments are unsupported. |
| `PAYPAL_RETURN_URL` | No | Android emulator callback | Defaults to the `RENDER_EXTERNAL_URL` callback on Render. |
| `PAYPAL_CANCEL_URL` | No | Android emulator callback | Defaults to the `RENDER_EXTERNAL_URL` cancellation route on Render. |
| `PAYPAL_WEBHOOK_ID` | No | — | Sandbox webhook ID for signature verification. |
| `MANDATE_SIGNING_KEY` | **Yes (Production)** | — | Ed25519 private key for cryptographically signing cart mandates. |
| `OPENAI_API_KEY` | For AI shopping | — | Server-side OpenAI key; never add to Flutter or commit it. |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | No | — | Fallback AI providers. Ensures high availability if one provider is at capacity. |
| `OPS_COPILOT_ENABLED` | No | `false` | Enables internal operator tools for dashboard debugging. |
| `OPS_COPILOT_KEY` | No | — | API key for the Ops Copilot feature. |
| `RESERVATION_TTL_MS` | No | `1800000` (30 min) | Age after which a pending daily-spend reservation is checked against PayPal by the reconciler. Nothing is released before this, and never without a PayPal lookup (except orders that never reached PayPal). |
| `RESERVATION_MAX_AGE_MS` | No | `86400000` (24 h) | Hard age after which an order that PayPal still reports as buyer-in-progress (`APPROVED`) is cancelled and its reservation released. |
| `RESERVATION_SWEEP_INTERVAL_MS` | No | `60000` | How often the reconciler runs (only when PayPal is enabled). |

The health endpoint (`GET /api/health`) reports whether the AI key and PayPal
sandbox credentials are configured. It does not expose credentials.

In local Android emulator development, checkout returns via
`http://10.0.2.2:3000/api/checkout/return` and
`http://10.0.2.2:3000/api/checkout/cancel`. Set explicit callback URLs when the
backend is hosted or the app is running on a physical device.
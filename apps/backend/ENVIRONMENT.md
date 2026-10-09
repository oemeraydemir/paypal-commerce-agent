# Environment and configuration

The backend reads `.env` from `apps/backend` in local development or
environment variables from its deployment platform. Copy `.env.example` to
`.env`; never commit the populated file.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production`. Production requires valid PayPal sandbox credentials. |
| `PORT` | No | `3000` | Local Express port. |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Explicit allowed browser origin; native Flutter requests do not use CORS. |
| `PAYPAL_ENABLED` | No | `false` | Set `true` to enable sandbox checkout. |
| `PAYPAL_CLIENT_ID` | When PayPal is enabled | — | PayPal sandbox REST app ID; required in production. |
| `PAYPAL_CLIENT_SECRET` | When PayPal is enabled | — | PayPal sandbox secret; required in production. |
| `PAYPAL_ENV` | No | `sandbox` | Only `sandbox` is accepted; live payments are unsupported. |
| `PAYPAL_RETURN_URL` | No | Android emulator callback | Defaults to the `RENDER_EXTERNAL_URL` callback on Render. |
| `PAYPAL_CANCEL_URL` | No | Android emulator callback | Defaults to the `RENDER_EXTERNAL_URL` cancellation route on Render. |
| `PAYPAL_WEBHOOK_ID` | No | — | Sandbox webhook ID for signature verification. |
| `OPENAI_API_KEY` | For AI shopping | — | Server-side OpenAI key; never add to Flutter or commit it. |

The health endpoint (`GET /api/health`) reports whether the AI key and PayPal
sandbox credentials are configured. It does not expose credentials.

In local Android emulator development, checkout returns via
`http://10.0.2.2:3000/api/checkout/return` and
`http://10.0.2.2:3000/api/checkout/cancel`. Set explicit callback URLs when the
backend is hosted or the app is running on a physical device.

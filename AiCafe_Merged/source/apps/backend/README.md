# AI Café — Commerce Backend

The API for AI Café: an AI shopping agent and PayPal sandbox checkout demo.
The OpenAI agent discovers catalog products and prepares carts at
catalog-owned prices. PayPal Orders are created and captured by the server
only after the shopper explicitly approves the order in PayPal sandbox.

## Quick start

```powershell
cd source/apps/backend
npm install
Copy-Item .env.example .env
```

Edit `.env` on your machine; never commit it:

- Add `OPENAI_API_KEY` to enable the AI assistant.
- Set `PAYPAL_ENABLED=true` and add sandbox `PAYPAL_CLIENT_ID` and
  `PAYPAL_CLIENT_SECRET` to enable checkout.
- Keep `PAYPAL_ENV=sandbox`. Live PayPal mode is intentionally unsupported.
- Local Android emulator return URLs are configured by default; use your
  public HTTPS backend URL for a hosted demo.

Start the backend:

```powershell
npm run dev
```

See the repository [README](../../../README.md) for the full Flutter setup,
configuration, test commands, and demo flow.

## Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Run with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run the compiled server |
| `npm test` | Run unit and integration tests |
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Run API integration tests |
| `npm run e2e:smoke` | Optional sandbox API smoke test (requires credentials) |

## API

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | Backend, AI, and PayPal sandbox readiness |
| GET | `/api/catalog` | Available products with authoritative prices |
| GET | `/api/ops/status` | Whether the read-only Ops Copilot is enabled, and which tools it may use |
| GET/POST | `/api/refunds`, `/api/refunds/propose`, `/api/refunds/:id/approve`, `/api/refunds/:id/reject` | Merchant refund queue (`X-Ops-Key`); approve is the only call to PayPal's refund API |
| POST | `/api/ops/ask` | Ops Copilot question (`X-Ops-Key` required; PayPal Agent Toolkit, read permissions only) |
| POST | `/api/policy/preview` | Session-scoped, side-effect-free policy decision and per-rule checks for a cart (same engine as order creation) |
| GET | `/api/catalog/search?query=&category=&dietary=&maxPriceMinor=` | Free-text and structured search |
| POST | `/api/ai/chat` | AI product discovery and cart preparation |
| POST | `/api/orders/create` | Create a PayPal sandbox order |
| POST | `/api/orders/:orderId/capture` | Capture a buyer-approved order |
| GET | `/api/checkout/return` | Return from PayPal to the mobile app |
| GET | `/api/checkout/cancel` | Return after cancelling PayPal checkout |
| GET | `/dashboard` | Read-only AG Grid order dashboard |

## Graceful degradation (when the AI is unavailable)

The AI is an *assistant*, never a dependency of the money path. If every
configured AI provider is exhausted or unconfigured, the backend does **not**
fail the shop:

- The AI client tries each provider in order. When all are exhausted it raises
  `503 AI_UNAVAILABLE`; `/api/ai/chat` then degrades to a **labelled rule-based
  planner** instead of a dead end.
- The rule-based response carries `mode: "rule-based"` and `provider: "rule-based"`.
  It is explicitly *not* AI: it never marks the session as AI-prepared (the order
  stays attributed `HUMAN`) and records no `AI_AGENT` policy event.
- Prices still come from the server-side catalog, and the **same deterministic
  policy engine** (`PolicyService`) is consulted for the decision. The rule-based
  planner never sees PayPal and cannot create or capture an order.

So: **if the AI crashes, the system does not crash — the server rules take over.**
Policy enforcement, order creation, PayPal checkout and capture are all
independent of the LLM. The trust guarantees (server-set prices, buyer approval
at PayPal, signed evidence) hold with or without AI.

## Security and demo boundaries

- AI tools can search products and prepare a cart; they cannot create or
  capture PayPal orders.
- The backend calculates all prices from its product catalog.
- Checkout creates a PayPal order in sandbox, then requires explicit buyer
  approval before server-side capture.
- PayPal credentials and the OpenAI key stay on the backend in `.env`.
- Order storage is in-memory and resets on restart. This is a hackathon
  prototype, not a production payment service.

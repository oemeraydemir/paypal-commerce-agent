# AI Café

**Shop by intent. Review every item. Approve every payment.**
**Niyete göre alışveriş · Her ürünü incele · Her ödemeyi onayla.**

An agentic-commerce prototype for the *PayPal + AI hackathon*. A shopper describes what they want and
what they can spend. An AI agent searches the catalog and prepares a cart, but **it can never move
money**: prices come from the server, a spending policy is enforced on the server, and only the human
can approve the payment on PayPal (sandbox). Merchants get an AG Grid dashboard and a human-approved
refund queue. External AI agents can shop through an MCP server.

- **Live demo (free-tier Render deployment, may be asleep):** https://paypal-commerce-agent.onrender.com — first load can take ~60 s while the instance wakes. If it does not respond, run it locally (see Quick start) — the same code runs with no keys needed.
- **For judges:** **[docs/JUDGING.md](docs/JUDGING.md)** maps the judging criteria to code, tests and evidence; [docs/PLATFORM_STATUS.md](docs/PLATFORM_STATUS.md) separates what was verified for the web app from the Flutter app; [docs/PAYMENT_E2E.md](docs/PAYMENT_E2E.md) is the repeatable Sandbox payment check.
- **License:** MIT · **More detail:** [docs/DETAILS.md](./docs/DETAILS.md) · [Architecture](./ARCHITECTURE.md)

## Quick start (local, ~2 minutes, no keys needed)

Requires **Node.js 20+**.

```bash
git clone https://github.com/oemeraydemir/paypal-commerce-agent.git
cd paypal-commerce-agent/source/apps/backend
npm install
npm run dev          # open http://localhost:3000   (dashboard: /dashboard.html)
```

Without keys you can browse the 25-item menu, build carts, watch the server-side policy verdict
(`AUTO_ALLOW` / `REQUIRE_CONFIRMATION` / `BLOCK`) and use the dashboard. The chat falls back to a clearly
labelled **rule-based planner (no AI)**. Checkout answers `503 PayPal not configured`.

## Turn on the real integrations

Copy `source/apps/backend/.env.example` to `.env` (never commit `.env`) and set:

| Purpose | Variables (names only) |
|---|---|
| PayPal **sandbox** (required for checkout/refunds) | `PAYPAL_ENABLED=true`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_RETURN_URL`, `PAYPAL_CANCEL_URL` |
| AI (one is enough) | `GEMINI_API_KEY` or `GROQ_API_KEY` (optional: `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `AI_PROVIDER_ORDER`) |
| Durable storage | `DATABASE_URL` (PostgreSQL 14+), optional `DATABASE_SSL`, `REQUIRE_PERSISTENCE` |
| Merchant dashboard / refunds | `OPS_COPILOT_ENABLED=true`, `OPS_COPILOT_KEY` (16+ chars) |
| Another business | `BUSINESS_PROFILE_PATH` (see below) |
| Discovery / mandates / automation | `PUBLIC_BASE_URL` (required in production; `RENDER_EXTERNAL_URL` is accepted), `MANDATE_SIGNING_KEY` (required in production), optional `MANDATE_PREVIOUS_PUBLIC_KEYS`, optional `AUTOMATION_WEBHOOK_URL` / `AUTOMATION_WEBHOOK_SECRET` |

The PayPal environment is hard-wired to **sandbox**: live money cannot be configured.
Create a sandbox app and a *personal* (buyer) sandbox account in the PayPal Developer Dashboard. For local
browser runs set `PAYPAL_RETURN_URL=http://localhost:3000/api/checkout/return` and
`PAYPAL_CANCEL_URL=http://localhost:3000/api/checkout/cancel`. Webhooks need a public URL (e.g. the Render
deployment); `npm run register-webhook` registers it.

### Real sandbox payment + refund, step by step

```bash
npm run dev                                   # terminal 1 (PayPal enabled in .env)
npm run e2e:sandbox -- http://localhost:3000  # terminal 2: policy BLOCK, EUR 13.00 order, prints the PayPal approval link
```
Open the printed link, log in with your **sandbox buyer** account, approve; the script waits for `PAID`.
Then open `/dashboard.html`, enter the merchant key, propose a (partial) refund for that order and press
**Approve & refund**. Confirm the amounts in the refund queue and in the PayPal sandbox dashboard.

## PostgreSQL

Migrations run automatically at boot (forward-only, advisory-locked). To prepare ahead:
`DATABASE_URL=postgres://… npm run db:migrate`. `GET /api/health` reports `storage: { mode, durable }`.
Without `DATABASE_URL` everything is in memory and lost on restart. See [docs/DATABASE.md](./docs/DATABASE.md).

## Tests — what is real and what is mocked

```bash
cd source/apps/backend
npm test                       # unit + integration: PayPal and AI are MOCKED, PostgreSQL is emulated (pg-mem)
npm run test:browser           # real headless Chrome + AG Grid, fixture data
                                 # needs `npm install --no-save playwright-core` and CHROME_PATH set;
                                 # otherwise the 5 tests are SKIPPED, which is not a pass
DATABASE_URL=… npm run test:smoke                      # REAL PostgreSQL migrations
SMOKE_REQUIRE_REAL=1 DATABASE_URL=… PAYPAL_ENABLED=true … npm run test:smoke   # fails if anything was skipped
cd ../flutter_app && flutter pub get && flutter analyze && flutter test
```
A skipped smoke test is reported as **BLOCKED — not verified**, never as a pass. The mocked suite proves
logic, not PayPal behaviour; only the sandbox flow above proves the real integration.

## What it does

- **AI agent** (Gemini → Groq → … → OpenAI chain) with catalog/cart tools only — no payment tool exists.
- **Server-owned policy**: per-purchase limit, approval threshold, daily budget, blocked dietary attributes.
- **PayPal Orders API** (sandbox): create, human approval, capture, signature-verified webhooks, idempotency.
- **Human-approved refunds**: AI/merchant *proposes*; only an authenticated merchant approval calls PayPal;
  write-ahead state, crash recovery and capture-total reconciliation.
- **MCP server** (`/api/mcp`): external agents can search, prepare a cart and start checkout — never pay.
- **Ops Copilot**: read-only PayPal Agent Toolkit assistant (off by default).
- **Signed Cart Mandate** (custom audit record, not AP2): every order has an Ed25519-signed, tamper-evident record of what was proposed and who held payment authority (`/api/mandates/verify`, `/.well-known/mandate-keys.json`). Set `MANDATE_SIGNING_KEY` (`npm run mandate:keygen`) so it survives restarts — **required when `NODE_ENV=production`** (the server refuses to start without it); after a rotation list the old *public* key in `MANDATE_PREVIOUS_PUBLIC_KEYS` so older mandates stay verifiable. An invalid key stops the server from starting.
- **Agent discovery** (custom `aicafe.*` formats, public, read-only; not an official PayPal Agent Ready / Store Sync / AP2 integration): `/.well-known/agent-commerce.json` is the single canonical manifest (guardrails: the agent cannot pay, capture or refund; policy limits; MCP tool names taken from the real registry). `/.well-known/agent.json` and `/llms.txt` are generated from it, and `/api/feed/products` is a schema.org-style product feed with server catalog prices. URLs come from `PUBLIC_BASE_URL`, never from request headers in production. Details: [docs/AGENTIC_FEATURES.md](docs/AGENTIC_FEATURES.md).
- **Automation events (optional, not production-grade)**: signed `order.paid` / `order.policy_blocked` / `refund.completed` POSTs to a public https Zapier/n8n/Make URL. In-memory only, no outbox: events can be lost or repeated, so consumers must dedupe on the event id and check the timestamped HMAC. Private, loopback and link-local destinations are refused.
- **AG Grid dashboard**, Flutter Android/iOS shopper app, OpenAPI spec and Postman collection.

## Other businesses — honest scope

The catalog, currency, limits and brand come from a profile file. **One deployment serves exactly one
merchant**; there is no multi-tenancy, no accounts and no per-request merchant context. A second business means a
second deployment with its own profile and PayPal credentials.

```bash
npm run profile:validate -- examples/business-profiles/corner-bakery.json   # checks the file, prints effective limits
BUSINESS_PROFILE_PATH=examples/business-profiles/corner-bakery.json npm run dev
```

Four ready-made merchants show that the same code is not café-only (each is validated and booted by a test):

| Profile file | Business | Currency | Kind |
|---|---|---|---|
| `corner-bakery.json` | Corner Bakery | EUR | food and drinks |
| `city-bike-repair.json` | City Bike Repair | EUR | services and parts |
| `indie-bookshop.json` | Paper & Ink Books | USD | physical goods |
| `language-school.json` | Lingua Language School | GBP | lessons and courses |

The rule-based assistant (used when no AI key is set) also understands these catalogs by product name; with an AI key the model searches the catalog through the same server-side tools.

Format and limits: [docs/MERCHANTS.md](./docs/MERCHANTS.md). The profile's `maxOrderValueMinor` is the real
per-purchase limit for custom merchants (the built-in AI Café keeps its EUR 20 demo limit).

## Known limitations

Single instance only; `/api/orders` is a public read-only demo endpoint; PayPal sandbox only. Full list:
[docs/KNOWN_LIMITATIONS.md](./docs/KNOWN_LIMITATIONS.md).

## Screenshots

Screenshots are captured from a running instance, not from design mocks. The capture guide and
the current inventory (if any) are in [docs/screenshots/README.md](docs/screenshots/README.md).

## Repository layout

```
source/apps/backend      Node.js + TypeScript API, AI agent, MCP server, PayPal, AG Grid dashboard (public/)
source/apps/flutter_app  Flutter Android/iOS shopper app
openapi.json, postman/   API spec and Postman collection
docs/                    Database, merchants, limitations; docs/archive = historical sprint reports
```

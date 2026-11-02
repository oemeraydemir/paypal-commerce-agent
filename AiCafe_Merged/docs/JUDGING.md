# For judges: where to look, and what is verified

AI Café answers one question: *how can an AI agent help someone shop without ever being able to move
their money?* The agent searches a catalog and prepares a cart. Prices come from the server, a spending
policy is enforced on the server, and only the human approves the payment on PayPal (Sandbox).

Live demo: <https://paypal-commerce-agent.onrender.com> (free tier, first load can take about a minute).
Run it locally in about two minutes without any key: see the [README](../README.md#quick-start-local-2-minutes-no-keys-needed).

## Mapping to the judging criteria

| Criterion | What to look at | Evidence |
|---|---|---|
| Technological implementation | PayPal Orders API (create, capture, get), Payments API (refund), signature-verified webhooks, `PayPal-Request-Id` idempotency; AI agent with a provider fallback chain and a hard tool allow-list; MCP server; read-only PayPal Agent Toolkit copilot | `source/apps/backend/src/paypal`, `src/ai`, `src/refunds`, `src/routes/mcp.ts`; `npm test` (PayPal and AI are mocked there, see below) |
| Design | Storefront with chat, policy meter, receipt timeline; AG Grid dashboard; Flutter shopper app | `/`, `/dashboard.html`, `source/apps/flutter_app` |
| Potential impact | A merchant can let an AI agent talk to shoppers without giving it payment power; the same guardrails apply to external agents over MCP | [README](../README.md), [MERCHANTS.md](./MERCHANTS.md) |
| Innovation | Agent can *prepare* but structurally cannot *pay*: no payment tool exists, the server re-evaluates policy on checkout, refunds are *proposed* by AI and *approved* by a merchant | [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md#deliberate-design-decisions) |
| Presentation | 3-minute script and checklist | [DEMO_VIDEO_SCRIPT.md](../DEMO_VIDEO_SCRIPT.md), [DEMO_CHECKLIST.md](../DEMO_CHECKLIST.md) |

## A two-minute path for each kind of reviewer

- **PayPal integration.** `npm run e2e:sandbox -- http://localhost:3000` creates a policy-blocked cart and a
  EUR 13.00 Sandbox order and prints the approval link. After approval the script waits for `PAID`.
  Capture errors are classified from the real SDK error shape (`src/paypal/errors.ts`,
  `tests/unit/paypal-errors.test.ts`): `ORDER_NOT_APPROVED` is a retryable 400, `INSTRUMENT_DECLINED` is a 402
  that releases the budget reservation, `ORDER_ALREADY_CAPTURED` is settled from PayPal's real state.
- **Agentic commerce.** `npm run mcp:demo` runs an external agent against the MCP server: it can search,
  prepare a cart and start a checkout, and the tool list has no pay, capture or refund tool.
- **AG Grid (Community edition).** `/dashboard.html`: orders and policy-event grids with sorting, per-column filters
  (text, number, date), pagination, pinned columns, CSV export, keyboard/screen-reader labels (tested in a real
  browser), a row side panel (reason and violated rules), 5 s live refresh and a refund queue. Revenue is shown net
  of approved refunds. Row grouping and the status bar are AG Grid *Enterprise* features and are deliberately not used.
- **Agentic commerce, audit trail.** `GET /api/orders/:id/mandate` returns an Ed25519-signed **Cart Mandate** (items, server prices, origin, "agent may not authorize payment"); `POST /api/mandates/verify` checks it without a session; keys at `/.well-known/mandate-keys.json`. Keys can be rotated without invalidating older mandates (`MANDATE_PREVIOUS_PUBLIC_KEYS`). Not an AP2 implementation; it moves no money.
- **Agent discovery.** `curl <url>/.well-known/agent-commerce.json` is the single canonical, keyless manifest (guardrails, policy limits, MCP tool names); `/.well-known/agent.json` and `/llms.txt` are generated from it, and `/api/feed/products` is a schema.org-style product feed. Custom formats, not an official PayPal Agent Ready / Store Sync / AP2 integration. `tests/integration/discovery.test.ts` checks the manifest tool list against the real MCP `tools/list`, that feed prices equal catalog prices, and that production never derives URLs from the Host header.
- **Merchant automation (optional, not production-grade).** With `AUTOMATION_WEBHOOK_URL` set, `order.paid`, `order.policy_blocked` and `refund.completed` are POSTed as JSON with a timestamped HMAC. Private/loopback/link-local destinations and redirects are refused; delivery is in-memory best-effort (events can be lost or repeated; dedupe on the event id). Not verified against a live Zap.
- **API tooling (Postman / APIMatic).** `openapi.json` and `postman/` describe the public API, including the
  `provider`, `model`, `modelCalls` and `fallback` fields every AI response carries.
- **Render.** One web service serves the API, storefront and dashboard; `render.yaml` provisions a PostgreSQL
  database and sets `REQUIRE_PERSISTENCE=true`, so the service refuses to boot without durable storage.

## What is verified, and how

| Claim | How it was checked | Real PayPal / real AI? |
|---|---|---|
| Server-side pricing, policy BLOCK not bypassable, session ownership | Automated tests and an HTTP audit against local and Render | No (policy and sessions have no external dependency) |
| Sandbox order creation, buyer approval, capture, `PAID`, partial refund, signed webhook delivery | Audit run `2026-10-19-run-02` (Android emulator and web; three Sandbox payments, one partial refund) | Yes, PayPal Sandbox |
| Capture error classification, refund reconciliation, durable webhook ids, AI turn limits | Unit and integration tests against the real SDK error shape and PayPal v2 response shapes; the refund lookup and capture-error mapping have **not** been exercised against live Sandbox responses since the fix | Mocked |
| Webhook ids, sessions and one-open-refund rule on real PostgreSQL 16, restart survival, refusal to boot without a database | `tests/smoke/pg-durability.test.ts`, `pg-migrate.test.ts` against a local PostgreSQL 16, plus a real server restart with a session minted before it (2026-10-20) | PostgreSQL real, PayPal not involved. **Not** the Render database |
| Cross-instance capture claim, transaction rollback, DB outage | `pg-durability` and `pg-capture-claim-route` on local PostgreSQL 16 | PostgreSQL real, PayPal mocked |
| Postman collection (58 requests, 73 assertions, 0 failed in both dashboard modes; measured 2026-10-25) | `newman` against a locally started server without PayPal or AI keys; steps that need Sandbox credentials only assert that nothing succeeds | No PayPal, no AI |
| Provider fallback chain | 17 controlled-failure tests | Mocked |
| AI behaviour on real models | Audit run: Groq passed the budget-cart and step-limit scenarios; Gemini, OpenAI and OpenRouter were not usable on the audited keys | Yes, Groq only |

`npm test` proves logic, not PayPal behaviour: only the Sandbox flow proves the real integration. A skipped
smoke test is reported as BLOCKED, never as a pass.

## Honest limits

Single instance; PayPal Sandbox only; the dashboard and `GET /api/orders` are a public read-only demo
endpoint; the Flutter app labels rule-based answers and, since the last change, backup-provider answers, but that code was written without a Flutter SDK and has not been compiled or run. The complete list is in
[KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

- **AG Grid:** Community features only (sort, filter, pagination, pinning, CSV export). Row grouping and the status bar are Enterprise features and are not used.
- **Zapier:** the automation events are shaped for a Catch Hook ("compatible with"). They have not been tested against a live Zap, and delivery is best-effort, not durable.
- **Sponsor tools not used:** Bryntum, Channel3 and Elastic were deliberately not integrated; a 25-item café menu needs no scheduler or product-search index, and a token integration would not be a meaningful use.
- **Flutter and the live payment flow:** see [PLATFORM_STATUS.md](./PLATFORM_STATUS.md) for what was run, by whom and when; the buyer-approval, capture, webhook-replay and refund sequence has a repeatable procedure in [PAYMENT_E2E.md](./PAYMENT_E2E.md).

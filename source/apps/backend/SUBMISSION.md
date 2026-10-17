# Hackathon submission notes

## Project

**AI Café — Agentic commerce with human-authorized PayPal checkout**

### Short description

AI Café helps shoppers order by describing what they want. An AI shopping agent
(an OpenAI-compatible provider chain — a free Groq or Gemini key is enough, and
OpenAI is optional) searches a café
catalog and prepares a cart using prices provided by the backend. Shoppers review the cart and approve payment in PayPal
sandbox. The agent cannot set prices, access PayPal, or authorize payment.
Orders then appear in a live AG Grid operations dashboard.

### Problem and impact

Online shopping makes customers translate everyday requests into searches,
filters, product comparisons, and cart edits. AI Café demonstrates a faster,
conversational alternative for a concrete café use case while keeping the
customer—not the agent—in control of the financial decision.

### What judges can try

1. Open the live demo or start the backend and open `http://localhost:3000` in a browser (or use the Flutter app), per the root README.
2. Without any credentials, click the **Try a scenario** buttons and watch the server-side policy
   meter: EUR 13 needs approval, EUR 3 is auto-allowed, EUR 55, a EUR 38 team order and alcohol are blocked.
   With one AI provider key configured (a free Groq or Gemini key is enough), ask for a vegetarian breakfast for two with a €20 budget.
3. Review the AI-generated cart and add or remove items.
4. Open PayPal sandbox, approve using a sandbox buyer, return to AI Café, and
   confirm payment capture.
5. View the resulting order in the AG Grid dashboard.
6. Agentic commerce: run `npm run mcp:demo` (or point the MCP Inspector / `claude mcp add --transport http
   ai-cafe <url>/api/mcp` at the server) and watch an external agent search, get a policy BLOCK, shrink its
   cart and obtain a PayPal approval link it cannot pay.
7. In the dashboard's **Ops Copilot** panel, paste the shared `OPS_COPILOT_KEY` into **Ops access key**
   and ask "which payments were blocked today and why?". Then ask "propose a refund for my last paid order" — the copilot only adds a request to the **Refund queue**; approve or reject it there (that approval is the only thing that calls PayPal's refund API).

The backend must be configured with at least one AI provider key (a free Groq or
Gemini key is enough; OpenAI is optional) and PayPal sandbox credentials for
the complete flow. The app shows which services are configured; the catalog
and manual cart can still be explored without credentials.

## Tools and how they are used

- **OpenAI-compatible LLM chain (Gemini → Groq → Cerebras → OpenRouter → OpenAI;
  a free Groq or Gemini key is enough, OpenAI optional):** natural-language
  shopping intent and restricted function calling for product search, product
  detail, and cart preparation. Each provider accepts a comma-separated model
  list with automatic fallback on 429/5xx and on retired models (HTTP 404).
- **PayPal Orders API:** server-side order creation and capture after buyer
  approval in sandbox. No live mode is supported.
- **PayPal Payments API (refunds):** a merchant-approved refund queue. The Ops Copilot can only *propose* a refund (internal `propose_refund` tool, no PayPal access); approving in the dashboard is the only path that calls `refundCapturedPayment`, with a stable PayPal-Request-Id so retries never double-refund.
- **PayPal Agent Toolkit (`@paypal/agent-toolkit`, OpenAI adapter):** powers the merchant Ops Copilot on the
  dashboard. Configured with read permissions only — with that configuration the toolkit advertises
  exactly 8 read-only tools and zero write tools (verified by a test and by a live probe), plus a
  by-name allow-list that refuses any write tool the model asks for. Off by default; **enabled on the
  live demo** with `OPS_COPILOT_ENABLED=true` and an `OPS_COPILOT_KEY`. Judges receive the key through
  the private testing-instructions field and paste it into the dashboard's **Ops access key** box.
- **Model Context Protocol (MCP) server (`/api/mcp`):** lets any external AI agent (Claude, ChatGPT, an
  agent framework, the MCP Inspector) discover the menu, prepare a cart and start a PayPal sandbox
  checkout. It exposes five tools and **no** capture/pay/refund tool (asserted by a test); `start_checkout`
  runs through the normal `/api/orders/create` pipeline (policy, reservation, idempotency) and returns an
  approval link that only a human can use. Scripted proof without any LLM or key: `npm run mcp:demo`.
- **AG Grid:** public, read-only order operations dashboard.
- **Flutter:** Android/iOS shopper application.
- **Node.js, TypeScript, Express:** catalog, AI orchestration, PayPal
  integration, and verified webhook handling.

No additional hackathon sponsor tools are claimed.

## Functional demo

Run the Android emulator demo using the complete instructions in
[the repository README](../../README.md), or use the hosted demo below.

Before submitting, replace the pending values after publishing the
project and recording the demo:

- **Public source repository:** https://github.com/oemeraydemir/paypal-commerce-agent
- **Hosted demo:** https://paypal-commerce-agent.onrender.com (free-tier; first load may take up to 60 s)
- **YouTube demo video (required):** _TODO: add a public YouTube link, under 3 minutes_
- **Team:** _TODO: add the submitting individual or team name_

The source repository is public and has its license visible at the
repository root. See [LICENSE](../../LICENSE). (Verified unauthenticated:
repository page HTTP 200, `LICENSE` blob HTTP 200, GitHub API reports
`"private": false` and license `MIT`.)

## What is PROVEN LIVE (verified on the deployed demo)

- **Health / build SHA match.** `GET /api/health` reports `buildCommit` (the deployed commit SHA);
  on the live demo this matches the deployed commit, so the running build is the reviewed code.
- **Smoke 7/7 (7-check HTTPS smoke).** A 7-check HTTPS smoke against the deployed demo passed **7/7**
  (recorded in `evidence/p3-deploy/REPORT_step4_5.md`, Step 2 — not the local `npm run e2e:smoke`):
  1. `GET /` (storefront) → 200, `text/html`, storefront marker found
  2. Security headers → CSP present (`script-src 'self' … 'nonce-…'`)
  3. `GET /api/catalog` → 200, `count = 25`
  4. `POST /api/sessions` → 201, session id + token issued
  5. `POST /api/policy/preview` (EUR 13) → 200, `totalMinor = 1300`, `decision = REQUIRE_CONFIRMATION`
  6. `POST /api/orders/create` over-limit → 403, `policyDecision = BLOCK`
  7. `GET /api/ops/status` → 200, `enabled = false` *(that run predates enabling the copilot; it now
     reports `true` — see the Ops Copilot entry below)*
- **A €13.00 payment was captured, exactly once.** A live PayPal sandbox payment (order `ca398ad9…`)
  reached status `PAID` with a single capture; no duplicate capture occurred.
- **Webhook delivery was signature-verified.** A genuine PayPal `PAYMENT.CAPTURE.COMPLETED` webhook was
  delivered and accepted (HTTP 200). The endpoint verifies each webhook against PayPal's signature API
  and returns 401 on any invalid signature, so the 200 confirms a verified delivery, and the order was
  marked PAID through that webhook.
- **Live AI chat on the provider-agnostic chain (honest result).** Against the deployed demo, **4 of 8**
  chat calls returned HTTP 200 with correct AI-prepared carts, and the carts that were produced matched
  their own `/api/policy/preview` totals exactly (€20.00 → `REQUIRE_CONFIRMATION`, €6.90 → `AUTO_ALLOW`).
  A prompt-injection request was refused by the model (no tool call; `GET /api/orders` unchanged 0 → 0).
  Rapid back-to-back calls on the **free** provider tiers returned **HTTP 503 `AI_UNAVAILABLE`** — the
  designed graceful degradation (the earlier ungraceful 500 no longer occurs) — and recovered after the
  ~60 s per-provider cooldown. Full detail: `evidence/p11/REPORT.md`.
- **The read-only Ops Copilot is enabled and answers on the live demo.** `GET /api/ops/status` reports
  `enabled = true` (the earlier smoke run recorded `false`). Against the deployed demo, all five probe
  questions returned HTTP 200: "which payments were blocked today and why?" (policy audit trail),
  "list my recent PayPal transactions", "summarise orders by origin", plus the two write requests.
  **"Refund my last order" and "Pay order X" were refused with zero tool calls** (recorded before the refund queue existed; the copilot now answers a refund request by *proposing* it for merchant approval, which has not been re-verified live yet) — no PayPal write was
  ever attempted, and the copilot explained it is read-only. Without a key → `401`; with a wrong key →
  `401`; the 7th request within a minute → `429` (per-IP limit 6/min). Three questions first hit the free
  Groq tier's rate limit and returned `502` in <1 s (provider in cooldown), then returned 200 on retry
  after ~60–90 s — reported as-is, not hidden.
  **Honest caveat:** the PayPal `list_transactions` read returns
  `403 Authorization failed due to insufficient permissions` on this sandbox app, and the copilot reports
  that error instead of inventing data. Detail: `evidence/p13/REPORT.md`.

## What is covered by automated tests ONLY (not proven live)

- **Webhook duplicate handling.** The idempotency/`isDuplicate` guard and capture reconciliation are
  covered by `tests/integration/webhooks.test.ts` and `tests/integration/reservation-consistency.test.ts`,
  but were not exercised by a live redelivery: PayPal delivered the event once (HTTP 200) and did not retry.
  The guard exists and is tested; the live redelivery path was not observed.

## Architecture and operations

- [System architecture](./ARCHITECTURE.md)
- [Run and demo checklist](./DEMO_CHECKLIST.md)
- [Deployment guide](./DEPLOYMENT.md)
- [Backend API and tests](./README.md)

## Devpost draft (≤ 400 words)

**AI Café — agentic commerce where the human stays in control**

*Problem.* Online shopping forces people to translate what they want into filters, comparisons, and
manual cart edits. Meanwhile, giving an AI agent the ability to spend is risky. AI Café shows a safer
model: shop by intent, but never let the agent touch your money.

*What it does.* You tell a café assistant what you want and what you can spend (e.g., "a vegetarian
breakfast for two under €20"). An OpenAI-compatible model interprets the request and calls restricted
catalog-search and cart-preparation tools; the backend—not the model—sets prices and validates
quantities. You review the
cart, then approve payment in PayPal sandbox. Only then does the backend capture and reconcile. A live
AG Grid dashboard shows every order, who prepared it (AI or human), and what the policy decided.

*How it uses PayPal + AI.*

- **PayPal Orders API** — server-side order creation and capture, sandbox only, after explicit buyer approval.
- **PayPal Agent Toolkit (read-only)** — powers a merchant Ops Copilot on the dashboard: configured with
  read permissions only (8 of 47 tools, enforced by a test and a by-name allow-list that refuses any write
  tool), so it can answer "what was blocked today and why?" but can never issue a refund.
- **PayPal Payments API refunds, human-approved** — the Ops Copilot can propose a refund but only a merchant's approval in the dashboard calls PayPal; amounts are validated server-side and retries are idempotent.
- **PayPal checkout as the human-approval boundary for *external* agents (MCP)** — any MCP client can
  shop and start a PayPal sandbox checkout, but no tool can capture or pay: the agent gets a link, the human
  approves in PayPal. Same server-side policy, daily-budget reservation and idempotency as the app.
- **OpenAI-compatible function calling** (a provider chain — Gemini → Groq → Cerebras → OpenRouter →
  OpenAI — with automatic fallback on 429/5xx and retired models; a free Groq or Gemini key is enough and
  OpenAI is optional) — restricted to catalog/cart tools; the model has no PayPal
  credential or payment endpoint.

*Challenges.* Keeping the model from ever influencing money: prices are server-owned, payments require
human approval, and the Ops Copilot is read-only with a refusal path for any write request. Verifying
PayPal's webhook signature and making capture idempotent so retries never double-count were also key.

*What's next.* PayPal Subscriptions for
recurring orders, persisting the refund queue, a merchant-embeddable agent checkout (bring your own catalog), more categories and
languages, and a hosted demo with stable uptime.

## Reliability notes (honest)

- When every AI provider is rate-limited (free tiers), chat degrades to a clearly labelled **rule-based
  Quick Planner** (`"mode": "rule-based"`). It is not AI: it never marks the session AI-prepared (order
  stays `HUMAN`), writes no `AI_AGENT` policy event, never adds alcohol, and prices/policy still come from
  the server. Covered by `tests/unit/fallback-planner.test.ts` and `tests/integration/ai-fallback.test.ts`.
- MCP adapter: `tests/integration/mcp.test.ts` (23 tests). Full backend suite: 393 tests passing.
- The MCP server and the rule-based fallback are covered by automated tests and a local scripted run;
  they have **not** yet been exercised against the deployed Render instance or a third-party MCP client
  — redeploy, then run `npm run mcp:demo -- <url>` and record the result before claiming it as live-proven.

## Prototype limitations

- Orders are persisted in PostgreSQL when `DATABASE_URL` is set (docs/DATABASE.md). Without it they live in memory and disappear on restart. A Free Render Postgres expires after 30 days.
- PayPal webhook delivery requires a publicly reachable HTTPS backend and a
  registered sandbox webhook; local demos can still capture and inspect orders.
- At least one AI provider key (a free Groq or Gemini key is enough; OpenAI is
  optional) and PayPal credentials are required for their respective live sandbox
  flows and must be configured outside source control.
- This is a hackathon prototype, not a production payment service.

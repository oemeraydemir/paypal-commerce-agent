# Known limitations and design decisions

AiCafe is a hackathon prototype built around one question: *how can an AI agent
help someone shop without ever being able to move their money?* This page lists
what is deliberately out of scope and what is simply not done yet, so a reviewer
does not have to discover it.

Every statement below can be checked in the code or the tests named next to it.

## Deliberate design decisions

**Summary guarantee (code-level; sandbox end-to-end flow not yet verified).** The AI agent has no direct payment-execution tools: it can search products, inspect product details and prepare a cart. Non-allowlisted tool calls are rejected. Cart prices and totals are recalculated and validated server-side from the catalog during order creation; client-supplied prices and totals are not trusted. Payment approval takes place through the official PayPal approval flow, and the server marks an order as paid only after validating a successful PayPal capture or an authenticated, amount-matched payment event.

**The AI can prepare a cart, but never pay, capture or refund.**
- The shopping assistant only has catalog/cart tools. A model request for any
  other tool (for example `capture_payment`) is refused before anything runs
  (`tests/integration/ai.test.ts`, "Safety boundary").
- The Ops Copilot uses the PayPal Agent Toolkit with a strict read-only
  allow-list, enforced twice: in the toolkit permissions and again by tool name
  (`src/ops/ops-tools.ts`).
- Payment approval is always a human action in PayPal. The MCP surface can
  *start* a checkout, never approve or capture it.

**The server, not the client or the AI, decides what is allowed.**
- Policy is evaluated on the server in `POST /api/orders/create`, right before
  the PayPal call (`src/routes/orders.ts`). A cart shown in the app is only a
  proposal.
- One settlement gate (`validateCompletedCapture`, `src/paypal/capture-amount.ts`) decides whether an order may
  become PAID, for the capture response, the PayPal order lookup and the signed webhook alike: exactly one
  capture, status COMPLETED, and the capture's OWN amount and currency present and equal to the server-owned
  order. A mismatch, a missing amount or currency, or a non-COMPLETED status keeps the order pending and the
  reservation untouched (loud `PAYMENT_AMOUNT_MISMATCH` / `PAYMENT_CAPTURE_EVIDENCE_INCOMPLETE` log). A held
  webhook is written to the `webhook_reviews` table BEFORE the 2xx; if that write fails the route answers 500 so
  PayPal redelivers. The capture request asks PayPal for the full representation and, when evidence is still
  missing, looks the order up before deciding. The PayPal-Request-Id of a capture is stable per order
  (`capture-<orderId>`), and a retry first asks PayPal what happened: only "approved, nothing captured yet"
  allows a new attempt (`tests/integration/capture-amount-binding.test.ts`, `webhook-amount.test.ts`,
  `webhook-review-hold.test.ts`).
- When all AI providers are unavailable, the assistant falls back to a
  deterministic rule-based planner. The response says so (`mode: "rule-based"`),
  the order is never attributed to an AI agent, and only that one failure code
  triggers the fallback (`tests/integration/ai-fallback.test.ts`,
  `tests/integration/ai-contract.test.ts`).

## Not implemented

**Autonomous refunds.** By design, no AI can issue a refund. The Ops Copilot can only *propose* one;
a merchant approval in the dashboard issues it through PayPal's Payments API (`src/refunds`,
`tests/integration/refunds.test.ts`). Not built: automatic refund policies, refunds triggered by
PayPal dispute events, and shopper-initiated refund requests. The refund queue is durable (`refund_requests`, migration 002): a proposal is stored before it is
acknowledged, `PROCESSING` is stored before PayPal is asked, and a record found `PROCESSING` after a crash is
re-opened as `PROPOSED` with a warning (the refund may already exist). Before retrying, the service
checks the known PayPal refund ID or establishes the already-refunded total from PayPal (capture status
`COMPLETED` = nothing refunded, `REFUNDED` = all, otherwise the order's `payments.refunds` list,
`src/refunds/refunded-total.ts`); if PayPal cannot establish the outcome, it does not resend the request.
The v2 capture lookup has no "total refunded" field of its own, which an earlier version of this code
assumed. The `PayPal-Request-Id` is stable, but its retention
window is unverified and is not relied on as the only duplicate-refund protection. Refunds
that happen outside AI Café (for example in the PayPal dashboard) are only *recognized* when PayPal
reports them (`src/orders/payment-lifecycle.ts`).

**Subscriptions and other PayPal APIs.** Only the Orders API (create, capture, get), the Payments API (refund) and webhook verification are used.

**Single-merchant demo.** One cafe catalog. The architecture does not depend on
that, but multi-merchant onboarding is not built.

## Client limitations

**Policy metadata is not shown in the Flutter app.** The server returns
`policyDecision`, `requiresExplicitApproval` and `reason` with a prepared cart,
but the app does not display them yet, so it cannot explain *why* a cart needs
approval. It does honor the server's `checkoutReady` flag and the `mode` field.

## Accessibility (AG Grid dashboard)

Checked by automated tests, not by assistive technology. Not yet verified: a
real screen reader (NVDA, JAWS, VoiceOver) and real-browser keyboard traversal.
Contrast of badge text is verified programmatically against the blended
background (`tests/unit/dashboard-contrast.test.ts`).

## State and persistence

With `DATABASE_URL` set, orders, spend reservations, sessions and idempotency records are stored in
PostgreSQL (see [DATABASE.md](./DATABASE.md)); without it they live in process memory and are lost on
restart. Refund requests and the last 2000 policy events (dashboard history and AI-share stats) are stored too.
Processed webhook event ids are stored too (`webhook_events`, migration 004; see below). AI chat
history and rate-limit counters stay in memory.

## Public demo endpoints (intentional contract)

`GET /api/orders` and `GET /api/orders/stats` are intentionally unauthenticated so the hosted
dashboard works without a login. The contract is tested
(`tests/integration/public-order-contract.test.ts`): they never return real session ids (only an
opaque `sess_<hash>` label), PayPal order/capture ids, idempotency keys, or PII. They do expose
item names, quantities, totals, timestamps and aggregate revenue for the demo catalog. Before using
this deployment with real customer data, put both endpoints behind merchant authentication.

## Webhook deduplication (precise semantics)

With `DATABASE_URL` set, every processed event id is written to `webhook_events` (migration 004), the
most recent 5000 ids are reloaded at boot, and ids older than 14 days are purged (PayPal redelivers for
about three days). A redelivery after a restart or deploy is therefore recognised and skipped
(`tests/integration/webhook-durable-idempotency.test.ts`). The in-memory guard is set first and
synchronously, so a concurrent redelivery in the same process is already a duplicate; if the database
write fails, the id stays guarded in memory and is retried by the persistence sweeper.

Without a database the set is in memory and process-local (capped at 10 000 ids, trimmed to the newest
5000). A redelivery after a restart is then re-applied, which is safe because every handler is
idempotent: `PAID -> PAID` is a no-op, a `DENIED` event only fails an order that is still
`PAYMENT_PENDING`, and refunds are never driven by webhooks. Two instances sharing one database are
still not coordinated by a database insert-before-process claim; the deployment is single-instance.

## Refund concurrency and the database invariant

- `RefundService.approve()` claims `PROCESSING` synchronously before its first `await`, including
  on the reopened-retry path that reconciles with PayPal first. A concurrent approval sees
  `PROCESSING` and is rejected; a deterministic test proves PayPal is called at most once
  (`tests/integration/refund-persistence.test.ts`).
- Migration 003 adds a partial unique index (`refund_requests_open_uq`) on
  `refund_requests(order_id) WHERE status IN ('PROPOSED','PROCESSING')`, so two instances cannot
  both create an open refund for the same order. The in-memory check remains the fast path.

## Capture request id

Capture uses `capture-${orderId}-${Date.now()}` so a retry after a definitive decline (for example
`INSTRUMENT_DECLINED`) can be attempted again with a fresh request id. Double capture is prevented
by PayPal itself: a retried capture returns `ORDER_ALREADY_CAPTURED`, which the route settles from
PayPal's real state. Refunds, which must be idempotent across retries, use a stable
`aicafe-refund-${id}` request id.

## Deployment

The Render free plan sleeps when idle, so the first request after a pause can
take about a minute. Keep the service warm before a demo.

## AI turn limits

A chat turn is bounded three ways: at most 6 model calls (the last without tools), at most 12 executed
tool calls, and 40 s of wall-clock time. When a ceiling is reached the next model call is made without
tools so the turn still ends with a written answer; surplus parallel tool calls get an error reply so the
transcript stays valid (`tests/integration/ai-turn-limits-observability.test.ts`). The 40 s budget is
checked between model calls; a single provider call is separately capped at 20 s, so the worst case is
bounded but not exactly 40 s.

Every response reports `provider`, `model`, `modelCalls` and `fallback` (also an `X-AI-Provider` header),
and one structured `ai_turn` log line is written per turn with those names and counters only.

## Revenue on the dashboard

The headline revenue is net of merchant-approved refunds; the line below it shows captured and refunded
amounts. `GET /api/orders/stats` keeps `revenueMinor` as the gross captured amount and adds
`refundedMinor` and `netRevenueMinor`. Refunds made outside AI Café (for example in the PayPal
dashboard) are not subtracted until they are recognised through the order lifecycle.

## Rate limits and dependency advisories

`POST /api/policy/preview` (120/min per session, 600/min per IP), `POST /api/orders/create` and
`POST /api/orders/:id/capture` (30/min per session, 120/min per IP) are limited in memory per process; the
AI chat, MCP, refund and ops routes have their own limits. `npm audit --omit=dev` (2026-10-20) reports 8 advisories (1 high, 3 moderate, 4 low). All are
transitive packages of `@paypal/agent-toolkit` (`@langchain/core`, `langsmith`, `uuid`, `ai`, `@ai-sdk/*`),
which only the optional read-only Ops Copilot uses. Findings from inspecting the tree and the code:

- The packages are installed (they are production dependencies of the toolkit), so they are in the
  deployed `node_modules`.
- `src/ops/ops-agent.ts` loads the toolkit with a dynamic `import()` only when the copilot is enabled
  (`OPS_COPILOT_ENABLED=true`); the code in `src/` never imports `langsmith` or `uuid` of those packages
  directly and does not set any LangSmith tracing variable. The high advisory concerns LangSmith tracing
  headers, prompt pulling, streaming redaction and `__proto__` handling, none of which the app calls.
  This is a reachability argument from reading the code, not a proof.
- `npm audit` reports no fix available; the `@langchain/core` override pins 0.3.80 on purpose and a
  forced major upgrade of `langsmith` was not attempted because the toolkit's compatibility with it is
  unknown.
- Mitigation: keep the copilot off unless needed, never set `LANGSMITH_*` variables, re-run `npm audit` and
  update the toolkit when it ships a release that depends on patched versions.

The application is not claimed to be free of known advisories.

## Concurrent capture and more than one instance

Capture is serialised twice: in process (`captureLock`) and, when PostgreSQL is attached, across instances by
a row in `capture_claims` (migration 005; one atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE claimed_at <
cutoff RETURNING`). A second request, in this process or another instance, gets `409 Capture already in
progress` and nothing reaches PayPal; a database error during the claim fails closed with 503. A claim left by
a crashed instance expires after 120 s. Verified with mocked PayPal in `tests/integration/capture-concurrency.test.ts`
and, on a real PostgreSQL 16, in `tests/smoke/pg-durability.test.ts` (ten concurrent claimers, one winner; two
pools standing in for two instances; stale takeover; outage) and `pg-capture-claim-route.test.ts` (HTTP route).
Not verified: two real application processes against the Render database.

Behind both guards PayPal itself still refuses a second capture (`ORDER_ALREADY_CAPTURED`), and the app then
settles the order from PayPal's real state rather than guessing. The capture attempt is written to the
database before PayPal is contacted, so a crash after PayPal captured is finished by the startup
reconciliation. A timeout never marks an order paid and never triggers an uncontrolled second capture. The
PayPal-Request-Id of a capture is unique per attempt on purpose: PayPal's handling of a replayed id after a 4xx
such as `ORDER_NOT_APPROVED` was not verified, and a stable id could make a retry after approval return the
cached rejection.

## Dashboard and order data access

`DASHBOARD_PUBLIC=true` (default, for the judges' demo) leaves `GET /api/orders`, `/api/orders/stats`,
`/api/policy-events` and `/api/policy-events/stats` readable without a key, in a minimised form (no PayPal
order or capture ids, hashed session labels, random order ids, no per-order read route). With
`DASHBOARD_PUBLIC=false` all four need the merchant key (`X-Ops-Key`, the same `OPS_COPILOT_KEY` as the
refund queue); a shopper session is not merchant authorization, guessing is throttled (429) and a missing
key configuration refuses (503) instead of opening up. Use `false` for any deployment with real customers.

## Known gaps in the payment path (from an independent review, 2026-10-26)

Not fixed; each is a deliberate scope decision for the hackathon, listed so nobody assumes otherwise:

- **Checkout idempotency across several backend instances.** The in-flight guard is per process; the stored
  idempotency record is written when the response ends, not claimed atomically at the start. Single-instance
  Render deployment is fine; two instances receiving the same key at the same moment could create two orders.
- **Refund rejection when the database write fails.** The state change is queued for a retry and the dashboard
  gets a success answer; it does not yet report "not persisted".
- **Duplicate-event memory.** The webhook duplicate check consults the newest 5000 event ids in memory.
- **A held webhook has no dashboard view yet.** It is stored in `webhook_reviews` and logged; the merchant
  currently needs the database or the logs to see it.
- **Dashboard default.** In production the dashboard is private unless it is explicitly made public; a missing or
  wrong `NODE_ENV` would change that default.
- **Render PostgreSQL TLS.** Internal Render connections are encrypted but their certificates are not verified;
  `DATABASE_SSL=true` turns verification on and does not work against that certificate. Decide per deployment.
- **Budget semantics.** The shopper's saved budget guides the AI; the checkout limit is the merchant policy, and a
  hand-edited cart can exceed the saved budget while staying inside the merchant limit.
- **Flutter paid-state cleanup.** After the recovery path that returns "already captured", the local cart is not
  cleared the way the normal paid path clears it.

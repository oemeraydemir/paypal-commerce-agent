# Known limitations and design decisions

AiCafe is a hackathon prototype built around one question: *how can an AI agent
help someone shop without ever being able to move their money?* This page lists
what is deliberately out of scope and what is simply not done yet, so a reviewer
does not have to discover it.

Every statement below can be checked in the code or the tests named next to it.

## Deliberate design decisions

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
- When all AI providers are unavailable, the assistant falls back to a
  deterministic rule-based planner. The response says so (`mode: "rule-based"`),
  the order is never attributed to an AI agent, and only that one failure code
  triggers the fallback (`tests/integration/ai-fallback.test.ts`,
  `tests/integration/ai-contract.test.ts`).

## Not implemented

**Refunds.** There is no refund endpoint and no refund method on the PayPal
client. Refunded payments are *recognized* when PayPal reports them
(`src/orders/payment-lifecycle.ts`) but cannot be *issued* from this app. This is
a scope limit, not a security feature: a refund tool would need its own policy
rules, human approval and idempotency before any agent could go near it.

**Subscriptions and other PayPal APIs.** Only the Orders API is used.

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

> Update this section when the persistent-storage work is merged. Until then,
> orders, sessions, policy events and idempotency records live in process memory
> and are lost on restart; do not describe the app as durable.

## Deployment

The Render free plan sleeps when idle, so the first request after a pause can
take about a minute. Keep the service warm before a demo.

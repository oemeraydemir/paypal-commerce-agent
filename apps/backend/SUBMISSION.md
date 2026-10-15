# Hackathon submission notes

## Project

**AI Café — Agentic commerce with human-authorized PayPal checkout**

### Short description

AI Café helps shoppers order by describing what they want. An OpenAI-powered
shopping agent searches a café catalog and prepares a cart using prices
provided by the backend. Shoppers review the cart and approve payment in PayPal
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
   With OpenAI configured, ask for a vegetarian breakfast for two with a €20 budget.
3. Review the AI-generated cart and add or remove items.
4. Open PayPal sandbox, approve using a sandbox buyer, return to AI Café, and
   confirm payment capture.
5. View the resulting order in the AG Grid dashboard.

The backend must be configured with OpenAI and PayPal sandbox credentials for
the complete flow. The app shows which services are configured; the catalog
and manual cart can still be explored without credentials.

## Tools and how they are used

- **OpenAI GPT-4o-mini:** natural-language shopping intent and restricted
  function calling for product search, product detail, and cart preparation.
- **PayPal Orders API:** server-side order creation and capture after buyer
  approval in sandbox. No live mode is supported.
- **PayPal Agent Toolkit (`@paypal/agent-toolkit`, OpenAI adapter):** powers the merchant Ops Copilot on the
  dashboard. Configured with read permissions only (8 of the toolkit's 47 tools, verified by a test), plus
  a by-name allow-list that refuses any write tool the model asks for. Off by default; enabled with
  `OPS_COPILOT_ENABLED` and `OPS_COPILOT_KEY`. Judges receive the key through the private testing-instructions field.
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
repository root. See [LICENSE](../../LICENSE).

## What is PROVEN LIVE (verified on the deployed demo)

- **Health / build SHA match.** `GET /api/health` reports `buildCommit` (the deployed commit SHA);
  on the live demo this matches the deployed commit, so the running build is the reviewed code.
- **Smoke 7/7.** `npm run e2e:smoke` runs 7 local endpoint checks — health, catalog, orders,
  orders/stats, dashboard redirect, webhook health, and webhook unsigned→401 — and passed **7/7** against
  the deployed demo.
- **A €13.00 payment was captured, exactly once.** A live PayPal sandbox payment (order `ca398ad9…`)
  reached status `PAID` with a single capture; no duplicate capture occurred.
- **Webhook delivery was signature-verified.** A genuine PayPal `PAYMENT.CAPTURE.COMPLETED` webhook was
  delivered and accepted (HTTP 200). The endpoint verifies each webhook against PayPal's signature API
  and returns 401 on any invalid signature, so the 200 confirms a verified delivery, and the order was
  marked PAID through that webhook.

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
breakfast for two under €20"). OpenAI interprets the request and calls restricted catalog-search and
cart-preparation tools; the backend—not the model—sets prices and validates quantities. You review the
cart, then approve payment in PayPal sandbox. Only then does the backend capture and reconcile. A live
AG Grid dashboard shows every order, who prepared it (AI or human), and what the policy decided.

*How it uses PayPal + AI.*

- **PayPal Orders API** — server-side order creation and capture, sandbox only, after explicit buyer approval.
- **PayPal Agent Toolkit (read-only)** — powers a merchant Ops Copilot on the dashboard: configured with
  read permissions only (8 of 47 tools, enforced by a test and a by-name allow-list that refuses any write
  tool), so it can answer "what was blocked today and why?" but can never issue a refund.
- **OpenAI function calling** — restricted to catalog/cart tools; the model has no PayPal credential or payment endpoint.

*Challenges.* Keeping the model from ever influencing money: prices are server-owned, payments require
human approval, and the Ops Copilot is read-only with a refusal path for any write request. Verifying
PayPal's webhook signature and making capture idempotent so retries never double-count were also key.

*What's next.* Persisting orders beyond in-memory, adding more categories and languages, and a hosted
demo with stable uptime.

## Prototype limitations

- Orders are stored in memory and disappear when the server restarts.
- PayPal webhook delivery requires a publicly reachable HTTPS backend and a
  registered sandbox webhook; local demos can still capture and inspect orders.
- OpenAI and PayPal credentials are required for their respective live sandbox
  flows and must be configured outside source control.
- This is a hackathon prototype, not a production payment service.

# Architecture Overview

## System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                    Flutter Client                             │
│  (Chat UI + Cart + PayPal Checkout Button)                  │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP (REST)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  Commerce API (Express)                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Catalog      │  │ AI Agent     │  │ Orders       │      │
│  │ (25 products) │  │ (AI+fallback)│  │ (in-memory)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PayPal       │  │ Webhooks     │  │ Dashboard    │      │
│  │ Client       │  │ (verify-sig) │  │ (AG Grid)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow

1. The user enters a natural-language shopping prompt in the Flutter app.
2. The app calls `POST /api/ai/chat`.
3. The backend AI agent uses function calling to discover products and build a `preparedCart`.
4. The user confirms the cart in the client.
5. The client calls `POST /api/orders/create`.
6. The backend creates a server-owned order and derives origin from trusted internal state.
7. The backend creates a PayPal order using the Orders API.
8. The app opens the approval URL and the user approves checkout in the PayPal sandbox flow.
9. The app captures the PayPal payment.
10. PayPal sends a webhook event such as `PAYMENT.CAPTURE.COMPLETED`.
11. The backend verifies the webhook signature and reconciles the order to `PAID`.
12. The AG Grid dashboard reads the same authoritative orders source and updates with new metrics.

## External agents: MCP adapter

`routes/mcp.ts` exposes the café as an MCP server (Streamable HTTP, JSON-RPC 2.0) at `POST /api/mcp`.
It is a thin adapter, not a second implementation: read-only tools reuse the same `executeTool` /
policy-preview code as the web agent, and `start_checkout` calls the normal `/api/orders/create`
endpoint over loopback, so session auth, idempotency, the spending policy, daily-spend reservations and
PayPal idempotency are shared. There is intentionally no capture/pay/refund tool; the agent only receives
an approval link that a human must open. Orders it prepares are attributed `AI_AGENT` server-side.

```text
External agent ──MCP──▶ /api/mcp ──▶ search_menu / prepare_cart / check_policy  (read-only, server prices)
                                 └─▶ start_checkout ─▶ /api/orders/create ─▶ policy ─▶ PayPal (sandbox)
                                                                 │
                                          human opens approvalUrl, approves, confirms capture in the app
```

## Graceful degradation: rule-based planner

If every AI provider is exhausted (`503 AI_UNAVAILABLE`) `routes/ai.ts` answers with
`ai/fallback-planner.ts`: a pure, deterministic planner (budget / head-count / dietary / category parsing).
It is labelled `mode: "rule-based"`, never marks the session AI-prepared (order origin stays `HUMAN`),
records no `AI_AGENT` policy event, never adds alcohol, and still gets prices and the policy decision
from the server. Unrelated AI errors are not masked.

## Safety Boundaries

### 1. Pricing Authority

The catalog is the single source of truth for product pricing. The AI is never allowed to set prices or override the authoritative catalog totals.

### 2. Payment Authority

The AI agent has no direct access to PayPal APIs. It can only prepare a cart and return recommended items; payment execution remains human-authorized and server-driven.

### 3. Human Confirmation

Payment requires an explicit user action before the backend creates the PayPal capture flow. AI assistance ends before money movement begins.

### 4. Webhook Verification

Every webhook is verified with PayPal's signature verification API before it changes an order state.

### 5. Idempotency

The backend applies dual-layer idempotency to prevent duplicate charges and repeated processing of the same request.

## Key Design Decisions

- In-memory storage for a hackathon environment; no database required
- PayPal sandbox by default for safe demo usage
- No authentication on the public dashboard; demo-only read-only access
- AG Grid served via CDN to keep the dashboard simple and static
- Cross-platform smoke tests using TypeScript so they run on Windows, macOS, and Linux

## Order Attribution Rule

The system must preserve the critical invariant:

```text
prepare_cart → user confirmation → create order → origin === AI_AGENT
```

This is enforced server-side and not by trusting client-supplied origin values. The dashboard metrics and analytics rely on `OrderOrigin.AI_AGENT` as the authoritative source of truth.

## Technical Summary

- AI agent: OpenAI-compatible LLM chain with function calling — Gemini → Groq → Cerebras → OpenRouter → OpenAI, with automatic fallback on 429/5xx and retired models (a free Groq or Gemini key is enough; OpenAI is optional)
- API: Node.js + TypeScript + Express
- Payment: PayPal Orders API + webhooks
- Client: Flutter app for chat and checkout
- Dashboard: AG Grid 33.0.0 (CDN, Theming API)
- Storage: in-memory singleton order service


## Reservation lifecycle and operational assumptions

Daily-spend reservations are created in `POST /api/orders/create` before PayPal
is contacted and are settled by `src/orders/payment-lifecycle.ts`. PayPal is
the source of truth for money; every transition is idempotent.

- Confirmed on a COMPLETED capture (capture response, `PAYMENT.CAPTURE.COMPLETED`
  webhook, or a PayPal order lookup). Released on a definitive failure
  (declined capture, `PAYMENT.CAPTURE.DENIED`, explicit cancel verified at PayPal).
- Ambiguous outcomes (network error, PENDING capture, unknown status, failed
  lookup) never release a reservation.
- After `RESERVATION_TTL_MS` (default 30 min) a periodic sweep asks PayPal for the
  real order state. Never-approved orders are expired and cancelled; the capture
  route then refuses them. Orders PayPal reports as `APPROVED` (buyer mid-flow)
  are kept until `RESERVATION_MAX_AGE_MS` (default 24 h), then expired and
  cancelled. If a capture was nevertheless completed at PayPal, a late
  webhook or lookup still marks the order PAID and books the spend.
- A late capture response or webhook never moves a PAID order backwards.

### Single-instance assumption

All state (orders, reservations, webhook de-duplication, capture locks, rate
limits) lives in the memory of ONE Node.js process. The capture lock and the
sweeper's overlap guard are process-local; running two instances (horizontal
scaling, rolling deploys with overlap) can double-process the same order. Run
exactly one instance (the Render blueprint uses a single free-plan instance).

### Known limits that require persistent storage

- After a restart, a real PayPal payment whose order is no longer in memory
  cannot be attached to an order. The webhook is acknowledged and an
  `UNRECONCILED_PAYMENT_EVENT` error is logged; the payment is not reflected in
  the app or the dashboard.
- Reservations pending at restart are forgotten, so the daily limit can be
  exceeded by orders that were pending at that moment.

### Not verified against real PayPal

The lifecycle is tested against simulated PayPal responses only. No real
PayPal Sandbox run has been performed for it yet.

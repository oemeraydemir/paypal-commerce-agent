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
│  │ (8 products) │  │ (GPT-4o-mini)│  │ (in-memory)  │      │
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

- AI agent: OpenAI GPT-4o-mini with function calling
- API: Node.js + TypeScript + Express
- Payment: PayPal Orders API + webhooks
- Client: Flutter app for chat and checkout
- Dashboard: AG Grid 31.0.0 (CDN)
- Storage: in-memory singleton order service

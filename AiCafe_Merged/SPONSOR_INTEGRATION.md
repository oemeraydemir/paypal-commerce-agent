# Sponsor Integration — Postman / APIMatic

This document describes **only what currently exists in this repository** and how
it can be presented to a sponsor via Postman or APIMatic. It does **not** claim
that any SDK has been generated, that a sponsor integration is live, or that any
API is in production — none of those steps have been performed here.

## What is verified in this repo

| Artifact | Path | Verified state |
|---|---|---|
| OpenAPI spec | `openapi.json` | Valid JSON. Title: "AI Café — PayPal Commerce Agent API", version 1.0.0. | 34 documented paths covering catalog, AI chat, policy preview, orders (create / capture / cancel), sessions, checkout return/cancel, dashboard/ops, refunds, mandates, discovery (agent commerce / feed) and the MCP endpoint. |
| Postman collection | `postman/paypal-commerce-agent.postman_collection.json` | Present; a runnable collection for the endpoints above. |
| Postman environment | `postman/paypal-commerce-agent.postman_environment.json` | Present; contains environment variables (e.g. base URL, session/paypal placeholders) for the collection. |

## Presenting as a Postman Collection

1. **Import the spec (recommended):** In Postman choose *File → Import → Link or
   file* and select `openapi.json`. Postman generates a collection with request
   examples and a schema-derived structure. This keeps the collection in sync
   with the code that defines the API.
2. **Import the existing collection:** alternatively select
   `postman/paypal-commerce-agent.postman_collection.json` directly. It is ready
   to run once the environment is selected.
3. **Use the environment:** import `postman/paypal-commerce-agent.postman_environment.json`,
   set the `baseUrl` to a running backend (local `http://localhost:3000` or a
   deployed URL) and supply session values as the API issues them.
4. **Demo flow to show:** `POST /api/sessions` → `GET /api/catalog` →
   `POST /api/ai/chat` (returns a prepared cart + policy decision) →
   `POST /api/policy/preview` → `POST /api/orders/create` →
   `POST /api/orders/{orderId}/capture`. Checkout/capture require the PayPal
   sandbox flow (see `README.md`).

## Presenting via APIMatic

APIMatic consumes an OpenAPI spec to generate client SDKs across languages.

1. Import `openapi.json` into the APIMatic dashboard (File → Import OpenAPI).
2. The platform will validate the spec and produce SDKs (e.g. Dart, Python,
   Java) for the documented endpoints.
3. **Important:** no SDK has been generated in this repository and no APIMatic
   deployment has been set up. `openapi.json` is the single input a judge or
   sponsor can feed to APIMatic themselves to produce an SDK; this repo only
   offers the verified spec (and the Postman collection) as the source material.

## Honest limitations

- The PayPal endpoints target the **sandbox** environment (live money cannot be
  configured).
- AI chat requires an AI provider key on the server; without one the endpoint
  returns the rule-based fallback (`mode: "rule-based"`).
- The spec describes the API as implemented; it does not add endpoints or
  behaviors that are not in the codebase.

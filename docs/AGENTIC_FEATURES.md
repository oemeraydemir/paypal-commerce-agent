# Agentic features: discovery, feed, Cart Mandate, automation

Everything here is a **custom `aicafe.*` format** for this merchant. None of it is an official PayPal Agent Ready,
Store Sync or AP2 integration, and nothing here lets an AI agent pay, capture or refund.

## Discovery documents (one source of truth)

| Route | Purpose |
|---|---|
| `/.well-known/agent-commerce.json` | **Canonical manifest**: merchant, endpoints, MCP tool names, guardrails, policy limits, mandate verification info, disclaimers |
| `/.well-known/agent.json` | Compact agent card, **generated** from the manifest |
| `/llms.txt` | Plain-text summary, **generated** from the manifest |
| `/api/feed/products` | Product feed (distinct purpose: catalog data); schema below |

The MCP tool names come from the real registry (`MCP_TOOL_NAMES` in `src/routes/mcp.ts`); a test compares them with a live
`tools/list`. All four routes are `GET` only.

### Base URL and caching

URLs inside the documents come from `PUBLIC_BASE_URL` (or Render's `RENDER_EXTERNAL_URL`). In production the value is
required (the server refuses to start without it) and `Host` / `X-Forwarded-*` are never used. Responses carry
`Cache-Control: public, max-age=300` (feed: 60) only when the base URL is configured; outside production an unset value falls
back to the request origin with `no-store`. Plain `http` base URLs are refused in production.

### Product feed schema (stable; additive changes only)

`ItemList { @context, @type, name, description, numberOfItems, itemListElement[] }` ->
`ListItem { @type, position, item }` -> `Product { @type, sku, name, description, category, keywords, additionalProperty[], offers }`
with `additionalProperty` entries `dietary` (string[] catalog labels, e.g. `vegan`, `alcohol`) and `priceMinor` (integer minor units),
and `Offer { @type, price (decimal string), priceCurrency, availability (schema.org URL), seller, url }`.
Prices come from the server catalog (the objects checkout uses). The response has no per-request timestamp, so it supports `ETag` revalidation.

## Cart Mandate

* Signs a canonical form: UTF-8 JSON with sorted keys and no whitespace (`aicafe-stable-json/1`, fast-json-stable-stringify 2.x; **not** RFC 8785).
  The envelope names it in `canonicalization`; verification refuses other labels.
* Derived from the persisted order (server prices and state), so no extra storage. `expiresAt` is part of the signed content and is never recomputed while verifying.
* Keys: `MANDATE_SIGNING_KEY` (active, signs) and `MANDATE_PREVIOUS_PUBLIC_KEYS` (SPKI public keys, max 5, verify only). `kid` selects the key.
  A configured but invalid value stops startup; `/api/health` then reports 503 `misconfigured` (without key material). Private keys in the previous list are refused.
* Rotation: generate a new key (`npm run mandate:keygen`), put the old key's *public* key in `MANDATE_PREVIOUS_PUBLIC_KEYS`, then replace `MANDATE_SIGNING_KEY`.
  Without a configured key an ephemeral key is generated at boot and earlier mandates cannot be verified (reported as `keyPersistence: ephemeral`).

## Automation events (optional, not production-grade)

* Events: `order.paid`, `order.policy_blocked`, `refund.completed`. Payloads hold business facts only (ids, amounts, status); no tokens, session ids or PayPal secrets.
* **Delivery is not durable**: no outbox, in-memory only; up to 2 attempts. Events can be lost (restart/crash) and repeated (a timeout may hide a processed request).
  It is neither exactly-once nor a reliable at-least-once queue. A failing receiver never affects an order or payment.
* **Consumers must deduplicate** on `X-AiCafe-Event-Id` / `body.id` (`order.paid` and `refund.completed` ids are stable per order/refund).
* Signature (when `AUTOMATION_WEBHOOK_SECRET` is set): `X-AiCafe-Timestamp` (unix seconds, set per attempt) and `X-AiCafe-Signature: sha256=<hex HMAC-SHA256 over "<timestamp>.<raw body>">`.
  Recompute over the raw bytes, compare in constant time, reject timestamps outside a window (reference verifier: `verifyAutomationSignature`, default 300 s) and drop repeated event ids.
* Destinations: https only; loopback, private, link-local, CGNAT, multicast and other reserved addresses are refused, including after DNS resolution
  (the connection is pinned to the checked addresses, which closes DNS-rebinding), redirects are never followed, and the URL is never logged.
  `AUTOMATION_ALLOW_LOCAL_TARGETS=true` allows a localhost receiver outside production only.

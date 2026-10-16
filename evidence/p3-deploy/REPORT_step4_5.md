# TASK P3b — Post-deploy verification & webhook registration

**Live URL:** https://paypal-commerce-agent.onrender.com
**Render service:** `paypal-commerce-agent-backend` (free plan)
**Branch:** `fix/render-deployment`
**Deployed commit (verified via `/api/health` `buildCommit`):** `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb`
**Date:** 2026-10-15
**Overall result:** ✅ **PASS** — Steps 1–4 verified end-to-end against the live sandbox service (real sandbox payment captured, webhook delivered and signature-verified).

> No secret values or tokens are printed below. Session ids are masked (first 4 + last 4).

---

## Step 1 — Warm-up + health assertion — ✅ PASS

`GET /api/health` returned **HTTP 200 in 310 ms** (service already warm, `uptime` ≈ 492 s).

| Assertion | Expected | Actual | Verdict |
|---|---|---|---|
| `buildCommit` == `git rev-parse HEAD` | `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb` | `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb` | ✅ |
| `environment` | `production` | `production` | ✅ |
| `paypal.environment` | `sandbox` | `sandbox` | ✅ |
| `paypal.enabled` | `true` | `true` | ✅ |
| `service` | — | `paypal-commerce-agent-backend` | ✅ |

Raw body (safe — contains no credentials):
```json
{"status":"ok","timestamp":"2026-10-15T13:44:35.077Z","service":"paypal-commerce-agent-backend","version":"1.0.0","buildCommit":"d9f928a6e1318039e9f1ffd6c6c60329e4a936cb","environment":"production","uptime":491.713352097,"paypal":{"enabled":true,"environment":"sandbox"},"ai":{"enabled":true}}
```
→ The deployed commit **exactly matches** the pushed SHA. Gate satisfied.

---

## Step 2 — HTTPS smoke (Node `fetch`) — ✅ PASS (7/7)

| # | Check | Result |
|---|---|---|
| 1 | `GET /` (storefront) | ✅ HTTP 200, `text/html`, storefront marker found |
| 2 | Security headers — CSP present | ✅ `script-src 'self' https://cdn.jsdelivr.net 'nonce-…'; default-src …` |
| 3 | `GET /api/catalog` | ✅ HTTP 200, `count = 25` |
| 4 | `POST /api/sessions` | ✅ HTTP 201, `sessionId=44d3…d417`, token present, `expiresAt=2026-10-16T13:45:36Z` |
| 5 | `POST /api/policy/preview` (EUR 13) | ✅ HTTP 200, `totalMinor=1300`, `decision=REQUIRE_CONFIRMATION` |
| 6 | `POST /api/orders/create` over-limit | ✅ HTTP 403, `policyDecision=BLOCK`, `error="Purchase blocked by policy"` |
| 7 | `GET /api/ops/status` | ✅ HTTP 200, `enabled=false`, `reason="Ops Copilot is disabled on this server."` |

Additional security headers observed: `strict-transport-security` present, `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`.

Policy defaults in effect: `maxPerPurchaseMinor=2000` (€20), `confirmationThresholdMinor=1000` (€10) → €13 correctly requires confirmation; €45 cake correctly blocks.

---

## Step 3 — Live payment (human approval) — ✅ PASS

Owner completed the payment in a real browser: **"Everyday order"** (€13) → **Review & pay with PayPal** → sandbox buyer **Approve** → return → **"Confirm payment"**.

Verified against the live service (`GET /api/orders`, public read-only endpoint):

| Field | Value |
|---|---|
| Order id (public, non-secret) | `ca398ad9-4cf1-4acf-aa9d-e7a36d7759b3` |
| **Status** | **`PAID`** ✅ |
| `totalMinor` | **`1300`** (€13.00) ✅ |
| Origin | `HUMAN` ✅ |
| Items | `veg_breakfast` ×1 = 1000, `coffee` ×1 = 300 ✅ |
| Session ref (non-reversible) | `sess_bd0aa2f3` |
| Created | `2026-10-15T14:27:01.911Z` |
| `GET /api/orders` total | **1** |

`GET /api/orders/stats`:
```json
{"total":1,"aiAssisted":0,"aiAssistedPercentage":0,"revenueMinor":1300,"revenueFormatted":"€13.00","aiAssistedRevenueMinor":0,"aiAssistedRevenueFormatted":"€0.00"}
```

**Exactly one order → exactly one capture.** No duplicate order, no double capture. Gate satisfied.

## Step 4 — Webhook registration — ✅ VERIFIED (registered, no duplicate created)

Credentials were corrected in `apps/backend/.env` (real sandbox REST app: client id `AWI1…`, secret **80** chars).

**Credential re-verification (Node `fetch`):**
```
POST https://api-m.sandbox.paypal.com/v1/oauth2/token   → HTTP 200, access_token returned
```

**Existing webhook verified via the PayPal API (read-only, `GET /v1/notifications/webhooks`):**
```
webhook count: 1
- id=0SP24733RB703715E   url=https://paypal-commerce-agent.onrender.com/api/webhooks/paypal
  events: CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.DENIED
```
| Assertion | Result |
|---|---|
| id == `0SP24733RB703715E` | ✅ |
| url == `https://paypal-commerce-agent.onrender.com/api/webhooks/paypal` | ✅ |
| required event types present (all 3) | ✅ |

**Deliberate decision:** `npm run register-webhook` was **not** executed. That script unconditionally calls `createWebhook`, so running it would have created a **duplicate** endpoint. The already-registered webhook was verified through the read-only list API instead.

**Live service wiring confirmed:**
```
GET https://paypal-commerce-agent.onrender.com/api/webhooks/health  → 200 {"status":"ok","webhookEnabled":true}
```
→ Render has `PAYPAL_WEBHOOK_ID` set, so the deployed app will verify webhook signatures.

**Live delivery observed** (owner-pasted Render logs; non-secret sandbox identifiers only — no credentials/tokens):

```text
Order ca398ad9-4cf1-4acf-aa9d-e7a36d7759b3 marked PAID via webhook (PayPal Order: 2L718454CX803590G)
10.196.20.10 - - [15/Oct/2026:14:30:19 +0000] "POST /api/webhooks/paypal HTTP/1.1" 200 44 "-" "PayPal/AUHD-1.0-1"
```

| Assertion | Result |
|---|---|
| PayPal genuinely delivered the event (not a spoof) | ✅ `User-Agent: PayPal/AUHD-1.0-1` |
| Signature verified against PayPal's API | ✅ (no `Invalid webhook signature`; request accepted) |
| Order correlated by PayPal Order ID and marked PAID | ✅ `marked PAID via webhook` → `webhooks.ts:113` |
| Endpoint acknowledged to stop retries | ✅ `HTTP 200` |

**Duplicate-ignore — not exercised live (expected).** No `Duplicate webhook event:` line appeared, and none was due: PayPal only re-delivers an event when the endpoint answers **non-2xx** (see `webhooks.ts:70-79`), and this delivery was acknowledged `200` on the **first** attempt. The idempotency guard (`webhooks.ts:54-57` → `webhookService.isDuplicate`) therefore had no duplicate to reject in production. It is covered by automated tests instead:

- `tests/integration/webhooks.test.ts` — asserts a re-delivered event returns `"already processed"` (lines 228, 315).
- `tests/integration/reservation-consistency.test.ts` — same, plus `webhookService.isDuplicate('WH-RESTART') === false` (line 293).

Fresh run of both suites (`npx jest --runInBand`):

```
Test Suites: 2 passed, 2 total
Tests:       35 passed, 35 total
```

→ The duplicate-ignore path is proven by automated tests even though production delivered no duplicate.

---

## Findings / notes

- **`CORS_ORIGIN` mismatch (low severity).** Live host is `paypal-commerce-agent.onrender.com`, but `render.yaml` sets `CORS_ORIGIN=https://paypal-commerce-agent-backend.onrender.com`. The storefront is served **same-origin** from the API host, so it is unaffected; only a *cross-origin* browser client would be blocked. Worth aligning for correctness.
- **Free-plan cold start.** First request after ~15 min idle may take ~30–60 s. Warm up before any demo/video take.
- **`E2E_SKIP_AI` not needed here** — no OpenAI calls were made in this task; the only paid AI surface (`/api/ops/ask`) is disabled (`enabled=false`).

## Git state
- **Deployed commit** `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb` — verified equal to the pushed SHA at Step 1.
- **Evidence commits** (fast-forward only, no force-push, no history rewrite): `66b2f5a` → `b0b533c` → `c8387eb` → final update.
- No secrets were committed at any point; `apps/backend/.env` remains git-ignored.

## Verdict

| Step | Result |
|---|---|
| 1 — Warm-up + health assertion | ✅ PASS (`buildCommit` == deployed SHA, production, sandbox) |
| 2 — HTTPS smoke | ✅ PASS (7/7) |
| 3 — Live sandbox payment | ✅ PASS (PAID, €13.00, single capture) |
| 4 — Webhook registration + delivery | ✅ PASS (verified registered; delivered, signature-verified, order marked PAID, HTTP 200) |

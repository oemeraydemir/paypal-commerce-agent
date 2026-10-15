# TASK P3b — Post-deploy verification & webhook registration

**Live URL:** https://paypal-commerce-agent.onrender.com
**Render service:** `paypal-commerce-agent-backend` (free plan)
**Branch:** `fix/render-deployment`
**Local HEAD == pushed SHA:** `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb`
**Date:** 2026-10-15

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

## Step 3 — Live payment (human approval) — ⏳ PENDING (owner action)

**Owner action:** open https://paypal-commerce-agent.onrender.com → **"Everyday order"** → **"Review & pay with PayPal"** → log in with the **sandbox buyer** → **Approve** → return to the storefront → press **"Confirm payment"**.

**Verification once done:** poll `GET /api/orders` and assert a **PAID** order exists with exactly **one** capture.

## Step 4 — Webhook registration — ⛔ BLOCKED (local credentials)

`npm run register-webhook https://paypal-commerce-agent.onrender.com/api/webhooks/paypal` **could not be run**:

- The local `apps/backend/.env` still contains **placeholder** credentials (`PAYPAL_CLIENT_SECRET` length **8**, client id email-shaped), unchanged since `2026-10-15 11:47`.
- Verified directly against PayPal sandbox OAuth: `POST https://api-m.sandbox.paypal.com/v1/oauth2/token` → **HTTP 401 `invalid_client` / "Client Authentication failed"**.

The **live Render service** has valid credentials (health shows `paypal.enabled=true`), but those live only in Render's env vars and are not available to the local script.

**Unblock (either):**
1. Put the **same real sandbox REST app credentials** used on Render into `apps/backend/.env` (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` ≥ 60 chars), then I run the script; **or**
2. Run the script yourself and paste the returned **webhook id** (not a secret) here.

**Then:** set `PAYPAL_WEBHOOK_ID` in Render env vars and redeploy → make one more sandbox payment → paste the two relevant Render log lines ("marked PAID via webhook" and a duplicate-ignored line), redacted.

---

## Findings / notes

- **`CORS_ORIGIN` mismatch (low severity).** Live host is `paypal-commerce-agent.onrender.com`, but `render.yaml` sets `CORS_ORIGIN=https://paypal-commerce-agent-backend.onrender.com`. The storefront is served **same-origin** from the API host, so it is unaffected; only a *cross-origin* browser client would be blocked. Worth aligning for correctness.
- **Free-plan cold start.** First request after ~15 min idle may take ~30–60 s. Warm up before any demo/video take.
- **`E2E_SKIP_AI` not needed here** — no OpenAI calls were made in this task; the only paid AI surface (`/api/ops/ask`) is disabled (`enabled=false`).

## Git state
- HEAD `d9f928a…` == remote tip. Working tree: only untracked evidence files.
- This report is committed and pushed separately (fast-forward only).

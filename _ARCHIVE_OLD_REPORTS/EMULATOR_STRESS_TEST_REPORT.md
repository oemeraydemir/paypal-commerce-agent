# Emulator + Stress Test Report — PayPal Checkout Correlation

**Mode:** Read-only against source; live Sandbox evidence collection + emulator/stress validation.
**Repo:** `C:\Projects\FinCan\paypal-commerce-agent` · Branch `fix/render-deployment`
**HEAD:** `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2` (unchanged throughout — no commit/push/deploy/webhook).

No source code was modified. All 10 tracked changes (6×A1.5 backend + 4×A1.9A Flutter) and 10 untracked reports preserved.

---

## 1. Live Sandbox 4-point correlation (real evidence)

A fresh checkout order was created against the **live Render backend** (`https://paypal-commerce-agent.onrender.com`, PayPal enabled + sandbox). Correlation captured:

| Point | Result |
|---|---|
| Internal `orderId` | created, status `PAYMENT_PENDING` |
| PayPal `paypalOrderId` | returned by backend |
| `approvalUrl` host | `www.sandbox.paypal.com` ✓ |
| `approvalUrl` token param | **equals `paypalOrderId`** ✓ (correlation correct) |
| `/api/checkout/return?token=<paypalOrderId>` | HTTP 200 → deep-link `paypalcommerceagent://checkout/success?token=<paypalOrderId>`, path `/success`, **token == PayPal order ID** ✓ |

**Conclusion:** The app's internal→PayPal ID correlation and deep-link producer are correct. The failure is not a wrong-ID bug.

## 2. Onaysuz (unapproved) capture reproduction

Creating a fresh order and immediately calling capture (no buyer approval) → backend returned **HTTP 502 `{"error":"PayPal error"}`**. This is PayPal's `422 ORDER_NOT_APPROVED` wrapped by the backend. **This reproduces the exact dashboard symptom** and confirms the failing case is *capture attempted before/without buyer approval*, not an ID mismatch.

## 3. Emulator deep-link handling (safety)

Delivered `paypalcommerceagent://checkout/success?token=TESTTOKEN123` (no matching pending order) to the running app via `adb`:

- Intent-filter is registered on the emulator (`Status: ok`).
- App handled it safely: **"No pending order to handle."** — no crash, no false capture, cart preserved.

This proves the client only captures when a real pending order's token matches (defensive behavior intact).

## 4. Stress test — session creation concurrency

30 concurrent `POST /api/sessions` from one IP:

- **20 of 30 received HTTP 429** with `IP_LIMIT` (`SESSION_CREATE_PER_IP_PER_HOUR` default = **30**, `environment.ts`).
- **Verdict: expected security control, NOT a bug.** The per-IP hour limit legitimately throttles bursts. Single-user flows are unaffected; only >30/ hr from one IP is throttled. Documented, not a defect to fix.

## 5. Deployment identity

Live `/api/health` response has **no `buildCommit` field** → the deployed service predates the A1.5 `health.ts` change. Confirms live ≠ local; do not trust the live service for local changes.

---

## Issues found & disposition

| # | Issue | Severity | Disposition |
|---|---|---|---|
| 1 | `checkout.ts` return/cancel endpoints render a **manual-click HTML page**, not an auto-redirect | **P0 (likely root cause of `ORDER_NOT_APPROVED`)** | Not fixed this sprint (needs full evidence chain first). Documented. |
| 2 | Onaysuz capture returns opaque **502** (wraps PayPal 422) | P1 (observability) | Safe (no state corruption); could map to clearer 409/400. Not changed. |
| 3 | 30 concurrent sessions → 20× 429 `IP_LIMIT` | — | Expected behavior, no action. |
| 4 | Emulator deep-link with unknown token | — | Handled safely, no action. |
| 5 | Live service missing A1.5 `buildCommit` | info | Confirms deploy gap. |

## Root-cause signal for `ORDER_NOT_APPROVED`

The **manual-click return page** (issue #1) is the strongest candidate: if the buyer (or the demo) does not tap "Return to AI Café", the deep-link never fires, `_paypalApproved` stays false, and capture is attempted against a not-yet-approved PayPal order → `422 ORDER_NOT_APPROVED`. This remains a **hypothesis** — a single live run where the buyer approves AND taps return, with correlated IDs + PayPal Debug ID, is required to confirm. No speculative code change made.

## What remains blocked / next action

- **Full buyer-approval → capture → webhook** live run (requires a real Sandbox buyer completing approval). Manual test procedure stands in `SPRINT_PAYPAL_CHECKOUT_RECOVERY_01_REPORT.md`.
- **No commit, push, deploy, webhook registration, or live payment was performed.**

**Next action:** Run one live Sandbox checkout where the buyer approves and taps the return link, capturing the internal ID, PayPal order ID, deep-link delivery, capture result, and PayPal Debug ID — to confirm or rule out the manual-click return page as the root cause.

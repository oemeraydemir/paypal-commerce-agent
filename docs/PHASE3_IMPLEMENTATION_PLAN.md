# Phase 3 — Implementation Plan (Stage B)

**Date:** 2026-10-25
**Status:** Proposed. To be executed **after owner approval**, one batch at a time (approval-gated). No batch is "done" until implementation + tests + real UI evidence exist and the owner confirms.

> Governed by the owner's rules: preserve existing work; no Git init/commits/resets; no ZIP; no fabricated credentials/API responses/test results; don't weaken security; keep contracts/product IDs stable; no real payments (sandbox only); work in small approval-gated batches and stop after each batch; never describe work as done merely because an agent reports success. **Both Flutter and web must be completed for the shared features — do not finish one and leave the other.**

---

## 0. Preconditions / order

Batches are dependency-ordered. Each batch MUST stop for owner approval before the next begins.

## Batch 1 — Close Batch‑1 regression (web storefront test)

- **Scope:** `public/app.js` Coco avatar uses `innerHTML`; `tests/integration/web-storefront.test.ts` FAILS ("uses textContent, never innerHTML").
- **Work:** refactor `cocoSvg()` injection to build the SVG via DOM APIs (`document.createElementNS`) — or, if a static-string innerHTML is deliberately acceptable, update the test contract *with a written justification* (do not silently weaken the security test).
- **Files:** `public/app.js`, `tests/integration/web-storefront.test.ts`.
- **Acceptance:** `jest tests/integration --runInBand` 43/43 suites green; browser reload still shows Coco avatar.
- **Risks:** low. **Complexity:** low.

## Batch 2 — Core shopping / Coco / why / allergy / onboarding / categories (parity sweep)

- **Scope:** verify and, where needed, equalize web vs Flutter: Coco avatar, catalog/categories/cart, "Why these items?"/policy, allergy/dietary warnings (local/unverified wording), 3-step onboarding + persistence + reset, EN/TR switch.
- **Work incl. the known gap:** add policy-reason explaining to **Flutter** (`chat_provider.dart`/`chat_screen.dart` + `cart_explanation.dart`) so it matches web.
- **Files:** `lib/providers/chat_provider.dart`, `lib/screens/chat_screen.dart`, `lib/utils/cart_explanation.dart`, `lib/**` tests; web unchanged unless a parity bug is found.
- **Acceptance:** Flutter `flutter analyze` clean; `flutter test` green (in a capable environment); web prior evidence retained.
- **Risks:** low. **Complexity:** medium.

## Batch 3 — Voice shopping (web + Flutter)

- **Scope (both platforms):** voice input for the chat send box: microphone permission flow, speech recognition, transcript editing before send, error handling (permission denied, unsupported browser/device, recognition failure), and sending the transcript through the **normal chat flow** (no special payment path).
- **Work:**
  - Web: `public/app.js` — `webkitSpeechRecognition`/MediaDevices with feature detection + graceful fallback; UI mic button state machine; permission-denied + unsupported-browser messages (i18n EN/TR).
  - Flutter: add `speech_to_text` dependency; `lib/services/` + chat UI; permission handling; same states.
- **Files:** `public/app.js`, `public/i18n.js`, `public/index.html`; `flutter_app/pubspec.yaml`, `lib/**`.
- **Acceptance:** on **both** platforms: recognized speech appears as editable text; denial/unsupported/recognition-error paths render a clear message; no payment path change. Tests for permission/cancel/unsupported/transcription error.
- **Risks:** platform API differences (iOS/Android/web mic permissions). **Complexity:** high.

## Batch 4 — AG Grid / dashboard hardening

- **Scope:** keep AG Grid Community v33 integration; add/verify CSV export, filtering, a11y; confirm `DASHBOARD_PUBLIC` contract. No auth weakening; document that public mode is demo-only.
- **Files:** `public/dashboard.html`, `public/dashboard.js`, `tests/unit/dashboard-*.test.ts`.
- **Acceptance:** `dashboard.test.ts`/`dashboard-a11y.test.ts`/`dashboard-contrast.test.ts` green; owner browser E2E.
- **Risks:** low. **Complexity:** low.

## Batch 5 — Multi-tenant isolation (G1 + negative tests)

- **Scope:** add `business_id` column + backfill on `orders`, `refund_requests`, `policy_events`, `webhook_events`, `spend_reservations`; tenant-scoped repositories; `getByPayPalOrderId(paypalOrderId, businessId)`; webhook id → business mapping; the two missing cross-tenant tests (**positive** isolation and **denied** access).
- **Explicitly NOT this batch:** RLS (G2) and roles (G3) unless owner confirms; PayPal Commerce Platform partner onboarding is a separate external track.
- **Files:** `src/persistence/migrations.ts`, `src/persistence/pg-repositories.ts`, `src/orders/domain.ts`, `src/orders/service.ts`, `src/paypal/webhook-service.ts`, tests.
- **Acceptance:** cross-tenant positive + denied tests pass.
- **Risks:** medium (schema migration — keep single-business default path intact). **Complexity:** high.

## Batch 6 — Refunds / merchant approval (sandbox)

- **Scope:** verify lifecycle routes against PayPal **sandbox** with an authorized test merchant: propose → approve → (partial/full) refund → reconcile; confirm idempotency / duplicate protection and that success is only recorded after provider confirmation.
- **Files:** `src/refunds/*`, `src/routes/refunds.ts`, `tests/integration/refunds.test.ts`, `refund-persistence.test.ts`.
- **Acceptance:** sandbox end-to-end with real (test) credentials; state-transition + idempotency tests green.
- **Dependencies:** PayPal sandbox creds + `OPS_COPILOT_KEY`.
- **Risks:** medium. **Complexity:** medium.

## Batch 7 — Payment methods + Vault/BNPL (honest, separately gated)

- **Scope:** existing PayPal sandbox order/approval/capture/reconcile/refund is already implemented; this batch either adds alternative methods (product decision) or **documents** Vault/BNPL status.
- **Vault/BNPL rule:** first verify official provider support, merchant eligibility, prereqs, consent, and sandbox availability. **Do not** invent endpoints, simulate approvals, or expose credentials. If unverifiable, the batch delivers a documented, blocked status only.
- **Risks:** high; blocked by external verification. **Complexity:** high.

## Batch 8 — Structured e-invoice (only after requirements confirmed)

- **Scope:** confirm product + tax decisions (buyer fields, VAT categories, numbering, retention) with a **tax adviser**; then receipt-first, then XRechnung/ZUGFeRD/Factur‑X with a real validator on fixture data. Distinguish PDF from structured e-invoice in all UI/docs.
- **Files:** new `invoices` / `invoiceSequence` tables; `src/invoicing/*`; validator integration.
- **Acceptance:** validator green on fixtures; never label a PDF as E-Rechnung.
- **Dependencies (blocking):** tax adviser; validator library.
- **Risks:** high. **Complexity:** high.

## Batch 9 — CSP / security hardening

- **Scope:** confirm CSP/headers, session expiry, API authorization, input validation, secrets/env, webhook signature+replay+idempotency, rate limits, error/logging, durable storage (`REQUIRE_PERSISTENCE`), and re-run `npm audit`. Fix the app.js innerHTML if not already handled in Batch 1.
- **Acceptance:** `security-headers.test.ts` + audit green; secrets scan clean.
- **Risks:** low. **Complexity:** low.

## Batch 10 — Channel3 (evidence only)

- **Scope:** require the owner to confirm the meaning/requirement/integration of "Channel3"; if confirmed, implement; otherwise keep **DEFERRED** and document.
- **Acceptance:** owner confirmation; no fabrication.

## Batch 11 — Docs / README / CHANGELOG / test docs / matrix

- **Scope:** only after implementation + verification of the batches above, update `README.md`, create `CHANGELOG.md`, and produce the consolidated test/feature matrix. No doc claims before real implementation evidence.
- **Acceptance:** docs match tested reality.

---

## 1. Recommended first batch to approve

**Batch 1** (fix the single failing `web-storefront.test.ts`) and **Batch 2** (Flutter policy-reason parity) — both low-risk and unblock the red test; then **Batch 3** (voice, both platforms) as the highest-value missing feature.

## 2. Blockers requiring owner/external action

- Flutter `flutter test` cannot run in this sandbox (tester WebSocket failure) — needs a capable local/CI environment.
- PayPal sandbox credentials / `PAYPAL_WEBHOOK_ID` / `OPS_COPILOT_KEY` for payment-refund batches.
- Tax adviser sign-off for E-Rechnung.
- PayPal Commerce Platform partner onboarding for multi-tenant (G4).
- Vault/BNPL eligibility verification.
- "Channel3" requirement definition.

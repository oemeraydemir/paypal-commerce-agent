# Phase 3 — Gap Audit (Stage A, read-only)

**Date:** 2026-10-25
**Mode:** Read-only audit. No application code was modified.
**Auditor note:** "Do not treat previous agent reports, source-code presence, screenshots alone, or unit-test success as proof that a feature is complete." Evidence below distinguishes **implemented + automated-tested** from **owner-verified (web/Flutter E2E)**, which has NOT been re-run by the owner in this cycle. `PASS` here means *implemented with automated test/CI evidence*, not *owner-accepted*.

---

## 0. Evidence base

| Check | Command | Result |
|---|---|---|
| Backend unit tests | `node node_modules/jest/bin/jest.js tests/unit --runInBand --silent` (in `source/apps/backend`) | ✅ 33 suites passed, 392/392 tests passed |
| Backend integration tests | `node node_modules/jest/bin/jest.js tests/integration --runInBand --silent` | ⚠️ 42/43 suites passed (437/438 tests); **1 FAIL**: `web-storefront.test.ts` |
| Flutter static analysis | `flutter analyze` (in `source/apps/flutter_app`) | ✅ No issues found |
| Flutter widget/unit tests | `flutter test` | ⛔ **BLOCKED (environment)** — `flutter_tester` cannot connect (`Invalid WebSocket upgrade request`); all 15 suites fail at *load*, not logic. Prior session recorded 100/100 pass. |
| Backend type/build | `npm run build` (tsc) — not re-run this audit; tests compile via ts-jest | tests compile OK |
| Smoke (PostgreSQL) / browser tests | excluded from `npm test`; not run (need real DB/Chrome) | not counted below |
| Voice search (web+Flutter) | grep `(?i)(speech|microphone|getUserMedia|MediaRecorder|voice|SpeechRecognition)` over `public/`, `flutter_app/lib` | ✅ no matches — **not implemented anywhere** |

**Live test failure to resolve first (Batch 1 regression):**
`tests/integration/web-storefront.test.ts` asserts the storefront bundle `public/app.js` never uses `innerHTML | document.write | eval(`. The Batch‑1 Coco-avatar fix added `av.innerHTML = cocoSvg();` and `b.innerHTML = cocoSvg();`. The string is a static, hard-coded SVG (no user input), so it is **not** an XSS vector — but it violates the project's own security test contract. **Requires a deliberate decision:** refactor `app.js` to build the SVG via `document.createElementNS`/DOM APIs, or update the test contract with a documented, justified exception.

---

## 1. Master matrix

Legend: **IMPLEMENTED** = code exists + automated tests pass. **PARTIAL** = core works, explicit sub-part missing. **MISSING** = absent. **BLOCKED** = not actionable without external dependency. **DEFERRED** = intentionally parked / awaiting owner decision.

### A. Core UX (web + Flutter parity)

| Feature | Status | Implementation evidence | Tests + commands | End-user flow evidence | Security risk | Work needed | Dependencies / credentials | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| Web storefront (vanilla JS) | IMPLEMENTED | `public/index.html`, `public/app.js`, `public/i18n.js`; static serving in `src/app.ts` (`serveBrandedIndex`, `Cache-Control: no-store`) | `web-storefront.test.ts` **FAILS** (innerHTML contract, see §0); `storefront-branding.test.ts`, `cors.test.ts` pass | Verified in prior session via real Chromium (Playwright): onboarding visible, Coco avatar, why-items, zero 401s | innerHTML contract breach (static SVG only); CSP `script-src 'self'+CDN+nonce`, no `unsafe-inline` | Fix app.js innerHTML or test contract first | none | green `web-storefront.test.ts`; owner browser E2E |
| Flutter app parity | IMPLEMENTED | `lib/main.dart`, `chat_screen.dart`, `providers/*`, `services/*`, `l10n/app_strings.dart` | `flutter analyze` clean; `flutter test` BLOCKED (env) | Not re-run this cycle | — | re-run `flutter test` outside sandbox | none | owner emulator E2E |
| Coco / barista avatar | IMPLEMENTED (web, Flutter) | web: `cocoSvg()` + `#coco-badge` + `.msg.a .aval`; Flutter: `widgets/barista_avatar.dart` | `dashboard-a11y.test.ts` (web) | verified in prior Chromium run | innerHTML (static) | web innerHTML refactor | none | both platforms show Coco |
| Catalog + categories + cart | IMPLEMENTED | web `renderCatalog/renderCart`; backend `catalog/service.ts`; Flutter models | `catalog.test.ts`, `orders.test.ts`, `order-item-contract.test.ts` pass | prior browser run | — | — | none | both platforms |
| "Why these items?" + policy | IMPLEMENTED (web); PARTIAL (Flutter) | web `renderWhy` reads server `reason`/`policyViolations`; **Flutter does NOT display policy metadata** (`KNOWN_LIMITATIONS.md` "Policy metadata is not shown in the Flutter app") | `policy.test.ts`, `policy-preview*.test.ts` pass | prior browser run (why-items from real server fields) | — | add policy-reason UI to Flutter | none | Flutter shows why |
| Allergy / dietary server enforcement | IMPLEMENTED | server `policy/service.ts` (`DIETARY_*` violations); web/Flutter allergen toggles are **local-only warnings** (explicit "unverified data" wording) | `policy.test.ts` | prior browser run | warnings correctly labelled local/unverified; server enforcement authoritative | — | none | allergy warnings never imply verification |
| 3-step onboarding + persistence + reset | IMPLEMENTED (web, Flutter) | web `initOnboarding()` + `?reset=1` + `aicafe.onboarded`; Flutter onboarding overlay `aicafe.onboarded` | `storefront-branding.test.ts`; prior browser run | verified prior | — | — | none | both platforms |
| EN/TR switching | IMPLEMENTED | `i18n.js` + `locale_provider.dart`; `aicafe.lang` | i18n harness (prior 22/23), `storefront-branding.test.ts` | verified prior | — | — | none | both platforms |
| **Turkish catalog translation** | **DEFERRED** (explicit owner instruction) | EN catalog only; TR UI strings present | — | — | — | requires product/translation decision | owner decision | owner confirms scope |
| **Voice shopping (web + Flutter)** | **MISSING** | grep confirms **no** speech/mic/MediaRecorder code in `public/` or `flutter_app/lib`; no speech dep in `pubspec.yaml` | — | not present | n/a | full feature: mic permission, speech recognition, transcript editing, error handling, send via normal flow | platform APIs + backend routing decision | both platforms, incl. permission-denied path |

### B. Admin dashboard / AG Grid + multi-tenant SaaS

| Feature | Status | Implementation evidence | Tests + commands | End-user flow evidence | Security risk | Work needed | Dependencies / credentials | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| AG Grid dashboard | IMPLEMENTED | `public/dashboard.html` + `dashboard.js`; real AG Grid Community **v33.0.0** from CDN (`cdn.jsdelivr.net`); pagination, quick filter, CSV export, pinned columns, renderers, keyboard-operable side panel | `dashboard.test.ts`, `dashboard-a11y.test.ts`, `dashboard-contrast.test.ts` pass | not re-run this cycle | dashboard is **public read-only** by default (`DASHBOARD_PUBLIC=true`) — demo banner states "No authentication by design (hackathon)" | keep public only for demo; set `false` for real customers | none for demo | owner browser E2E |
| Multi-tenant / SaaS isolation | **NOT IMPLEMENTED** | `docs/MULTI_TENANT_READINESS.md` documents G1–G6 honestly; `src/config/tenant.ts` **rejects** client tenant overrides (400) — **single-business** deployment; no tenant column, no RLS, no roles, one PayPal account per deployment | `tenant-boundary.test.ts` (10 tests) pass (refusal paths only) | n/a | explicitly documented as NOT multi-tenant; no cross-tenant leakage tests possible today (single tenant) | G1–G6 (tenant columns, RLS, membership/roles, PayPal platform onboarding, lifecycle, dashboard scoping) | PayPal Commerce Platform partner integration; business decision | positive + negative cross-tenant isolation tests |
| Admin roles | **MISSING** | single shared `X-Ops-Key` (`merchant-key.ts`); no user/role model | `refunds.test.ts` auth paths | n/a | shared-key admin | role/membership model (G3) | none | per-role authorization |

### C. E-Rechnung / invoicing

| Feature | Status | Implementation evidence | Tests + commands | End-user flow evidence | Security risk | Work needed | Dependencies / credentials | Acceptance criteria |
|---|---|---|---|---|---|---|
| Invoice generation/storage | **MISSING** (intentionally) | `docs/INVOICING_ASSESSMENT.md`: decision = no invoicing code this sprint; only order lines/totals exist (can feed an invoice), but no merchant address/VAT id, buyer identity, tax category, numbering, invoice table | — | n/a | a PDF is **not** an E-Rechnung (XRechnung/ZUGFeRD/Factur‑X are structured formats) | cannot start until tax/CVR decisions made | tax adviser (blocking); validator lib (Mustangproject/KoSIT); numbering table; GDPR/buyer-id | valid-invoice validator green on a fixture set |
| German/EU formats | BLOCKED / DEFERRED | documented in assessment (receive 2025; issue 2027/2028) | — | n/a | claiming compliance without professional validation prohibited | — | tax adviser | adviser sign-off |

### D. Refunds / merchant approval

| Feature | Status | Implementation evidence | Tests + commands | End-user flow evidence | Security risk | Work needed | Dependencies / credentials | Acceptance criteria |
|---|---|---|---|---|---|---|
| Refund lifecycle | IMPLEMENTED | `src/refunds/service.ts`: PROPOSED→PROCESSING→REFUNDED/REJECTED; deterministic concurrency claim; write-ahead before PayPal; crash-recovery reconciliation via PayPal refund status or capture refunded-total; partial refunds | `refunds.test.ts`, `refund-persistence.test.ts`, `refunded-total.test.ts` pass | not re-run | money moves only after merchant approval; never resent without PayPal confirmation | — | PayPal sandbox + `OPS_COPILOT_KEY` (16+ chars) | owner approves in dashboard |
| review/approve/reject routes | IMPLEMENTED | `routes/refunds.ts` (merchant-key auth, 429 throttling, 401) | covered above | not re-run | shared key | — | OPS_COPILOT_KEY | owner dashboard flow |
| provider reconciliation | IMPLEMENTED | not marked success until PayPal confirms (`getRefund`/`getCapture` total refunded); indeterminate ⇒ blocked 409/503 | covered above | not re-run | — | — | PayPal sandbox | reconcile-indeterminate path |

### E. Payments (PayPal sandbox) + Vault/BNPL

| Feature | Status | Implementation evidence | Tests + commands | End-user flow evidence | Security risk | Work needed | Dependencies / credentials | Acceptance criteria |
|---|---|---|---|---|
| Order → approval → capture → reconcile → refund | IMPLEMENTED (sandbox path) | `routes/orders.ts`, `orders/payment-lifecycle.ts`, `paypal/client.ts` (`Environment.Sandbox` only; `PAYPAL_ENV` zod-literal `'sandbox'`; never live) | `checkout.test.ts`, `webhooks.test.ts`, `webhook-durable-idempotency.test.ts`, `webhook-amount.test.ts`, `capture-concurrency.test.ts`, `capture-amount-binding.test.ts`, `refunds.test.ts` pass | sandbox flow not re-run this cycle | sandbox-only enforced in code; credentials never committed | — | PayPal sandbox client id/secret; webhook id | owner sandbox E2E |
| Webhook signature + replay + idempotency | IMPLEMENTED | `webhook-service.ts` (verify-webhook-signature, not HMAC), durable `webhook_events` (14-day retention) | covered above | n/a | — | — | `PAYPAL_WEBHOOK_ID` | — |
| Alternative payment methods | **MISSING** (only PayPal Orders/Payments used) | documented in `KNOWN_LIMITATIONS.md` | — | n/a | — | product decision | PayPal/product | owner decision |
| **PayPal Vault / BNPL** | **BLOCKED** (honest) | no code; **not verified** that provider supports/merchant eligible/consent required; must not invent endpoints or simulate approvals | — | n/a | do not fabricate approval | verify official provider support + merchant eligibility + prereqs + consent + sandbox first | PayPal docs/eligibility | official verification + (if viable) sandbox proof |
| UI placeholder vs backend vs sandbox-verified vs production-ready | DISTINGUISHED | this audit separates these columns | — | — | — | — | — | — |

### F. Security / reliability

| Feature | Status | Implementation evidence | Tests + commands | End-user flow evidence | Security risk | Work needed | Dependencies / credentials | Acceptance criteria |
|---|---|---|---|---|---|---|
| CSP + headers | IMPLEMENTED | helmet CSP (`script-src 'self'+CDN+nonce`, no `unsafe-inline`); env-based CORS; `Cache-Control: no-store` on index | `security-headers.test.ts`, `cors.test.ts` pass | prior browser run | — | — | — | header scan |
| Session auth/expiry | IMPLEMENTED | `session-auth.ts`, `session-store.ts` (SHA‑256 token hash, idle TTL 2h, max 24h) | `session-expiry-http.test.ts` pass | prior browser run (zero 401s) | — | — | — | — |
| API authorization/input validation | IMPLEMENTED | `validateOrderItems` (currency+quantity+server-authoritative totals), `rejectClientTenantOverride`, idempotency middleware | `order-item-contract.test.ts`, `tenant-boundary.test.ts`, `public-order-contract.test.ts` pass | — | — | — | — | — |
| Secrets/env | PARTIAL | env-gated (`PAYPAL_*`, `OPS_COPILOT_KEY`, `DATABASE_URL`); no secrets committed; `REQUIRE_PERSISTENCE` refuses boot without DB URL | `environment.test.ts`, `persistence-startup-guard.test.ts` pass | — | no secrets in repo | — | — | secret scan |
| Rate limits | IMPLEMENTED | `rate-limit.ts`; per-session/per-IP/global | `checkout-rate-limit.test.ts`, `ai-turn-limits-observability.test.ts` pass | — | — | — | — | — |
| Memory vs durable storage | PARTIAL | `persistence/init.ts` (memory vs PostgreSQL); without `DATABASE_URL` data is process-local | `persistence.test.ts`, `pg-*` smoke (not run here) | — | non-durable default | set `REQUIRE_PERSISTENCE=true` + managed DB for production | PostgreSQL URL | DB-backed run |
| Error handling/logging | IMPLEMENTED | `error-handler.ts` (redaction), `request-logger.ts` | `error-handler-redaction.test.ts`, `redact-and-format-error.test.ts` pass | — | — | — | — | — |
| Dependency advisories | OPEN | `npm audit` 8 advisories (1 high) transitive via `@paypal/agent-toolkit`; documented in `KNOWN_LIMITATIONS.md` | `DEPENDENCY_ADVISORIES.md` | — | keep copilot off unless needed | update toolkit when patched release ships | none | re-run npm audit |

### G. Channel3 + docs

| Feature | Status | Implementation evidence | Tests + commands | End-user flow evidence | Security risk | Work needed | Dependencies / credentials | Acceptance criteria |
|---|---|---|---|---|---|---|
| Channel3 integration | **DEFERRED / UNCONFIRMED** | appears only in `docs/JURY_REVIEW.md` / `docs/VERIFICATION_PROMPTS.md`; no code, no integration | — | n/a | — | confirm requirement & meaning with owner first | owner | — |
| README / CHANGELOG / test docs / matrix | PARTIAL | `README.md` exists; **no CHANGELOG file exists**; docs updated only after implementation+verification (owner rule) | — | — | — | create CHANGELOG when feature batches land | none | after implementation verified |

---

## 2. Highest-priority gaps (recommended order)

1. **Fix the failing integration test** `web-storefront.test.ts` (innerHTML contract vs Coco avatar) — this is the only red test in the suite and touches the shipped storefront.
2. **Voice shopping (web + Flutter)** — the outstanding headline feature on the owner's list; entirely MISSING on both platforms. Must be delivered on **both** (owner's Turkish instruction).
3. **Flutter policy-reason gap** — Flutter does not show "why these items?"/policy, breaking parity with web.
4. **Flutter test environment** — `flutter test` could not run in this sandbox; must be re-executed in a capable environment to prove the 100/100 suite.
5. **Multi-tenant SaaS (G1–G6)** — not implemented, by design; requires PayPal Commerce Platform partner integration + product decision. Negative cross-tenant tests impossible until a second tenant exists.
6. **E-Rechnung** — BLOCKED on tax adviser; receipt-first is the safe step.
7. **Vault/BNPL** — BLOCKED pending official provider/merchant-eligibility verification.

## 3. Production-readiness blockers (honest)

- Non-durable default storage (in-memory unless `DATABASE_URL` set + `REQUIRE_PERSISTENCE=true`).
- Missing live env: `PAYPAL_CLIENT_ID/SECRET` (sandbox), `PAYPAL_WEBHOOK_ID`, `OPS_COPILOT_KEY` for the dashboard/refund routes.
- `DASHBOARD_PUBLIC=true` default exposes demo read-only order/policy endpoints — must be `false` for real customers.
- Provider config: AI disabled unless a provider key is present.
- External approvals missing: tax adviser (E-Rechnung), PayPal platform (multi-tenant), Vault/BNPL eligibility.
- Flutter tests unverifiable in this sandbox.

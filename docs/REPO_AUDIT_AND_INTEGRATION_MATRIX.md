# Repo Audit & Integration Matrix

**Date:** 3 Nov 2026 · **Method:** every row below was derived by reading the repository (route files, `api_service.dart`, `app.js`/`split.js`, `render.yaml`, `package.json`), not estimated.
**What was executed in the audit environment:** `npm ci`, `tsc --noEmit` (0 errors), and the web/catalog/MCP/art-parity Jest suites. Flutter and live PayPal/Render could **not** be executed here; those rows are marked accordingly.

## 1. Web ⇄ Flutter parity (from code)

Endpoints each client actually calls (`grep` over `public/app.js`, `public/split.js`, `lib/services/api_service.dart`):

| Capability | Backend route | Web | Flutter | Status |
|---|---|---|---|---|
| Session | `POST /api/sessions` | ✅ | ✅ | parity |
| Catalog | `GET /api/catalog` | ✅ | ✅ | parity |
| AI chat / cart | `POST /api/ai/chat`, `DELETE /api/ai/cart/:id` | ✅ chat | ✅ | parity |
| Policy / mandate preview | `GET/PATCH /api/policy`, `POST /api/policy/preview` | ✅ | ✅ | parity |
| Wellbeing check + preferences | `/api/wellbeing/*` | ✅ | ✅ | parity |
| Checkout create → capture | `/api/orders/create`, `/orders/:id/capture`, `/orders/pending` | ✅ | ✅ | parity |
| Pickup planner | `/api/pickup/availability|reserve|link|release` | ✅ | ✅ | parity |
| Evidence verify | `POST /api/evidence/verify` | ✅ | ✅ | parity |
| Mandate verify | `POST /api/mandates/verify` | ✅ | ❌ | **gap (low)** |
| Spending guard | `/api/guard` | ❌ | ✅ | **gap (low)** — web has no UI for it |
| **Split Bill** | `/api/bills*` | ✅ (`split.html`, `split.js`) | ✅ (new: `split_bill_sheet.dart`, `models/bill.dart`, 6 `ApiService` methods, EN/TR strings, cart-sheet entry) | parity in code; **not yet compiled or run by the auditor** — run `flutter analyze` / `flutter test` (`test/split_bill_test.dart`) |
| Merchant dashboard (AG Grid) | `/dashboard`, `/api/dashboard/summary`, `/api/orders`, `/api/refunds*` | ✅ | n/a | web-only by design |
| Product art | `public/art/<id>.png` / `assets/products/<id>.png` | ✅ (new) | ✅ (new) | parity, enforced by `product-art-parity.test.ts` |
| Palette / category tints | `theme.css` `--t-*` / `product_art.dart` | ✅ (new) | ✅ (new) | parity, enforced by the same test |

## 2. External integrations (from code)

| Integration | Evidence in repo | State |
|---|---|---|
| PayPal Orders v2 create/capture | `src/paypal/*`, `routes/orders.ts` | implemented; one live sandbox capture documented (`docs/PAYMENT_E2E.md`) |
| PayPal webhook signature verification | `verify-webhook-signature` in `src/webhooks`, `routes/webhooks.ts` | implemented; live replay **not** evidenced |
| PayPal refunds / disputes | `src/refunds`, `src/disputes` (`v1/customer/disputes`) | implemented; live refund **not** evidenced |
| PayPal Agent Toolkit | `src/ops/ops-agent.ts` (`@paypal/agent-toolkit/openai`) | implemented (read-only Ops Copilot) |
| AI providers | `src/ai/providers.ts` (Gemini, Groq, Cerebras, OpenRouter, OpenAI) + rule-based fallback planner | implemented, mocked in tests |
| MCP server | `routes/mcp.ts` | implemented, 23 integration tests |
| Agent discovery | `/.well-known/agent-commerce.json`, `agent.json`, `llms.txt`, `/api/feed/products` | implemented |
| **AG Grid** | `public/dashboard.html` (CDN) | real use → eligible |
| **Render** | `render.yaml` (web service + Postgres) | blueprint present; **live URL must be re-checked before submit** |
| **APIMatic / Postman** | `openapi.json`, `postman/*` | spec + collection exist; **SDKs generated locally (TypeScript + Python in `sdks/`); portal config in `apimatic/`; nothing uploaded to the APIMatic cloud** |
| Zapier | `src/automation/emitter.ts` (generic signed webhook) | generic webhook only; not a Zapier app |
| Bryntum, Channel3, Elastic | Channel3 integrated (read-only "Take it home" discovery: `src/channel3/`, `routes/take-home.ts`, Flutter `take_home_card.dart`). Bryntum and Elastic not integrated (Elastic appears only as a Postman placeholder). | **Channel3 integrated; Bryntum/Elastic not integrated — do not claim** |

## 3. Security review

Verified good (read in code): Helmet + nonce CSP; single-origin CORS; 100 kB JSON cap; raw-body webhook mounted before JSON parser; tenant-override rejection; constant-time `X-Ops-Key` comparison with throttling *before* the check; all shopper routes behind `requireSession`; merchant routes behind `requireDashboardAccess` / `authorizeRefundMerchant`; server-side repricing; MCP bounded to 10 messages/request.

| # | Finding | Severity | Action |
|---|---|---|---|
| S1 | MCP `originAllowed` accepted any `Origin` whose host equalled the request `Host` header. Under DNS rebinding both are attacker-chosen, so the guard was bypassable. | Medium | **Fixed**: in production only `CORS_ORIGIN` is accepted (`routes/mcp.ts`). Local dev keeps the Host convenience. |
| S2 | `render.yaml` does not set `DASHBOARD_PUBLIC`; dashboard data is private by default and returns 503 unless `OPS_COPILOT_KEY` is set. Judges would see an empty AG Grid. | Deployment risk | **Decision needed.** Either set `DASHBOARD_PUBLIC=true` for the demo (responses are already minimised) or put the key in the Devpost testing notes. |
| S3 | `GET /api/ops/status`, `/api/webhooks/health` are unauthenticated and disclose enablement flags. | Low | Accepted; no secrets returned. |
| S4 | 10 transitive `npm audit` advisories (AI-SDK chain via `@paypal/agent-toolkit`), no non-breaking fix. | Accepted | Documented in `docs/security-note-ai-sdk-vulns.md`. |
| S6 | Unauthenticated `POST /api/webhooks/paypal` triggered an outbound PayPal verify call per request, with no limit (quota burn / amplification). | Medium | **Fixed**: per-IP limit 300/min before verification (`ipRateLimit`). |
| S7 | Public verifiers `/api/evidence/verify`, `/api/mandates/verify`, `/api/mandates/public` had no limit (CPU cost of signature checks). | Medium | **Fixed**: per-IP limit 60/min. |
| S8 | Split Bill write routes (create, invite, join, pay, cancel, renew) had no rate limit. | Low–Medium | **Fixed**: `sessionRateLimit(30, 120)` as on checkout. |
| S9 | AG Grid script on the dashboard (page that keeps the ops key in `sessionStorage`) loaded from the CDN without Subresource Integrity. | Medium | **Fixed**: pinned `@33.0.0` + `integrity` (SHA-384 of the npm tarball file) + `crossorigin`; locked by `dashboard-sri.test.ts`. Verify once in a browser that the dashboard still loads. |
| S5 | Free Render Postgres expires after 30 days and has no backups. | Operational | Fine for the judging window; do not leave it for production. |

No hard-coded secrets were found in the files reviewed; `.env` is git-ignored.

## 4. Test status (what each number proves)

- Author's machine (reported 3 Nov 2026): backend 118 suites / 1187 tests, `tsc` 0, `flutter analyze` 0 issues, `flutter test` 223 passed — **mocks + pg-mem only**.
- Audit environment (this zip, separate from the author's run): `tsc` 0; full backend Jest **123 suites / 1226 tests passed** (includes new `product-art-parity`, `ip-rate-limit`, `dashboard-sri`). Not comparable to the author's counts: different file set.
- Not verified anywhere yet: live refund / partial refund / webhook replay / Split Bill settlement; real-device Flutter run; Render cold start.

## 5. Remaining work, in priority order

1. Verify Flutter Split Bill on a device with two sessions (owner creates + invites, guest pastes the code, both pay in PayPal sandbox).
2. Live sandbox runs: Split Bill (2 payers), refund, failed payment → update `docs/PAYMENT_E2E.md`.
3. Decide S2, deploy to Render, wake with `/api/health`, record the < 3 min video (PayPal + AI + Agentic Commerce + AG Grid).
4. Devpost text: list only the sponsor tools actually used (AG Grid, Render, PayPal toolkit); omit Bryntum/Channel3/Elastic.

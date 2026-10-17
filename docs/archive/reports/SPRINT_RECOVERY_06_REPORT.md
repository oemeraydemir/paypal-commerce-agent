# Sprint Recovery 06 — Evidence-First Remediation Report

**Repository:** `C:\Projects\FinCan\paypal-commerce-agent`
**Branch:** `fix/render-deployment`
**Mode:** Evidence-first. No commit / stage / push / deploy / webhook registration / live payment.
**No secrets are read, copied, or printed anywhere in this report.**

---

## 1. Baseline Git state

| Item | Verified value |
|---|---|
| Branch | `fix/render-deployment` |
| Working tree at start | Pre-existing tracked modifications (A1.5 backend files) + RECOVERY-01/02/03/04/05 untracked reports + A1.3–A1.9A reports. All preserved untouched. |
| `core.autocrlf` | not set at repo level — mixed LF/CRLF already present in the working copy |
| Changes made THIS sprint | Only the files in §3 (2 new source/JS, 2 source edits, 2 test edits, 1 new test). Everything else is pre-existing user work, untouched. |

`git status --short` at start already showed the A1.5 backend files (`health.ts`, `webhooks.ts`, and their 3 test files) and the full A1.x + RECOVERY report set as modified/untracked. I did **not** discard, reset, stage, or reformat any of it.

---

## 2. Verified findings and evidence

### F1 — P0: dashboard inline `<script>` blocked by Helmet's default CSP (RECOVERY-02)

**Verified, not assumed.** `app.ts` applied `helmet()` with `useDefaults:true`; Helmet 7.2.0's default CSP sets `script-src 'self'` **without** `'unsafe-inline'` and adds `script-src-attr 'none'`. Empirically captured header on `/api/orders`:

```
default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';
frame-ancestors 'self';img-src 'self' data:;object-src 'none';
script-src 'self' https://cdn.jsdelivr.net 'nonce-<per-response>';script-src-attr 'none';
style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
```

**Before my fix**, `dashboard.html` shipped an **11.5 KB inline `<script>`** (IIFE with `escapeHtml`, AG Grid wiring, `setInterval` 5 s polling of `/api/policy-events`). Under `script-src 'self'` with no nonce and no `unsafe-inline`, that entire block is **refused by the browser** → the Agent Control Center dashboard is a dead page (no grid, no polling). This is the concrete RECOVERY-02 breakage.

Note: RECOVERY-02's *checkout return/cancel* pages were already implemented and passing; the **dashboard** was the outstanding inline-script victim of the CSP.

### F2 — External script origin requirement (verified)

`dashboard.html` loads `ag-grid-community@31.0.0.min.js` from `https://cdn.jsdelivr.net`. That origin **must** remain allowed or the grid breaks. It is preserved in `script-src`.

### F3 — Backend test count: 242, not 241

**Resolved by actual output, not copied from a prior report.** Baseline `npx jest --runInBand` on the untouched working tree:

```
Test Suites: 20 passed, 20 total
Tests:       242 passed, 242 total   (exit 0)
```

### F4 — Flutter: browser-return approval cannot authorize capture (RECOVERY-02)

Verified by reading `checkout_provider.dart`:
- `handlePayPalReturn` sets `_paypalApproved = true` only on the **`/success`** deep link whose `token` matches the pending order; the cancel path calls `_cancelViaBackend` and never marks paid.
- `confirmApprovalInBrowser()` was changed so it **no longer sets `_paypalApproved = true`** — it only shows "Approval is not confirmed …". A user tapping "Approval return not received?" cannot flip the client into an approved state; capture still requires the server-validated success return.
- `checkout_provider_test.dart` asserts `paypalApproved == isFalse`, `captureCalls == 0`, and the new message after the manual-fallback path. **Passes 6/6 standalone and 32/32 in the full suite (exit 0).**

### F5 — Release HTTPS / debug-only cleartext (A1.9A) — verified, no change needed

- `api_service.dart`: `resolveBaseUrl({isRelease,url})` throws `StateError` in release when `API_BASE_URL` is missing or not `https://`; debug keeps the emulator URL; constructor uses `resolveBaseUrl()`. Preserved untouched.
- `main/AndroidManifest.xml`: `usesCleartextTraffic="true"` removed; added only to the **debug** source set. Preserved untouched.

### F6 — Payment/webhook boundaries (Phase D) — reviewed, no defect requiring change

Read and confirmed the following remain correct and were **not** altered:
- Session ownership on create/capture/cancel (`req.session!`; cross-session order → 404 indistinguishable from missing).
- Capture single-flight via `captureLock.acquire` (409 if held) + idempotency (409 if already PAID); ambiguous transport error → 502 with reservation kept; `ORDER_ALREADY_CAPTURED` → best-effort settle; `ORDER_NOT_APPROVED` → 400 retryable without touching the reservation.
- Reservation released **only** on a definitive outcome (`markOrderPaid` / `markOrderPaymentFailed` / `cancelUncapturedOrder`); the reconciler never releases on `CAPTURE_PENDING` / `UNKNOWN` / lookup-error.
- Webhook signature verification via PayPal's verify-webhook-signature API; **fail-closed** when `PAYPAL_WEBHOOK_ID` is missing; idempotency via in-memory set; `extractPayPalOrderId` handles `PAYMENT.CAPTURE.*` and `CHECKOUT.ORDER.APPROVED`.
- Public `/api/orders` exposes only `publicSessionRef` (non-reversible label), never PayPal ids.

No defect demonstrated here justified a behavior change → **no changes made** (rule 5 / rule 6).


The authoritative count is **242**. "241" is an off-by-one from a stale/partial run. My changes add 7 tests (§4), giving a final verified **249 passed / 21 suites, exit 0**.

---

## 3. Changes made, file by file, and why

| File | Change | Why |
|---|---|---|
| `apps/backend/public/dashboard.js` (**new**) | The former 11.5 KB inline dashboard IIFE, extracted byte-for-byte into a same-origin file. `node --check` passes (exit 0). | Removes the inline script CSP forbids, so the dashboard works **without** `unsafe-inline`. Logic unchanged. |
| `apps/backend/public/dashboard.html` | Replaced the inline `<script>…</script>` with `<script src="/dashboard.js"></script>`. Net: −318 inline lines, +1 line. Kept the CDN `<script src>` and all DOM markers. | Points the dashboard at the same-origin script allowed by `script-src 'self'`. |
| `apps/backend/src/app.ts` | Added a per-response nonce (`crypto.randomBytes(16).toString('base64')` → `res.locals.cspNonce`) and a narrow `contentSecurityPolicy` override: `script-src: ["'self'", 'https://cdn.jsdelivr.net', (req,res)=>\`'nonce-…'\`]`, `useDefaults:true`. Updated comments. | Lets the two dynamically rendered checkout pages run their tiny inline redirect via a per-response nonce, **without** `unsafe-inline`. Verified against helmet 7.2.0 (function-valued directive supported; nonce emitted correctly). |
| `apps/backend/src/routes/checkout.ts` | The shared `<script>` tag in the return/cancel HTML now renders `nonce="<cspNonce>"` when present. | Wires the CSP nonce into the inline redirect so it executes. No capture logic touched; cancel stays cancellation-only. |
| `apps/backend/tests/integration/security-headers.test.ts` (**new**) | 6 focused tests: CSP present; `script-src` has `'self'`+CDN and **no** `unsafe-inline`; `object-src 'none'`; per-response nonce present and **differs** between responses; checkout return & cancel inline `<script>` carries the response nonce and never contains `capture(`; dashboard.html has zero inline `<script>`. | Regression-proof the P0 fix. Header-shape/nonce wiring only — browser execution is NOT exercised (§5). |
| `apps/backend/tests/integration/dashboard.test.ts` | Updated dashboard marker test: assert `/dashboard.js` reference + no inline `<script>`; new test asserts `GET /dashboard.js` returns JS containing `escapeHtml`, `eventModal`, the policy-events fetch. | Old test asserted `escapeHtml` was in the HTML; it correctly moved to the external file. |
| `apps/backend/tests/integration/e2e-demo-flow.test.ts` | Same correction: assert `/dashboard.js` reference + no inline script; fetch `/dashboard.js` and assert `escapeHtml`, `setInterval`, `policy-events`. | Same reason as above. |

**Not changed** (verified correct / out of scope): `health.ts`, `webhooks.ts`, all A1.5 test files, all Flutter files, session/policy/reservation/pricing logic, webhook verification. No dependency added. No DB/Redis/AI/telemetry/feature added.

---

## 4. Commands executed, exit codes, test results

Windows PowerShell, run from the paths shown. `before/after` = relative to my code changes.

| # | Command | Exit | Result | B/A |
|---|---|---|---|---|
| 1 | `cd apps/backend; npm ci --no-audit --no-fund` | 0 | 477 packages installed | Before |
| 2 | `node --check public/dashboard.js` | 0 | syntax OK | After |
| 3 | `node` nonce probe against installed helmet 7.2.0 | 0 | emits `script-src 'self' https://cdn.jsdelivr.net 'nonce-…';script-src-attr 'none'` (function directive supported) | Before |
| 4 | `cd apps/backend; npx jest --runInBand` | 0 | **242 passed / 20 suites** (baseline) | Before |
| 5 | `cd apps/backend; npx jest --runInBand` | 0 | **249 passed / 21 suites** (7 added: 6 security-headers + 1 dashboard.js) | After |
| 6 | `cd apps/backend; npm run build` (`tsc -p tsconfig.json` + copy public) | 0 | build OK; `dist/public/dashboard.js` + `dashboard.html` emitted | After |
| 7 | `cd apps/flutter_app; flutter test test/checkout_provider_test.dart` | 0 | **6 passed** | After |
| 8 | `cd apps/flutter_app; flutter test` (full) | 0 | **32 passed** | After |
| 9 | `cd apps/flutter_app; flutter analyze` | 1 | only pre-existing `prefer_initializing_formals` **info** in `api_service.dart`; no new errors/warnings | After |
| 10 | `git diff --check` | 0 | no whitespace errors (only benign LF→CRLF advisories on already-mixed files) | After |

### 241 vs 242 — resolved
Baseline (command #4, untouched tree) is the source of truth: **242 passed**. "241" was an off-by-one from a stale/partial prior run. Post-change authoritative count: **249 passed / 21 suites, exit 0**. Counts taken from the runs above, not from any earlier report.

### Flutter transient-failure note
An earlier run (`ev_flutter_test.txt`, before this sprint's re-run) showed a single `F3: capture 409 ALREADY_CAPTURED…` failure. That is a **test-ordering/shared-state flake**, not a real defect: the same file passes 6/6 standalone (cmd #7) and the full suite passes 32/32 cleanly (cmd #8). Reported honestly rather than claiming a clean history that did not occur.


---

## 5. Known unverified behavior

- **Browser-level CSP execution is NOT verified.** The tests prove the CSP header shape, that no inline dashboard `<script>` is served, that the checkout inline script carries the response nonce, and that the nonce varies per response. They do **not** prove a real Chrome/WebView executes `/dashboard.js` under the nonce CSP — that needs a browser (jsdom does not enforce CSP). Labelled unverified per instructions; a source-string `toContain` is explicitly not treated as proof of execution.
- **Flutter device build (APK manifest transport proof)** was not re-run this sprint; it was proven in A1.9A (release APK omits cleartext). `flutter doctor` reports `adb` unreachable ("Alle Pipeinstanzen sind ausgelastet") and no Android device/emulator — the emulator E2E path is not exercisable here.
- **Live Render deployment / real PayPal webhook signature round-trip** is out of scope and not performed.

---

## 6. Remaining security/payment blockers

1. **P2 — Browser confirmation of the dashboard under CSP.** Deploy/serve and confirm the grid renders and polls with no CSP console violations. (Code is correct; only live-browser proof is missing.)
2. **P2 — Flutter release signing keystore** still TODO (from A1.9A); release builds must always pass `--dart-define=API_BASE_URL=https://…` or they fail closed at startup by design.
3. **Pre-existing, out of scope (unchanged):** in-memory webhook idempotency set is not persisted across restarts (documented S5 limitation); single-process in-memory stores (no Redis). No change made per rule 6.
4. **Line-ending noise:** the working copy mixes LF/CRLF on already-modified files; `git diff --check` is clean (exit 0). Repo-wide normalization was **not** run (rule 9).

---

## 7. Exact recommended next step

1. Open the deployed (or locally served) `/dashboard.html` in a real browser and confirm the AG Grid renders and the 5-second `/api/policy-events` poll runs with **no CSP console violations** — the only unverified proof for the P0 fix.
2. Then produce the review ZIP. **Exclude**: `.env` / `.env.*`, `node_modules/`, `dist/`, `coverage/`, `*.log`, the Flutter build/lock caches, and this sprint's scratch `ev_*.txt` / `baseline_*` / `dn*.txt` evidence files. `.gitignore` already excludes `.env`, `dist/`, `node_modules/`, `coverage/`, `*.log`; the `ev_*.txt` scratch files and report `.md` files are untracked working artifacts and must be left out of the ZIP (or explicitly listed) so only intended source/tests/reports ship.

**Stop here.** No commit, push, deploy, webhook registration, or live payment was performed.


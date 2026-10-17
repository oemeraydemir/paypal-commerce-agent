# Recovery 10A — Pre-deployment Integration Audit — Report

**Audit outcome: COMPLETE.**
**Deployment readiness: BLOCKED — do NOT deploy yet.** Concrete gates are listed in §5.

Repo `C:/Projects/FinCan/paypal-commerce-agent` · branch `fix/render-deployment` ·
local HEAD `ee6209bd…` = remote tip of `origin/fix/render-deployment`.
Evidence and scripts live outside the repo in `C:/Projects/FinCan/recovery09d/`.

---

## 1. Git integrity — PASS

- Branch `fix/render-deployment`; HEAD `ee6209bdfc7c18981dee6df192a02a7f5dec3770` (unchanged since 09D).
- Remote `origin = https://github.com/oemeraydemir/paypal-commerce-agent.git`; `git ls-remote` shows
  `refs/heads/fix/render-deployment = ee6209bd…` → the local HEAD is the pushed tip.
- Full `git status --short` (unchanged from the 09D end state):
```
 M apps/backend/src/routes/checkout.ts
 M apps/backend/tests/verification/p0-claims.test.ts
 M apps/flutter_app/lib/providers/checkout_provider.dart
 M apps/flutter_app/lib/services/api_service.dart
 M apps/flutter_app/test/checkout_provider_test.dart
?? apps/backend/public/app.js
?? apps/backend/public/index.html
?? apps/backend/tests/integration/web-storefront.test.ts
?? apps/flutter_app/test/checkout_capture_state_test.dart
?? recovery07_1/
```
- **Only two storefront changes were made this turn (Recovery 09D):** `checkout.ts` (modified) and
  `apps/backend/public/app.js` (created). The full tracked diff for `checkout.ts` contains exactly the
  two scoped edits (UA-branched redirect + fallback link). The other four tracked modifications
  (`p0-claims.test.ts`, `checkout_provider.dart`, `api_service.dart`, `checkout_provider_test.dart`)
  and the other untracked paths are the **pre-existing Recovery 07.1 work**, byte-identical to the
  09D before-state. No pre-existing change was touched.
- Running `npm run build` did not alter git status (`dist/` is gitignored) — verified.

## 2. Flutter regression — ISOLATED: environment fault, not source

Requested low-risk sequence, run as separate commands:
| Check | Result |
|---|---|
| `flutter --version` | **FAIL** — `CreateFile failed 231 (all pipe instances busy)`, exit 255 |
| `flutter doctor -v` | **FAIL** — same error, exit 255 |
| `flutter test --reporter expanded` (retry) | **FAIL** — same error, exit 255 |
| Control: `node -e "execSync('echo hello')"` | **FAIL** — `EBUSY` (no child process can be spawned at all) |

**Root cause:** the sandbox has exhausted Windows named-pipe instances (`process_win.cc:744`), so *any*
child-process spawn fails. Flutter's CLI spawns `git` at startup, so it dies before touching the project.
This is the same environmental limitation documented in prior sessions — **not a Flutter source regression.**
Per instruction, no Flutter source was changed.

**Read-only static sanity check** (as a substitute for the blocked run): the Recovery 07.1 `settled`
wiring is internally consistent — `ApiException.settled` is nullable, populated from `details.settled`
(`api_service.dart`), and consumed in `checkout_provider.dart` at both the capture and cancel paths;
the test files cover verified (`true`), unverified (absent), and failed-reconciliation (`false`) cases.
**`flutter test` remains NOT RUN — environment only.**

## 3. Real browser flow — PASS (headless Chrome 154, puppeteer-core)

Script: `browser_flow_check.cjs` → `10a_browser_flow_result.json`. Chrome `154.0.8037.98`, local server.

| Scenario | Evidence |
|---|---|
| Storefront loads + app.js executes (CSP-safe) | `GET /` 200; **8 catalog cards rendered**; `/app.js` 200 `application/javascript`; `/api/catalog` 200; CSP `script-src 'self' https://cdn.jsdelivr.net 'nonce-…'` (no `unsafe-inline`); **0 console errors, 0 page errors, 0 CSP violations** |
| Cart interaction (real clicks) | Add → `#cart` shows "Vegetarian Breakfast €10.00 each − 1 +", total **€10.00**, Pay enabled; "+" → qty **2**, total **€20.00** |
| Desktop PayPal return | navigations: `/api/checkout/return?token=ORDER-9` → **`/?paypal=success&token=ORDER-9`** → `/` (app.js `history.replaceState`). Desktop redirect works. |
| Desktop cancel | lands on the web app; banner "Checkout cancelled. Nothing was charged." |
| Mobile return (iPhone UA) | stays on the checkout page; Chrome logs **"Failed to launch 'paypalcommerceagent://checkout/success?token=ORDER-9' because the scheme does not have a registered handler."** → the mobile deep-link branch executed. |
| Pending-order guard (no fabrication) | After the desktop return with no stored pending order, the banner reads **"This PayPal return does not match an order from this browser, so nothing was captured."** — the client never marks anything paid. |
| Hostile token | `/api/checkout/return?token="><script>x</script>` → encoded; `window.x` undefined; only `<script src="/app.js">` in the DOM; 0 CSP violations. |
| Graceful degradation (AI/PayPal disabled) | Pay → banner "PayPal is not configured on this server."; chat → "The AI is not configured on this server (OPENAI_API_KEY missing). You can still use the menu." |

### Finding F1 (edge case, NOT a 09D regression)
On a **mobile UA with no registered handler** for `paypalcommerceagent://`, the attempted deep-link
navigation **blanks the document** (JS-disabled delivery is intact: 2 anchors / 411 bytes; JS-enabled:
body length 0), and the 1200 ms `setTimeout` then throws `TypeError: Cannot set properties of null
(setting 'hidden')`. This is the *pre-existing* behaviour of the scheme path (the pre-09D code called
`location.replace(appLink)` unconditionally, so it also affected desktop). **09D removes it for desktop**
by routing desktop to the web app. Whether the blanking also occurs on a real mobile device (vs. headless
Chrome) was **not verified — no device available.** The fallback link is unreachable in this no-handler
case, so the fallback is belt-and-braces only.

## 4. Sandbox payment verification — logic PASS (mocked PayPal); LIVE SANDBOX BLOCKED

Live PayPal Sandbox capture/cancel **could not be run**: no `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`,
no public webhook URL, and the PayPal client hardcodes `https://api.sandbox.paypal.com` (no mock base URL),
so a local mock would require unauthorized source changes. Verified instead at the code + mocked-suite level:

| Required scenario | Evidence (test name → result) |
|---|---|
| Real capture result | `POST /api/orders/:id/capture succeeds → PAID` ✓ |
| Cancellation | `1f checkout cancel: GET page stays side-effect free; POST /cancel releases only after PayPal confirms` ✓; `1f-2 cancel is refused (and settled as PAID) when PayPal says the money was already captured` ✓ |
| Repeated / concurrent requests | `Concurrent same key + same body → both 200, same orderId` ✓; `Idempotency: same key + different body returns 409` ✓; `a second concurrent capture is rejected without a second PayPal call` ✓; `webhook replay … does not double count` ✓ |
| Ambiguous capture states | `1d ambiguous capture (502) keeps the reservation … then settles on COMPLETED` ✓; `1e capture returning PENDING keeps the reservation` ✓; `capture PENDING is kept even far past the max age (never guess)` ✓; `unknown status is kept … (never guess)` ✓; `COMPLETED without capture evidence is kept … (never guess)` ✓; `capture response lost (502) then retried: ORDER_ALREADY_CAPTURED is settled from PayPal → PAID` ✓ |
| No client message / URL param as payment proof | capture sets `PAID` only when the server's PayPal response is `COMPLETED` (`routes/orders.ts`); the `?token=` return param is matched client-side to the stored pending order only and does not authorize capture; the Flutter client requires `details.settled === true`. `2e another session cannot capture or cancel an order it does not own` ✓ |

**62/62** tests in the four payment-focused suites pass. Live-sandbox verification is **BLOCKED**
(needs real sandbox credentials + a public webhook URL).

## 5. Pre-deployment readiness — BLOCKED (do not deploy)

| # | Gate | Status | Detail |
|---|---|---|---|
| G1 | Target Render service is live | **BLOCKED** | `https://paypal-commerce-agent-backend.onrender.com/*` returns 404 with **`x-render-routing: no-server`** → **no Render service is running at that hostname**. The target service must be (re)created and its URL confirmed. |
| G2 | Deployable commit contains the fix | **BLOCKED** | The only deployable SHA is the remote branch tip `ee6209bd…`, which does **not** contain the 09D storefront fix. `checkout.ts` and `app.js` are **uncommitted**; `index.html` and `app.js` are **untracked** → they are not in the repo at all, so a git-based deploy would ship neither. `/` and `/app.js` would 404 in production. |
| G3 | Environment variables | READY (template) | `render.yaml` + `.env.render.example` define `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `PAYPAL_ENABLED`, `PAYPAL_ENV`, and mark `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `OPENAI_API_KEY` as secrets (`sync: false`). Secrets are user-only and must be set in the dashboard. |
| G4 | Webhook configuration | NOT DONE | `scripts/register-webhook.ts` registers `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `CHECKOUT.ORDER.APPROVED` at `/api/webhooks/paypal`; `PAYPAL_WEBHOOK_ID` is still unset. Must be run after deploy. |
| G5 | Build/packaging | PASS | `npm run build` exit 0; emits `dist/src/server.js` and `dist/public/{app.js,index.html,dashboard.html,dashboard.js}` (public/ is copied). |
| G6 | CI expectations | STALE | `.github/workflows/ci.yml` still says "expect **143/143**" (actual suite is **253/253**) and its artifact check asserts only `dist/src/server.js` + `dist/public/dashboard.html` — it does **not** assert the storefront `dist/public/app.js` / `index.html`. |
| G7 | Post-deploy SHA verification | AVAILABLE | `/api/health` exposes `buildCommit` (from `RENDER_GIT_COMMIT`) to confirm the deployed SHA. |

### Recommended sequence before any deploy (user actions)
1. Commit the 09D storefront fix **including the currently-untracked `app.js` and `index.html`** (and the pre-existing 07.1 changes as appropriate) so the fix is actually in the deployed SHA.
2. Update `ci.yml` expectations (253) and add `dist/public/app.js` / `index.html` to the artifact assertions.
3. Create/confirm the Render web service; set the secret env vars in the dashboard.
4. Deploy, then verify `/api/health` `buildCommit` equals the intended SHA, `GET /` returns the storefront, and `/app.js` is served.
5. Register the PayPal webhook and set `PAYPAL_WEBHOOK_ID`, then run the live sandbox capture/cancel checks.

## 6. Honesty statement
- No deploy, commit, push, ZIP, webhook registration, or live PayPal operation was performed.
- Real PayPal Sandbox capture/cancel/duplicate/ambiguous checks were **not** executed live (no credentials / no public webhook URL); they are evidenced by the mocked-PayPal integration suite.
- The real-browser flow was executed in **headless Chrome 154** against the **local** server; it is not a live Render or live PayPal verification. Finding F1 was observed in headless Chrome and not confirmed on a physical device.

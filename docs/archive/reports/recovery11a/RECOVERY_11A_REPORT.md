# Recovery 11A — Minimal Mobile Return Fix

**Repository:** `C:\Projects\FinCan\paypal-commerce-agent`
**Branch:** `fix/render-deployment`
**Baseline HEAD:** `ee6209bdfc7c18981dee6df192a02a7f5dec3770` (unchanged this turn)
**Date:** 2026-10-13
**Verdict: PASS WITH FINDINGS** — local acceptance criteria met; one scope-extension finding flagged; live/deploy gates remain blocked.

---

## 1. Preflight (recorded before any edit)

- **Branch / HEAD:** `fix/render-deployment` / `ee6209bdfc7c18981dee6df192a0a7f5dec3770` — matched the expected baseline.
- **Working tree:** identical to the recorded 09D state (5 modified + 5 untracked, incl. the 09D `checkout.ts` + `app.js`). No unexpected change → proceeded.
- **Protected-file hashes (before)** recorded (see §5).

## 2. Objective & fix requirements — compliance matrix

| # | Requirement | Status | Where |
|---|------------|--------|-------|
| 1 | Keep desktop return branch unchanged | ✅ | `checkout.ts` desktop `location.replace(webLink)` untouched |
| 2 | Preserve encoded token + CSP nonce/security contract | ✅ | `scriptWebLink`/`htmlWebLink` use `encodeURIComponent`; nonce retained on inline `<script>` |
| 3 | Make the browser fallback visible immediately | ✅ | `#fallback-message` is visible by default (no `hidden` attr); page no longer blanks, so the web fallback is reachable |
| 4 | Do NOT navigate parent document to custom scheme automatically | ✅ | Mobile branch no longer calls `location.replace(scheme)` |
| 5 | Deep-link affordance retained but must not block web fallback | ✅ | `<a href="paypalcommerceagent://…">Return to AI Café</a>` kept as a user-triggered anchor; `Continue in the browser instead` web link always present |
| 6 | No `innerHTML`/`eval`/unsafe interpolation/CSP weakening | ✅ | None introduced; server-side HTML-escaping of the token retained |
| 7 | Server authoritative for payment state | ✅ | Return page performs no capture; browser evidence confirms `captureAttempts: []` |

## 3. Changed files (exactly the authorized set, plus one flagged extension)

### 3.1 `apps/backend/src/routes/checkout.ts` — M (tracked) — AUTHORIZED
Minimal mobile-branch change. Removed the destructive mobile `window.location.replace(${scriptAppLink})` and the now-pointless `setTimeout` reveal; kept the desktop `location.replace(${scriptWebLink})`; the web-fallback link (added in 09D) is unchanged.

```diff
     <script${res.locals.cspNonce ? ` nonce="${res.locals.cspNonce}"` : ''}>
-      window.location.replace(${scriptAppLink});
-      window.setTimeout(function () {
-        document.getElementById('fallback-message').hidden = false;
-      }, 1200);
+      if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
+        window.location.replace(${scriptWebLink});
+      }
     </script>
   …
       <a href="${htmlAppLink}">Return to AI Café</a>
       <p><a href="${htmlWebLink}">Continue in the browser instead</a></p>
```
No payment/capture/idempotency/session/settlement logic was touched.

### 3.2 `apps/backend/tests/integration/web-storefront.test.ts` — untracked (09D-created, edited 11A) — AUTHORIZED
Test 3 updated: dropped the obsolete assertion requiring `window.location.replace("paypalcommerceagent://…")`; now asserts (a) desktop auto-redirect unchanged, (b) mobile does **not** auto-navigate to the scheme, (c) the deep link remains a user-triggered `href`, (d) the web fallback is present. All other security assertions retained.

### 3.3 `apps/backend/tests/integration/checkout.test.ts` — M (tracked) — ⚠️ SCOPE EXTENSION (FLAGGED)
**Not in the literal authorized file list**, but required for coherence. This file contained two tests that asserted the exact destructive behavior being removed:
- test 1 asserted `window.location.replace("paypalcommerceagent://checkout/success?token=…")` and `window.setTimeout(function ()`.
- test 2 asserted `window.location.replace("paypalcommerceagent://checkout/cancel?token=ORDER-123")`.

With the source fix these assertions failed (2 of 253). They are the **same class of obsolete assertion** the task already authorized updating in `web-storefront.test.ts` test 3. They were updated — not weakened — to verify the new safe contract (no auto-navigation; deep link as anchor; web fallback present; token still encoded; no `capture(`). **Recommend the user review/approve this file as part of the change set.** Without it the suite would be red, violating the explicit `npx jest --runInBand` gate.

### 3.4 `recovery09d/browser_flow_check.cjs` — outside repo — AUTHORIZED (item 3)
Corrected the documented F2 probe defect and removed silent screenshot catches (F3):
- `landedOnWebApp` now measured from the actual `framenavigated` event (`c.navigations.some(u => /\/\?paypal=(success|cancel)&token=ORDER-9/.test(u))`) instead of a post-`history.replaceState` URL.
- Added a `request` listener tracking `/api/orders/*/capture` so the mobile scenario can prove the return page never captures.
- Every `screenshot()` failure is now recorded (`screenshotError`) instead of swallowed by `catch {}`.
- Mobile step now reports `bodyLen`, `fallbackLink`, `deepLinkHref`, `schemeAutoNavigated`, `captureAttempts`, `pageErrors`, `cspViolations`.
- Output written to `11a_browser_flow_result.json` (kept separate from 10A).

### 3.5 `recovery09d/browser_interactions.cjs` — outside repo — AUTHORIZED (item 4)
Identified its exact path; added `fs.writeFileSync('…/11a_interactions.json', …)` and removed the silent screenshot `catch {}` so the cart-interaction scenario also emits machine-readable JSON (F3).

## 4. Test commands & exit codes

| Command | Result |
|---|---|
| `npx jest --runInBand tests/integration/web-storefront.test.ts` | **4/4 PASS**, exit 0 |
| `npx jest --runInBand` (full suite) | **253/253 PASS, 22/22 suites**, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `git diff --check` | exit 0 |

No test was weakened; the two updated assertions in `checkout.test.ts` raise the bar to verify the *safe* contract.

## 5. Protected-file hashes — before / after (identical ⇒ unchanged)

| File | SHA-256 (before = after) |
|------|--------------------------|
| `apps/backend/public/app.js` | `bc94b8089e70800e709f10399f2fa952e874b4c7e096aa03f581bf42a372a479` |
| `apps/backend/tests/verification/p0-claims.test.ts` | `a4f6998b95997ee88d0355a7b2d8bad4cc4160c33def7e660fc056f15868f72a` |
| `apps/flutter_app/lib/providers/checkout_provider.dart` | `96a9213bee5c947ab0bdc0615463ee7179438cf065d36f481391cce72210dc15` |
| `apps/flutter_app/lib/services/api_service.dart` | `f8612d821b17c9b0ec7202008e1e2babe6f441828d21309d20763c18354ef56f` |
| `apps/flutter_app/test/checkout_provider_test.dart` | `a943c8f00c647f97e611900866874a0fd4180c5b343db141f5a3a2fdfdf7782f` |
| `apps/flutter_app/test/checkout_capture_state_test.dart` | `f45e68cf3113a57dc150cdb88ed14922a83c71dde4ccd7735c2952b21a433841` |

All six are **byte-identical** before/after.

## 6. Real-browser evidence (headless Chrome 154 via puppeteer-core)

### 6.1 Mobile no-handler scenario — F1 CONFIRMED
Source: `11a_browser_flow_result.json` → `steps.mobileReturn`; screenshot `11a_mobile_return.png`.
```
bodyLen: 454                     → parent document POPULATED (was 0 before the fix)
fallbackLink: { text: "Continue in the browser instead",
                href: "/?paypal=success&token=ORDER-9" }   → web fallback VISIBLE + CLICKABLE
deepLinkHref: "paypalcommerceagent://checkout/success?token=ORDER-9" → deep link retained as anchor
stayedOnCheckout: true            → page did NOT navigate away
schemeAutoNavigated: false        → parent never navigated to the custom scheme
captureAttempts: []               → return page CANNOT mark an order paid
pageErrors: []                    → no unexpected page error
cspViolations: []                 → CSP clean
consoleErrors: ["Failed to load resource: 404"]  → benign /favicon.ico auto-request (see §7)
```
The mobile deep-link failure can no longer blank the page, and the web fallback is reachable. This directly closes the 10B F1 finding.

### 6.2 Desktop return / cancel — F2 CONFIRMED
`landedOnWebApp` recalculated from the real navigation event:
- `desktopReturn.landedOnWebApp = true` (was `false` under the defective probe)
- `desktopCancel.landedOnWebApp = true`
The storefront banner rendered in both cases (proving `app.js` processed the `?paypal=` param).

### 6.3 Storefront + cart interaction
- `storefront.cardsRendered = true`, screenshot `11a_storefront.png`, no `screenshotError`.
- Cart: add → **€10.00**, `+` → **€20.00**; PayPal-disabled → graceful banner "PayPal is not configured on this server." (`11a_interactions.json`). `pageErrors: []`.

## 7. Unresolved / benign findings

- **F-benign-404:** the single mobile `consoleErrors` entry is a `GET /favicon.ico 404` auto-requested by Chrome (`server.log` confirms). It is not a functional error and does not affect the return flow.
- **F-scope:** `checkout.test.ts` was modified beyond the literal authorized list (see §3.3). Required and same-rationale as the authorized test-3 update; flagged for user review.
- **F-flutter:** the Flutter suite could not be executed — the sandbox cannot spawn child processes (`node -e execSync('echo hello')` → `EBUSY`; `flutter --version` → `CreateFile failed 231`). Per instructions, **no Flutter source was modified** to work around this. **Flutter: NOT RUN — ENVIRONMENT BLOCKED.**

## 8. Live release gates — remain BLOCKED / separate (not closed by this task)

- **PayPal Sandbox** capture/cancel: not executed (no credentials; PayPal client hardcodes `api.sandbox.paypal.com`, no mock hook). Mock tests do not substitute.
- **Webhook** registration: not performed.
- **Render service / URL:** `paypal-commerce-agent-backend.onrender.com` returned `x-render-routing: no-server` in 10A (no live service); not re-verified this turn.
- **Deployment SHA verification:** the 09D/11A changes are uncommitted/untracked → not in any deployable SHA.
- **Commit / push:** not performed.

## 9. Final Git status

```
 M apps/backend/src/routes/checkout.ts
 M apps/backend/tests/integration/checkout.test.ts      ← 11A scope extension (flagged)
 M apps/backend/tests/verification/p0-claims.test.ts    (pre-existing 09D/07.1)
 M apps/flutter_app/lib/providers/checkout_provider.dart (pre-existing 07.1)
 M apps/flutter_app/lib/services/api_service.dart        (pre-existing 07.1)
 M apps/flutter_app/test/checkout_provider_test.dart     (pre-existing 07.1)
?? apps/backend/public/app.js                           (09D-created)
?? apps/backend/public/index.html                       (09D-created)
?? apps/backend/tests/integration/web-storefront.test.ts (09D-created, 11A-edited)
?? apps/flutter_app/test/checkout_capture_state_test.dart (07.1)
?? recovery07_1/
```
HEAD `ee6209bdfc7c18981dee6df192a02a7f5dec3770` — unchanged.

## 10. Conclusion

The mobile return page can no longer destroy the parent document or hide the browser fallback when no `paypalcommerceagent://` handler exists; the web fallback is always visible and clickable, and the return page still performs no payment capture. All local acceptance criteria pass: storefront 4/4, full suite **253/253**, `tsc` clean, `git diff --check` clean, protected hashes unchanged. The only deviation from the literal authorized scope is the necessary update of two obsolete assertions in `checkout.test.ts` (same rationale as the authorized test-3 change) — flagged for review. **No deployment was performed or authorized; all live-payment and deployment gates remain closed.**

**Verdict: PASS WITH FINDINGS.**

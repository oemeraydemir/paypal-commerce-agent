# Recovery 10B — Evidence Reconciliation — Report

**Mode: READ-ONLY.** No source, test, config, screenshot, report, or Git metadata was modified.
No commit / push / deploy / ZIP / webhook / live payment call was made. All existing working-tree
modifications and untracked files are preserved (verified in §3).

**Reference:** `C:/Projects/FinCan/recovery09d/RECOVERY_10A_REPORT.md`
**Destination availability:** the 10A evidence directory `C:/Projects/FinCan/recovery09d/` is
available and writable; this report is written there, alongside the 10A evidence, as instructed.

**Verdict: PASS WITH FINDINGS** — see §5.

---

## 1. Screenshot provenance

| Property | Value |
|---|---|
| **Resolved absolute path** | `C:/Projects/FinCan/recovery09d/10a_storefront.png` |
| File size | 80,530 bytes |
| Dimensions | 1440 × 1032 px (PNG, bit depth 8, colour type 2 = truecolour) |
| SHA-256 | `6a6e730b5fbedd4b343fac874678150fdc22125ea2fb9d5d73da600fdd2ebfb8` |

Located by search (`find … -iname "10a_storefront.png"`), not assumed: it is the only match under
`C:/Projects/FinCan`. It sits in the Recovery 10A evidence folder.

### What is visible (direct inspection)
- Header: **"☕ AI Café"**, tagline "Shop by intent. Review every item. Approve every payment.",
  and two **red "off" pills: "AI not configured" and "PayPal not configured"**, plus an
  "Agent Control Center →" link.
- Left panel "Ask the café agent": one assistant bubble ("Hi! Tell me what you need and what you
  want to spend. I prepare the cart; you approve the payment."), the three suggestion chips, the
  message input, a blue **Send** button, and the shopper-profile controls.
- Right panel "Your cart": **"Your cart is empty…"**, **Total €0.00**, and a **greyed-out/disabled
  "Review & pay with PayPal"** button.
- Bottom "Menu" panel: **8 product cards** (Vegetarian Breakfast €10.00, Fresh Brewed Coffee €3.00,
  Fresh Orange Juice €3.50, Premium Chocolate Cake €45.00, Café Gift Box €35.00, Fresh Flower Bouquet
  €25.00, Fluffy Pancakes €9.00, Café Latte €4.50), each with an "Add" button.
- Footer: "Hackathon prototype · PayPal sandbox only · no real money moves…".

### Does it support the 10A claims?
- **CONFIRMED (supported):** the storefront loads; `app.js` executed and `/api/catalog` succeeded
  (8 cards rendered — they are built by `renderCatalog`); the AI/PayPal badges correctly show
  "not configured" (matches `badgeAI`/`badgePP` in the JSON); the cart starts empty and Pay is
  disabled. This matches the JSON `storefront` block (`catalogCards: 8`, `payDisabled: true`,
  `emptyCartMsg`, `title`, `h1`).
- **NOT supported by this screenshot (correctly):** nothing in it shows a checkout redirect, a
  payment, a capture, or a deployment. It is a first-load storefront capture. **No checkout,
  payment, capture, or deployment success is inferred from it.** Console/CSP state is also not
  visible in a screenshot — those claims rest on the JSON (`windowCsp: []`, `consoleErrors: []`).

---

## 2. Browser evidence reconciliation

Sources: `10a_browser_flow_result.json` and `browser_flow_check.cjs` (both present, read-only).

### D1/D2 — `desktopReturn.landedOnWebApp = false` and `desktopCancel.landedOnWebApp = false`
**Classification: CONFIRMED probe/assertion defect (NOT an application defect).**

The probe measures the wrong moment with a strict anchor. Exact code:
```js
// browser_flow_check.cjs:87  (desktop return)
landedOnWebApp: /\/\?paypal=success&token=ORDER-9$/.test(p.url()),
// browser_flow_check.cjs:105 (desktop cancel)
landedOnWebApp: /\/\?paypal=cancel&token=ORDER-9$/.test(p.url()),
```
`p.url()` is read **after `await sleep(1500)`** (lines 84 / 102), but by then `app.js`'s
`handleReturn()` has already run `history.replaceState(null, '', '/')` (app.js line 123), which
rewrites the URL to `http://localhost:3000/`. The regex is anchored with `$`, so it cannot match `/`.
Hence `false` — the field is a **timing/anchoring artefact**, not evidence that the redirect failed.

Direct counter-evidence that the redirect **did** happen:
```json
"desktopReturn": { "navigations": [
  "http://localhost:3000/api/checkout/return?token=ORDER-9",
  "http://localhost:3000/?paypal=success&token=ORDER-9",   <-- the web-app URL was reached
  "http://localhost:3000/" ] }
```
For cancel, the JSON stores no `navigations`, but the combination of `finalUrl = http://localhost:3000/`
with `bannerText = "Checkout cancelled. Nothing was charged."` is decisive: that banner is emitted
only by `handleReturn()` for `st === 'cancel'`, i.e. only after `/?paypal=cancel&token=…` was processed
on the storefront. The screenshot `10a_desktop_return.png` independently shows the **storefront**
(with the mismatch banner), i.e. the desktop browser is on the web app, not the checkout page.

### D3 — `mobileReturn.fallbackLinkText = null`
**Classification: CONFIRMED consequence of the mobile blanking; the probe is faithful, not buggy.**

The probe is correct:
```js
fallbackLinkText: await p.evaluate(() => {
  const a = [...document.querySelectorAll('a')].find((x) => /Continue in the browser instead/.test(x.textContent));
  return a ? { text: a.textContent, href: a.getAttribute('href') } : null; }),
```
It returns `null` because **no `<a>` exists in the DOM at measurement time** — corroborated directly:
- `mobile_dom_dump.cjs` on the same URL: `anchorCount: 0`, `allEls: 7`, `bodyHTML: ""`.
- `mobile_isolate.cjs`: JS **disabled** → `anchorCount: 2`, `bodyLen: 411` (HTML is delivered fine);
  JS **enabled** → `bodyLen: 0` + `pageError: "TypeError: Cannot set properties of null (setting 'hidden')"`.
- Served HTML (curl, same server) contains both links, including
  `<p><a href="/?paypal=success&amp;token=ORDER-9">Continue in the browser instead</a></p>`.
So the link is present in the HTML but gone from the live DOM → the `null` is a symptom, not a
separate probe error.

### D4 — "the mobile deep-link failure can blank the document and make the fallback unreachable"
**Classification: CONFIRMED in headless Chrome; cause LIKELY (confirmed by elimination);
real-device impact UNVERIFIED.**

- CONFIRMED (headless Chrome 154): with a mobile UA and no handler for `paypalcommerceagent://`,
  the document body is emptied (`bodyLen: 0`) and the 1200 ms fallback callback throws.
- LIKELY (cause): the only DOM-affecting script is `window.location.replace(appLink)`; the sibling
  `setTimeout` merely sets a property. A working stub could **not** be installed to prove causality
  directly — `Location.replace` is unforgeable (`Object.defineProperty(Location.prototype,'replace',…)`
  and `location.replace = fn` were both ignored; `replaceCalls` stayed `[]`). Causality is therefore
  established by elimination, not by direct isolation.
- UNVERIFIED (impact): whether a physical mobile browser blanks the page the same way was not tested
  (no device). Chrome logged `"Failed to launch 'paypalcommerceagent://…' because the scheme does not
  have a registered handler."`

**Not a 09D regression:** the pre-09D route called `window.location.replace(appLink)` unconditionally,
so the same blanking applied to desktop too; 09D removes it for desktop by branching to the web app.

### Additional evidence-provenance findings
- **`10a_mobile_return.png` does not exist.** `browser_flow_check.cjs:129` attempts it inside an
  empty `try { … } catch {}`, which silently swallowed the failure (the blanked document breaks
  `fullPage` capture). The 10A **report text references no screenshot paths at all** (grep: no `.png`),
  but the Recovery 10A **chat presentation** listed `10a_mobile_return.png` as an artifact — that
  reference was to a file that was never produced. Screenshots that do exist:
  `10a_storefront.png`, `10a_desktop_return.png`, `10a_interactions.png`.
- **The cart-interaction claims have no JSON artifact.** The interaction run printed to stdout and
  saved only `10a_interactions.png`; no `10a_interactions.json` was persisted. The screenshot does
  corroborate the claims (banner "PayPal is not configured on this server.", cart "Vegetarian Breakfast
  €10.00 each − 2 +", Total **€20.00**, chat reply "The AI is not configured on this server
  (OPENAI_API_KEY missing)…"), so the claims stand, but the machine-readable evidence is thinner than
  for the other steps.

---

## 3. Scope and Git integrity — CONFIRMED (audit introduced no changes)

```
$ git status --short
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

$ git rev-parse HEAD
ee6209bdfc7c18981dee6df192a02a7f5dec3770

$ git diff --check
(exit 0; only a pre-existing LF→CRLF advisory for p0-claims.test.ts)
```
- The working tree is **identical to the Recovery 10A end state** (5 modified + 5 untracked; the
  only files from 09D are `checkout.ts` (M) and `app.js` (??)). Nothing was reset, stashed, checked
  out, restored, staged, or patched.
- `git diff -- apps/backend/src/routes/checkout.ts` is byte-identical to the 10A capture
  (`index 8d25069..9b6b68a`; the two scoped edits: the UA-branched redirect and the fallback link).
  No new change was introduced by this audit.

---

## 4. Findings summary

| # | Finding | Class |
|---|---|---|
| F1 | `landedOnWebApp:false` (return & cancel) is a probe timing/anchoring defect, not an app defect | **CONFIRMED** |
| F2 | The desktop return and cancel redirects **do** land on the web app | **CONFIRMED** |
| F3 | `fallbackLinkText:null` is a faithful measurement of the blanked mobile DOM | **CONFIRMED** |
| F4 | Mobile-UA deep-link failure blanks the document (headless Chrome) | **CONFIRMED** |
| F5 | The blanking is caused by the failed custom-scheme navigation | **LIKELY** (by elimination; no working stub) |
| F6 | Real-mobile-device behaviour for the no-handler case | **UNVERIFIED** |
| F7 | `10a_mobile_return.png` was never produced (silent empty `catch`); 10A chat presentation referenced it | **CONFIRMED** |
| F8 | The 10A report text references no screenshot paths (no false screenshot claim in the report) | **CONFIRMED** |
| F9 | Cart-interaction step has a PNG but no persisted JSON artifact | **CONFIRMED** |
| F10 | The storefront screenshot supports load / 8-card render / badges / empty-cart-disabled-Pay | **CONFIRMED** |
| F11 | No checkout / payment / capture / deployment is shown in the screenshot | **CONFIRMED** |
| F12 | Live PayPal Sandbox capture/cancel behaviour | **BLOCKED** (no credentials, no public webhook URL) |
| F13 | Flutter test suite | **BLOCKED** (child-process environment: `CreateFile failed 231` / `EBUSY`) |
| F14 | Correct Render service/URL | **BLOCKED** (`x-render-routing: no-server` at the target host) |
| F15 | A deployable commit containing the storefront files | **BLOCKED** (`app.js`/`index.html` untracked; `checkout.ts` uncommitted) |

**Substantive conclusion:** the 10A report's *conclusions* hold under reconciliation. The four
flagged inconsistencies are **evidence-quality defects** (one mis-anchored probe field, one
symptom-of-blanking field, one missing screenshot, one thinner artifact set) — **not application
defects**. The only application-relevant behaviour (mobile no-handler blanking) is pre-existing and
unchanged by 09D.

---

## 5. Release gates (explicit)

1. **Correct Render service and URL confirmed** — **OPEN / BLOCKED.** Target
   `https://paypal-commerce-agent-backend.onrender.com` returns 404 with `x-render-routing: no-server`
   (no service running).
2. **A reviewed commit contains all intended storefront files and changes** — **OPEN / BLOCKED.**
   Remote tip = `ee6209bd…`, which contains neither the `checkout.ts` edit nor `app.js`/`index.html`
   (untracked).
3. **Browser-return probe inconsistencies resolved** — **OPEN.** Root cause identified and documented
   (probe timing/anchoring); the probe itself has **not** been fixed (read-only audit).
4. **Mobile deep-link/fallback behavior understood** — **PARTIAL.** Blanking confirmed in headless
   Chrome and attributed; real-device behaviour **UNVERIFIED**.
5. **Flutter regression suite executed successfully in a functioning environment** — **OPEN / BLOCKED.**
   Environment cannot spawn child processes.
6. **PayPal Sandbox capture/cancel tested with real credentials + configured webhook** — **OPEN / BLOCKED.**
   No credentials, no webhook; mocked tests are not live-payment proof.
7. **Deployed SHA and storefront assets verified after deployment** — **OPEN.** Not deployed; the
   `/api/health` `buildCommit` hook exists for post-deploy verification.

## 6. Verdict

**PASS WITH FINDINGS.**

Rationale: the reconciliation objective was fully achieved read-only — every flagged discrepancy was
traced to its exact measurement code, the defective field (`landedOnWebApp`) was distinguished from
application behaviour using direct counter-evidence (the `navigations` array, the cancel banner, and
the desktop-return screenshot), the mobile `null` was explained as a symptom of a confirmed blanking,
and one missing artifact (`10a_mobile_return.png`) was surfaced. The 10A report's substantive claims
are supported; no application defect was found in the 09D scope, and no deployment is authorized.

**Deployment is NOT authorized by this task.** Gates 1, 2, 5 and 6 remain blocked; gates 3 and 4
remain open.

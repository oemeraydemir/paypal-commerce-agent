# Phase 3 — Batch 1 Runtime Bug Fix Report (Web UI + Session 401)

Date: 2026-10-25
Status: **PASS — runtime verified (web)** via real Chromium against the local backend. Flutter untouched this round; remains as previously source/test-verified.

---

## 0. Summary of owner-reported symptoms → outcome

| Owner symptom | Root cause | Outcome after fix |
|---|---|---|
| Onboarding modal did not appear | Stale cached `index.html` (browser serving an old bundle) and/or `aicafe.onboarded` already set from prior testing | PASS — onboarding shows on a clean first visit; a `?reset=1` hook makes the first-visit test repeatable without guessing a storage key |
| No Coco/AI avatar visible | Web build only had a small header badge; no avatar on chat messages | PASS — Coco now renders as a visible avatar on every assistant message (plus the header badge) |
| "Yapay zeka yapılandırılmamış" / "PayPal yapılandırılmamış" | Truthful reflection of `/api/health` (`ai.enabled:false`, `paypal.enabled:false`) — these services are genuinely not configured in this environment | PASS — banner is correct; documented under Task 4 |
| Two `401` on `POST /api/policy/preview` before session | Client fired protected policy-preview requests before a session existed, and lazily created sessions from multiple independent paths (duplicate session posts) | PASS — no avoidable 401s on load; exactly one session created; all policy-preview return 200 |

---

## 1. Task 1 — Onboarding visibility

**Root cause (confirmed):** The onboarding code (`initOnboarding()` in `app.js`) was correct and present in source. The reason it did not appear in the owner's browser is environmental: (a) a stale cached `index.html` served an old bundle (the browser's `304` responses are consistent with reusing cached assets), and/or (b) `localStorage["aicafe.onboarded"]` was already set from an earlier session, which intentionally suppresses the modal.

**Fixes:**
- `source/apps/backend/src/app.ts` — `serveBrandedIndex` now sends `Cache-Control: no-store` on the HTML shell. This guarantees the storefront shell is never cached, so a browser always re-fetches the current `/app.js` and `/i18n.js` (which get fresh ETags when they change). This eliminates the stale-bundle path.
- `source/apps/backend/public/app.js` — added a repeatable first-visit test hook: visiting `/?reset=1` clears all stored `aicafe.*` UI state (session, pending order, cart, allergens, onboarding flag, language) so onboarding is guaranteed to reappear on that load.

**Verification (real browser):** `http://localhost:3000/?reset=1` → onboarding overlay present, `hidden=false`, `display:flex` (visible). Clicking **Got it** hides it and sets `aicafe.onboarded="true"`. Reloading without the reset param keeps it hidden (persistence). All three onboard steps (Coco / why-items / allergy) are present in the modal.

---

## 2. Task 2 — Missing Coco/avatar

**Root cause (confirmed):** The avatar render code existed but only populated a small 22px header badge; assistant chat messages had no avatar, so there was no "recognizable Coco in the chat experience."

**Fixes** (`source/apps/backend/public/app.js` + `index.html`):
- Added `cocoSvg()` helper (single source of the Coco SVG); the header badge reuses it.
- Assistant messages (`.msg.a`) now render a visible Coco avatar to the left of the bubble (`.aval` avatar + `.bub` bubble, via new CSS).
- Confirmed the "Why these items?" (`renderWhy`) and unverified-allergy warning (`renderAllergyNote`) render from real server data / local prefs.

**Verification (real browser):**
- On load: 1 assistant greeting message with 1 avatar; header badge has its SVG.
- After sending a request: 2 assistant messages, 2 avatars.
- "Why these items?" block appeared from real server fields: `"Why these items? Cart exceeds confirmation threshold; explicit approval required … Order total 1900 exceeds the confirmation threshold 1000."`
- Allergen note appeared from local prefs: `"Allergy notice: Allergy information is unverified — including your noted concern(s): Gluten Allergen preferences are stored locally and are not filtered server-side."` (stored only in `localStorage`, never sent to the server).

---

## 3. Task 3 — Session 401 ordering

**Root cause (confirmed):** `api()` sent authenticated requests immediately and only created a session lazily on a 401. During boot, `renderCart()` scheduled a policy preview before `newSession()` had resolved; the preview went out without session headers → 401, and each 401 independently triggered `newSession()` → duplicate session posts (the owner's two 201s).

**Fix** (`source/apps/backend/public/app.js`):
- Added single-flight `ensureSession()` (shared promise). `api()` now awaits `ensureSession()` **before** sending any protected request; the 401-retry is retained purely as a safety net for genuinely expired/invalid sessions.
- `boot()`'s explicit session creation now uses the same shared `ensureSession()`.

**Preserved:** server-side session validation/authorization is unchanged (no auth weakening, no hiding/retrying errors blindly).

**Verification (real browser, full load + chat flow):**
- `/api/sessions` `POST` occurred exactly **1** time (201).
- Every `/api/policy/preview` returned **200** — zero 401s on the normal load.
- Zero console errors.

---

## 4. Task 4 — Configuration banners

**Root cause (confirmed — not a bug):** The pills read the real `/api/health` payload. In this environment the health response reports `ai.enabled:false` and `paypal.enabled:false`, so the UI correctly shows "AI not configured" and "PayPal not configured". These are truthful configuration states.

**Explanation / requirements:**
- **AI** is not configured because no AI provider key is set. **Optional for local UI verification** of onboarding/Coco/i18n/allergy/why-items (the rule-based fallback planner still returns a prepared cart + explanation). Required only to exercise live AI chat.
- **PayPal** is disabled because no sandbox credentials are active (the server is pinned to sandbox mode). **Required** only to exercise the PayPal checkout/capture flow; not needed for the UI features being verified.
- No credentials were invented, no payments enabled, no sandbox restriction changed.

---

## 5. Task 5 — Browser verification (performed)

Verified with real Chromium (installed for this task) driving `http://localhost:3000` against the running backend (`npm run dev`):

1. ✅ Clean first visit (`?reset=1`) displays onboarding.
2. ✅ All three onboarding steps present; **Got it** works; completion persists after reload.
3. ✅ Language toggle EN ↔ TR flips `documentElement.lang`, translated strings (e.g. heading becomes "Kafe asistanına sor"), and `<select>` value without reload.
4. ✅ Coco visibly rendered in the chat (avatar on assistant messages) and as the header badge.
5. ✅ Real prepared-cart response displays "Why these items?" built from server `reason`/`policyViolations`.
6. ✅ Allergen preferences show the unverified warning and remain client-local.
7. ✅ Normal initial load produces **no** 401 policy-preview requests; exactly one session is created.
8. ✅ No JavaScript errors; no missing script/asset requests.

---

## 6. Files changed

| File | Change |
|---|---|
| `source/apps/backend/src/app.ts` | `Serve-Control: no-store` on the storefront HTML shell (serveBrandedIndex) |
| `source/apps/backend/public/app.js` | `ensureSession()` single-flight; `api()` awaits session; `cocoSvg()` + assistant-message avatar; `?reset=1` first-visit hook; boot uses `ensureSession()` |
| `source/apps/backend/public/index.html` | CSS for `.msg.a` flex row + `.aval` + `.bub` |

No payment/refund/policy/tenant/CSP logic changed. No git/ZIP created. No unrelated files touched.

---

## 7. Owner verification steps

**Web:**
```
cd source/apps/backend
npm run dev            # port 3000
```
- **First visit test:** open `http://localhost:3000/?reset=1` → onboarding modal must appear → click **Got it** → type `http://localhost:3000` (no reset) and reload → modal stays hidden.
- **Language:** use the top-right **Language** dropdown; all page static text and € amounts switch EN ↔ TR without reload.
- **Coco avatar:** assistant messages show Coco on the left; the header badge also shows Coco.
- **Allergen:** click any allergen chip in the profile row → a red unverified warning appears naming the concern and stating it is stored locally, not filtered server-side.
- **Why these items?:** send e.g. "vegetarian breakfast for two under 20 euro" → the cart area shows a "Why these items?" explanation from the server.
- **No 401s:** open DevTools → Network → reload; you should see no `401` on `api/policy/preview` (only `200`).

**Flutter:** unchanged this round; run `flutter analyze` (currently clean) and `flutter test` (currently 100/100). The owner must still perform the Flutter emulator UI verification separately.

---

## 8. Remaining blockers / configuration requirements

- **AI chat** requires an OpenAI-compatible provider key in the backend environment; without it the UI correctly falls back to the rule-based planner (still useful for verifying prepared-cart + explanation UI).
- **PayPal checkout/capture** requires PayPal sandbox credentials; without them the "Review & pay" flow cannot be completed end-to-end.
- **Flutter runtime UI** verification remains **BLOCKED** here (no emulator in this environment) and is pending owner verification.

## 9. Mandatory statement

Passing automated tests is not the same as verifying visible UI behavior. The web fixes above **were** verified in a real browser runtime in this environment. The Flutter side has **not** been re-verified in an emulator here. I am **not** marking Batch 1 as accepted or complete; the owner will independently verify Web and Flutter before deciding to proceed.

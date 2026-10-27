# AI Café — Validation Report (Phase 2 verification round)

Status: **no code, test or dependency change was made in this round.** Only an
environment-only workaround (clearing proxy env vars for a single command) was
used. All results below are what was **actually executed**.

---

## 1. The five new Flutter tests — ROOT CAUSE FOUND, all tests now pass

**Root cause of the WebSocket error:** the sandbox exports `HTTP_PROXY` /
`HTTPS_PROXY` (`http://127.0.0.1:13290`) and `flutter_tester`'s local WebSocket
connection was being routed through that proxy, which rejected the upgrade:

```
Unable to connect to flutter_tester process: WebSocketException: Invalid WebSocket upgrade request
```

**Fix used (environment only — no test file, no dependency, no code touched):**

```bash
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
    NO_PROXY='*' no_proxy='*' flutter test --no-pub ...
```

### Result — five new test files: **21 tests, All tests passed!** (`00:19 +100`)

```
barista_avatar_widget_test.dart        → renders the Coco barista avatar with an accessible label
                                        → respects a custom size
typing_indicator_widget_test.dart      → animates without error and is labeled as typing
                                        → is a compact row of dots
cart_explanation_test.dart             → uses real server item names and quantities
                                        → includes server policy reason verbatim
                                        → includes policy violation messages verbatim
                                        → is empty only when there is nothing to say
                                        → never claims safety when no concerns are noted
                                        → names the shopper concern when set
                                        → states allergen prefs are local, not server-filtered
chat_message_cart_explanation_test.dart→ attaches a Why-why-items explanation when a cart is prepared
                                        → attaches an unverified allergy warning when a cart is prepared
                                        → adds no explanation/allergy section when no cart is returned
                                        → dietary + budget preferences are what get handed to the server
shopper_preferences_allergens_test.dart→ toJson stays server-shaped (no allergen key)
                                        → toPersistedJson round-trips allergens
                                        → tolerates a legacy payload with no allergens
                                        → ignores unknown allergen labels
                                        → persists allergen preferences across save/load
                                        → migrates a legacy v1 payload without losing dietary data
```

### Result — full suite (existing + new): **100 tests, All tests passed!**

No regression in the pre-existing tests.

### Other executed results
| Check | Command | Result |
|---|---|---|
| Static analysis | `flutter analyze` | **No issues found!** (Flutter 3.47.1 stable, Dart 3.13.1) |

### Environment information
- Windows 10 (build 10.0.26300.9711), locale de-DE; Flutter 3.47.1 stable, Dart 3.13.1.
- Proxy env vars `HTTP_PROXY`/`HTTPS_PROXY` → `http://127.0.0.1:13290` were the cause of the flutter_tester failure (proxy intercepted the local WebSocket upgrade).
- Sandbox also blocks `reg.EXE`, so `flutter doctor` crashes its Windows/VS/device checks — unrelated to test execution.
- Validation commands that work here (proxy cleared): `flutter analyze` and `flutter test`.

---

## 2. `ShopperPreferences` v1 → v2 migration — verified by execution

| Check | Input | Result |
|---|---|---|
| Legacy v1 payload (no `allergens` key) | `{dietary:[vegan,gluten-free], maxBudgetMinor:2500}` | dietary = *gluten-free,vegan* ✓ · budget = *2500* ✓ · allergens empty ✓ |
| Allergen round-trip | `{vegan} / {peanut,dairy} / 1000` | preserved ✓ |
| Server JSON shape | `toJson()` | keys = `dietary,maxBudgetMinor`, **no** `allergens` ✓ |

Plus a live test in the suite: *"migrates a legacy v1 payload without losing
dietary data"* → **passed** (includes the `ShopperPreferencesService` layer with
`SharedPreferences.setMockInitialValues`).

---

## 3. Data flow: `chat_provider` → `chat_message` → `cart_explanation` → `chat_screen`

- `chat_provider.dart` attaches `cartExplanation`/`allergyWarning` **only** when
  `resp.preparedCart != null`, via the pure helpers.
- `cart_explanation.dart` builds item lines only from `cart.items` (server
  names/quantities) and policy notes only from `cart.reason` and
  `cart.policyViolations[].message` (verbatim). **Empty/missing `reason` or
  `policyViolations` → empty notes, no exception, nothing invented.**
- `chat_screen.dart` renders the section only when non-null and non-empty.
- `buildAllergyWarning` always reports **unverified** and never claims safety.
- Confirmed by passing tests: *"is empty only when there is nothing to say"*,
  *"includes server policy reason verbatim"* and *"adds no explanation or allergy
  section when no cart is returned"*.

---

## 4. Accessibility & widget lifecycle

- `TypingIndicator`: `AnimationController` created in `initState()`, **disposed in
  `dispose()`**; `Semantics(label: 'AI is typing', liveRegion: true)`. Verified
  by a passing widget test that pumps several animation frames without error.
- `BaristaAvatar`: `StatelessWidget` — no controller to dispose;
  `Semantics(image: true, label: 'Coco, AI barista')`. Verified by a passing
  semantics test.
- No third-party dependencies were added in either widget.

---

## 5. Change list

**Pre-existing files modified (Flutter lib only, 5):**
`lib/models/shopper_preferences.dart`, `lib/services/shopper_preferences_service.dart`,
`lib/models/chat_message.dart`, `lib/providers/chat_provider.dart`, `lib/screens/chat_screen.dart`

**New files (11):** 3 lib (`widgets/barista_avatar.dart`, `widgets/typing_indicator.dart`,
`utils/cart_explanation.dart`), 5 tests, and docs (`SPONSOR_INTEGRATION.md`,
`REPORT_PHASE2.md`, `VALIDATION_REPORT.md`).

**Untouched (verified by SHA-256 against baseline):**
- `source/apps/backend/src/` — 79 files, **identical**.
- Backend `*.test.ts` — 82 files, **identical**.
- All pre-existing Flutter tests — unmodified (and still passing in the full run).

---

## 6. Honesty statement

- Every result above was actually executed. Nothing is claimed as passing that
  did not run.
- The earlier "blocked" finding was a real environment limitation (proxy env),
  not a code defect; it was resolved without changing any test, code or dependency.
- No new feature, no cleanup, no forced dependency upgrade, and no Git operation
  was performed in this round.

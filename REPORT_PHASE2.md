# AI Café — Phase 2 Implementation Report

Scope executed: the three approved low-risk features from the Phase 1 plan,
amended per the approval conditions. **No backend source file was touched. No
existing test was modified. No commit/push/deploy/reset/clean/checkout/stash
was run.**

---

## 1. Completed developments & changed files

### Feature 1 — Explainable AI + "Coco" barista avatar
| File | Change |
|---|---|
| `source/apps/flutter_app/lib/widgets/barista_avatar.dart` | **new** — self-contained vector "Coco" avatar (CustomPaint, no assets/3rd-party deps), wrapped in `Semantics` ("Coco, AI barista"). |
| `source/apps/flutter_app/lib/widgets/typing_indicator.dart` | **new** — animated three-dot "AI is typing…" indicator (repeat animation), accessible (`Semantics` live region). |
| `source/apps/flutter_app/lib/screens/chat_screen.dart` | render avatar on assistant bubbles; replace the old single spinner with the typing bubble; add a "Why these items?" section and the allergy notice inside assistant bubbles; add allergen checkboxes to the shopping-profile dialog. |

### Feature 2 — Data-driven diet/allergy structure & preferences
| File | Change |
|---|---|
| `source/apps/flutter_app/lib/models/shopper_preferences.dart` | add a local `allergens` set (peanut, tree-nut, dairy, egg, soy, shellfish, gluten). `toJson()` is kept **server-shaped** (`dietary` + `maxBudgetMinor` only) so allergen keys never reach the backend. New `toPersistedJson()`/`fromPersistedJson()` for local storage. |
| `source/apps/flutter_app/lib/services/shopper_preferences_service.dart` | versioned storage (`v2`), transparent migration of a legacy `v1` payload. |
| `source/apps/flutter_app/lib/utils/cart_explanation.dart` | **new** — pure helpers: `buildCartExplanation` (only real server fields: item names/quantities + `reason`/`policyViolations` verbatim) and `buildAllergyWarning` (always returns an unverified warning, never claims safety). |
| `source/apps/flutter_app/lib/models/chat_message.dart` | add optional `cartExplanation` / `allergyWarning` fields (backward compatible). |
| `source/apps/flutter_app/lib/providers/chat_provider.dart` | attach the explanation + allergy warning to an assistant message whenever the response contains a prepared cart. |

> **Per approval condition 2:** no `allergens` field was added to
> `examples/business-profiles/corner-bakery.json`. The backend `productSchema`
> (zod) does not consume an allergen field, so adding one would be silently
> stripped and never served. This is documented in `lib/models/shopper_preferences.dart`
> and in the allergy-warning helper.

### Feature 3 — Sponsor points: Postman/APIMatic
| File | Change |
|---|---|
| `SPONSOR_INTEGRATION.md` | **new** — describes only the *verified* state of `openapi.json` and `postman/`, plus how to import them as a Postman Collection / APIMatic SDK. It explicitly states no SDK has been generated and no live/sponsor integration exists. |

---

## 2. New tests (added; existing tests untouched)

- `source/apps/flutter_app/test/shopper_preferences_allergens_test.dart`
- `source/apps/flutter_app/test/cart_explanation_test.dart`
- `source/apps/flutter_app/test/chat_message_cart_explanation_test.dart`
- `source/apps/flutter_app/test/barista_avatar_widget_test.dart`
- `source/apps/flutter_app/test/typing_indicator_widget_test.dart`

---

## 3. Real test & validation results

### Flutter
| Check | Command | Result |
|---|---|---|
| Static analysis | `cd source/apps/flutter_app && flutter analyze` | **`No issues found!`** (Flutter 3.47.1 stable, Dart 3.13.1) |
| Unit/widget tests | `cd source/apps/flutter_app && flutter test` | **BLOCKED by environment — not run.** Every test file, including the pre-existing ones, fails to *load* with `Unable to connect to flutter_tester process: WebSocketException: Invalid WebSocket upgrade request`. This is a toolchain/sandbox limitation (flutter_tester cannot start), not a code or analysis failure. Because of this I **do not claim any test passed**. Validation command for a healthy environment: `cd source/apps/flutter_app && flutter pub get && flutter analyze && flutter test`. |

### Backend
- `source/apps/backend/node_modules` is absent in this extraction, so `npm test`
  (jest) cannot run here (`jest: command not found`). I did **not** run any
  destructive install/clean/force-update. No backend test result is claimed.
- Validation command after `npm install`: `cd source/apps/backend && npm test`.

---

## 4. Backend-unchanged verification (hash comparison)

SHA-256 hashes of every file were recorded before the work and recomputed after:

| Scope | Baseline files | After files | Result |
|---|---|---|---|
| `backend/src/` (all 79 source files) | hashed | re-hashed | **identical — no changes** |
| Backend `*.test.ts` (all 82 test files) | hashed | re-hashed | **identical — no changes** |
| `backend/examples/` | unchanged (no edits made) | unchanged | n/a |

---

## 5. Current backend/API limitations (allergy data)

- The catalog schema and API expose **no allergen field**: there is no
  `contains` / `may_contain` / `unknown` data anywhere in the backend. The client
  therefore **always** shows "Allergy information is unverified" when a cart is
  suggested and **never** claims an item is safe or allergen-free.
- The chat endpoint validates `preferences` with a strict schema; sending allergen
  keys there would return HTTP 400. That is why all allergens are kept local-only
  and excluded from `toJson()`.
- Dietary preferences **are** sent to the server and used during cart planning
  (AI and rule-based paths). Allergen preferences are **not** filtered or
  verified server-side — the UI states this explicitly.
- To add real allergen support, the backend plan (not done, out of scope) would
  need a new `allergens` field in `productSchema`, a catalog update, and a
  verified per-product allergen source.

---

## 6. Secrets / generated files to exclude from the ZIP + cleanup recommendations

Exclude/do-not-ship (never present in the code we wrote):
- `.env`, `.env.*`
- `node_modules/`
- `build/`, `.dart_tool/`, `android/.gradle/`, `.idea/`
- `*.keystore`, `*.jks`, signing keys
- any real user data, session tokens, or API keys

Cleanup recommendations on a healthy checkout before packaging:
- `cd source/apps/backend && rm -rf node_modules` (regenerated by `npm install`)
- `cd source/apps/flutter_app && flutter clean`
- remove `source/apps/flutter_app/.flutter-plugins-dependencies` and
  `pubspec.lock` only if you authorise regenerating them (`flutter pub get`)

---

## 7. Git diff summary

This extraction is **not a git repository** (no `.git`), so no `git diff` can
be produced. The full change set is enumerated in section 1; no git commands
(commit/push/reset/clean/checkout/stash) were run, per the constraints.

---

## 8. Jury presentation notes

1. **Explainable AI, visibly:** "Coco" the barista avatar + typing indicator make
   the AI feel present, and every cart reply is followed by a *Why these items?*
   note built only from real product/policy data — no black box.
2. **Radical honesty on allergies:** the app never claims anything is safe; it
   always shows an explicit "Allergy information is unverified" notice and states
   allergen preferences are local-only and not server-filtered. This is trust
   you can demonstrate live, not a promise.
3. **Sponsor-ready API story:** `openapi.json` and the Postman files are verified
   and importable into Postman/APIMatic (documented in `SPONSOR_INTEGRATION.md`)
   — an instant SDK/demo path without claiming anything that isn't real.

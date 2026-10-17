# P2 — Flutter hygiene + Android emulator E2E vs local sandbox backend

- Date: 2026-10-15
- Repository: `C:\Projects\FinCan\paypal-commerce-agent`
- Branch: `fix/render-deployment`
- Secrets policy: `.env` KEY NAMES only; no values/tokens printed. `adb` output filtered; no tokens captured.

## Verdict: **BLOCKED**

Two independent blockers prevent the emulator E2E:

1. **Flutter/Dart toolchain cannot spawn child processes in this environment** (`CreateFile failed 231 — Alle Pipeinstanzen sind ausgelastet`, `process_win.cc:744`). This breaks `flutter analyze`, `flutter test`, `flutter build`, and `flutter run`. Reproduced for `dart analyze` (needs `dartaotruntime.exe`), `flutter analyze`, `flutter test`, and even `flutter --version`. Same blocker documented in `RECOVERY_06_VERIFICATION_AND_ZIP_REPORT.md` §5. **No local app build/install is possible here.**
2. **`.env` PayPal credentials are still placeholders** (same as P1): `PAYPAL_CLIENT_ID`=medium(20–60), `PAYPAL_CLIENT_SECRET`=short(<20), placeholder marker present. PayPal sandbox OAuth returns 401, so no real PayPal order can be created even if the app ran.

Therefore the app-driven scenarios (a)(b)(c) are **NOT RUN**; only the API-level over-limit check (d) could be executed.

## 1. Hygiene (allowed files only)

| Item | Result | Evidence |
|---|---|---|
| Fix the analyzer info at `api_service.dart:114` (`prefer_initializing_formals`) | **DONE** | Changed `required SessionStorage storage` + `_storage = storage;` → `required this._storage` (removed the initializer assignment). Verified empirically that `this._storage` exposes the **public** `storage:` parameter name, so all call sites (`lib/main.dart`, 25 test sites) keep working. |
| `dart format` on the 4 files | **DONE** | `dart format …` → "Formatted 4 files (2 changed)"; exit 0. (2 changed: `api_service.dart`, `checkout_provider.dart`; the 2 test files were already formatted.) |
| `flutter analyze` exit 0 | **NOT RUN (BLOCKED)** | `flutter analyze` aborts with the pipe error before analyzing. Cannot confirm. |
| `flutter test` all green (expect 38) | **NOT RUN (BLOCKED)** | `flutter test` aborts with the pipe error. Cannot confirm. |
| No test weakened/removed | **DONE** | No test file content changed (only formatting; no diffs in the 2 test files). |

Ground-truth lint text (from the project's own analyze logs, `flutter_08.log` / `flutter_11.log`):
`info - ... Try using an initialing formal ('this._storage') to initialize the field - lib\services\api_service.dart:114 - prefer_initializing_formals`.

## 2. Backend (local, sandbox)

| Item | Result | Evidence |
|---|---|---|
| Start backend with local return/cancel URLs | **PASS** | `RENDER_EXTERNAL_URL=http://localhost:3000` (+ explicit local `PAYPAL_RETURN_URL`/`PAYPAL_CANCEL_URL`; `.env` pins them to `10.0.2.2`, so they were overridden at launch). |
| `/api/health` sandbox guard | **PASS** | `{"paypal":{"enabled":true,"environment":"sandbox"},"ai":{"enabled":true}}`, small uptime = fresh instance. |

## 3. Android emulator

| Item | Result | Evidence |
|---|---|---|
| Emulator running | **PASS** | `adb devices` → `emulator-5554  device`; AVD `Pixel_8`; Android **16**, ABI `x86_64`. |
| Run the app in DEBUG with `--dart-define=API_BASE_URL=http://10.0.2.2:3000` | **NOT RUN (BLOCKED)** | `flutter run`/`flutter build` cannot run (toolchain blocker). No pre-built APK exists in the repo (`**/*.apk` → none). The only installed package is `com.paypal.hackathon.flutter_app` (a pre-existing APK that talks to the **Render** host, per `RECOVERY_06` §4) — not the local tree, and launching it would call the live Render service, so it was not used. |
| Release manifest forbids cleartext | **PASS** | `android/app/src/main/AndroidManifest.xml` has **no** `usesCleartextTraffic`. |
| Debug manifest allows cleartext (debug-only) | **PASS** | `android/app/src/debug/AndroidManifest.xml` → `android:usesCleartextTraffic="true"` (debug source set only). |

## 4. Scenarios

| # | Scenario | Result | Notes |
|---|---|---|---|
| a | Add items → pay €13 → approve in PayPal → deep link `paypalcommerceagent://checkout/...` → confirm step → capture PAID | **NOT RUN (BLOCKED)** | Needs a running local app build (blocker 1) + valid PayPal creds (blocker 2). |
| b | Cancel at PayPal → cart preserved, order cancelled | **NOT RUN (BLOCKED)** | Same blockers. |
| c | Kill app after approval, relaunch → pending recovered, no duplicate order | **NOT RUN (BLOCKED)** | Same blockers. |
| d | Over-limit cart blocked | **PASS (API-level)** | `node evidence/p2-emulator/check_negative.mjs` → `OVER_LIMIT status=403 policyDecision=BLOCK error=Purchase blocked by policy`, exit 0. (UI path not exercised — no app build.) |

## 5. Evidence files (`evidence/p2-emulator/`)

- `REPORT.md` (this file)
- `emulator_baseline.png` — emulator screenshot (launcher; no app installed from this tree)
- `check_negative.mjs` — throwaway negative-check script (scenario d), no secrets printed

## 6. Commands & exit codes

| Command | Exit |
|---|---|
| `dart format lib/services/api_service.dart lib/providers/checkout_provider.dart test/checkout_provider_test.dart test/checkout_capture_state_test.dart` | 0 ("4 files, 2 changed") |
| `flutter analyze` | aborted (pipe error) — not a real exit code |
| `flutter test` | aborted (pipe error) — not a real exit code |
| `dart analyze lib/services/api_service.dart` | aborted (pipe error) |
| backend start + `curl /api/health` | 0 (health 200, sandbox) |
| `node evidence/p2-emulator/check_negative.mjs` | 0 (403 BLOCK) |
| `git diff --check` | 0 |

## 7. Final git status

19 modified + 12 untracked; `git diff --check` exit 0. **This task changed only 2 files**: `apps/flutter_app/lib/services/api_service.dart` (+ the analyzer fix) and `apps/flutter_app/lib/providers/checkout_provider.dart` (dart format). All 17 pre-existing modifications and 11 pre-existing untracked entries are preserved. Nothing committed/pushed/stashed/reset/cleaned. No untracked file was deleted.

## 8. Remaining blockers

1. **Flutter toolchain**: run `flutter analyze` (expect exit 0) and `flutter test` (expect 38) on a machine where the Dart VM can spawn processes; then `flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://10.0.2.2:3000`.
2. **`.env` PayPal credentials**: replace with real PayPal **Sandbox** app credentials (developer.paypal.com) — otherwise OAuth 401.
3. Sandbox **buyer** account for the approval tap.
4. `.env` `PAYPAL_RETURN_URL`/`PAYPAL_CANCEL_URL` point to `10.0.2.2` (non-localhost) → set to `http://localhost:3000/api/checkout/{return,cancel}` or unset.

## 9. Explicit NOT RUN

`flutter analyze`; `flutter test` (38); `flutter run`/`flutter build` on the emulator; scenarios (a)(b)(c). No app was built or installed from this tree; no PayPal order/capture; no OpenAI call; no Render call.

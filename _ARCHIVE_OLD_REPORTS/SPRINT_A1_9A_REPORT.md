# Sprint A1.9A — Secure Release API Configuration (P0)

**Mode:** Narrow implementation + local validation. No commit/stage/push/deploy/webhook/live payment.
No backend/A1.5/persistence/policy/payment changes.

## 1. Baseline

| Item | Value |
|---|---|
| Branch | `fix/render-deployment` |
| HEAD (start = end) | `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2` |
| Pre-existing untracked | A1.3, A1.4, A1.5, A1.6, A1.7, A1.8 reports — **all preserved** |
| Pre-existing tracked mods | 6 A1.5 backend files — **untouched by this sprint** |

## 2. Files changed (4) and why

| File | Change | Reason |
|---|---|---|
| `lib/services/api_service.dart` | `defaultBaseUrl` default `http://10.0.2.2:3000`; new static `resolveBaseUrl({isRelease,url})`; `_baseUrl` now `resolveBaseUrl()`; added `kReleaseMode` import | Release requires explicit HTTPS; debug keeps emulator HTTP; no silent fallback |
| `android/app/src/main/AndroidManifest.xml` | Removed `android:usesCleartextTraffic="true"` from `<application>` | Release merged manifest must forbid cleartext |
| `android/app/src/debug/AndroidManifest.xml` | Added `android:usesCleartextTraffic="true"` on a `<application>` node (debug source set only) | Debug/emulator keeps HTTP; release never merges this source set |
| `test/api_service_test.dart` | New group with 5 focused tests (+ `product.dart` import) | Cover HTTPS select, missing URL, HTTP rejection, debug workflow, DI preservation |

`ApiService({... storage ...})` public constructor, DI, session-auth headers, and all backend behavior are unchanged. No dependency added.

## 3. API URL selection behavior

- **Debug/profile:** returns the emulator URL `http://10.0.2.2:3000` (explicit, documented). Cleartext permitted via debug-only manifest.
- **Release:** requires `API_BASE_URL` as an **https://** URL. Missing → `StateError('API_BASE_URL must be supplied…')`; non-https (e.g. `http://`) → `StateError('API_BASE_URL must be an https:// URL…')`. Never falls back to `10.0.2.2`. No hardcoded production host.
- `resolveBaseUrl({isRelease,url})` exposes injectable params **only so tests exercise the release branch** without a compile-time `--dart-define`; production defaults are `kReleaseMode` and `defaultBaseUrl`.

## 4. Build commands (no secrets)

```bash
# Debug (emulator) — HTTP allowed via debug-only manifest:
flutter run                       # or: flutter build apk --debug

# Release — explicit HTTPS backend required:
flutter build apk --release --dart-define=API_BASE_URL=https://<your-backend>
```

## 5. Evidence — merged/actual APK manifests (aapt2 xmltree)

| Build | `usesCleartextTraffic` | Result |
|---|---|---|
| **Debug APK** (`app-debug.apk`) | `=true` (0x010104ec) | present — emulator HTTP allowed |
| **Release APK** (`app-release.apk`, built with `--dart-define=API_BASE_URL=https://backend.example.com`) | **absent** | cleartext disabled (Android default) — debug-only override did NOT leak into release |

## 6. Validation — commands, exit codes, results

| Command | Exit | Result |
|---|---|---|
| `flutter analyze` | **1** | only the pre-existing `prefer_initializing_formals` info (`api_service.dart`), no new issues |
| `flutter test test/api_service_test.dart` | **0** | **16/16** (11 existing + 5 new) |
| `flutter test` (full) | **0** | **32/32** (27 baseline + 5 new) |
| `flutter build apk --debug` | **0** | built (177 MB); debug manifest `usesCleartextTraffic=true` |
| `flutter build apk --release --dart-define=API_BASE_URL=https://…` | **0** | built (50.1 MB); release manifest cleartext absent |
| `git diff --check` | **0** | clean |

## 7. Blocked by environment

- **Release signing config** is the debug key (existing `build.gradle` TODO). A store-signed release was not produced; the manifest transport fix is proven on the unsigned-but-release-`buildType` APK.
- No live backend URL is established in the repo, so `backend.example.com` was used only as a build-time placeholder; no real production URL hardcoded.

## 8. Remaining risks

- **P1:** Ship step must always pass `--dart-define=API_BASE_URL=https://…`; a release built without it will throw at startup (fail-closed, by design) rather than hit the emulator. Document this in CI.
- **P2:** Release keystore still TODO.
- **Unrelated:** backend persistence / policy-UI items remain (out of scope here).

## 9. Final `git status --short`

```
 M apps/backend/src/routes/health.ts            (A1.5 — preserved)
 M apps/backend/src/routes/webhooks.ts          (A1.5 — preserved)
 M apps/backend/tests/integration/health.test.ts(A1.5 — preserved)
 M apps/backend/tests/integration/reservation-consistency.test.ts (A1.5 — preserved)
 M apps/backend/tests/integration/reservation-lifecycle.test.ts   (A1.5 — preserved)
 M apps/backend/tests/integration/webhooks.test.ts(A1.5 — preserved)
 M apps/flutter_app/android/app/src/debug/AndroidManifest.xml   (A1.9A)
 M apps/flutter_app/android/app/src/main/AndroidManifest.xml     (A1.9A)
 M apps/flutter_app/lib/services/api_service.dart                (A1.9A)
 M apps/flutter_app/test/api_service_test.dart                   (A1.9A)
?? SPRINT_A1_3_REPORT.md … SPRINT_A1_8_REPORT.md  (preserved)
```

HEAD unchanged. Nothing staged or committed.

**Stop here per instructions. Policy-UI and persistence work not started.**

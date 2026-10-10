# Sprint A1.1 — Verify & Close All Flutter Analyzer Errors

**Date:** 2026-10-10
**Branch:** `fix/render-deployment`
**Scope:** Verify the on-disk Sprint A1 session-auth changes and close every remaining
analyzer error / regression. Source of truth = current filesystem + actual command output.

---

## 0. Guardrails honored
- No `git commit` / `push` / `merge` / `deploy`, no webhook registration, no PayPal API call.
- No backend files modified. The frontend/backend session contract was verified to be
  **already consistent** (see §5), so no contract mismatch to fix.
- Only working-tree change made in this task: `dart format` re-applied to
  `lib/services/api_service.dart` (whitespace only) + this report file.

---

## 1. Initial `git status --short` (captured before any change)

```
 M apps/backend/src/ai/service.ts
 M apps/backend/src/ai/tool-executor.ts
 M apps/backend/src/app.ts
 M apps/backend/src/config/environment.ts
 M apps/backend/src/middleware/idempotency.ts
 M apps/backend/src/policy/storage.ts
 M apps/backend/src/routes/ai.ts
 M apps/backend/src/routes/orders.ts
 M apps/backend/src/routes/policy-events.ts
 M apps/backend/tests/integration/ai.test.ts
 M apps/backend/tests/integration/e2e-demo-flow.test.ts
 M apps/backend/tests/integration/orders.test.ts
 M apps/backend/tests/integration/policy-enforcement.test.ts
 M apps/backend/tests/integration/policy-events-api.test.ts
 M apps/backend/tests/integration/reservation-consistency.test.ts
 M apps/backend/tests/integration/reservation-lifecycle.test.ts
 M apps/backend/tests/verification/p0-claims.test.ts
 M apps/flutter_app/lib/main.dart
 M apps/flutter_app/lib/providers/chat_provider.dart
 M apps/flutter_app/lib/providers/checkout_provider.dart
 M apps/flutter_app/lib/services/api_service.dart
 M apps/flutter_app/pubspec.lock
 M apps/flutter_app/pubspec.yaml
 M apps/flutter_app/test/api_service_test.dart
 M apps/flutter_app/test/checkout_provider_test.dart
?? E2E_VERIFICATION_REPORT.md
?? SPRINT_A1_REPAIR.md
?? apps/backend/src/middleware/rate-limit.ts
?? apps/backend/src/middleware/session-auth.ts
?? apps/backend/src/routes/sessions.ts
?? apps/backend/src/session/
?? apps/backend/tests/helpers/
?? apps/backend/tests/unit/session-store.test.ts
?? apps/flutter_app/lib/services/secure_session_storage.dart
?? apps/flutter_app/lib/services/session_service.dart
?? apps/flutter_app/test/session_service_test.dart
?? e2e-evidence/
```

## Final `git status --short`
**Identical file set.** The only content delta introduced during A1.1 is the
`dart format` whitespace normalization of `lib/services/api_service.dart` (already an `M`
file); no new files became tracked/modified except the addition of this report.

---

## 2. Files inspected (all 11 listed)
- `lib/services/api_service.dart` — re-read in full from disk.
- `lib/services/session_service.dart` — re-read.
- `lib/services/secure_session_storage.dart` — read.
- `lib/providers/chat_provider.dart` — read.
- `lib/providers/checkout_provider.dart` — read.
- `lib/main.dart` — read.
- `test/api_service_test.dart` — re-read (signature).
- `test/checkout_provider_test.dart` — re-read (signature).
- `test/session_service_test.dart` — read.
- `pubspec.yaml` — read; `pubspec.lock` — grepped (`flutter_secure_storage` resolves to 9.2.4).
- Backend contract files read for verification: `apps/backend/src/routes/sessions.ts`,
  `apps/backend/src/middleware/session-auth.ts`, `apps/backend/src/session/session-store.ts`,
  `apps/backend/src/routes/orders.ts`.

---

## 3. The 13 reported issues — actual disposition

| # | Location | Issue | Disposition | Evidence (on-disk) |
|---|----------|-------|-------------|--------------------|
| 1 | `api_service.dart:50:3` | `final_not_initialized_constructor` (`_storage`) | **Verified FIXED** | Constructor takes `required SessionStorage storage` and assigns `_storage = storage` in the initializer list (lines 51–57). |
| 2 | `api_service.dart:50:53` | `initializing_formal_for_non_existent_field` (`storage`) | **Verified FIXED** | Same fix — parameter is `storage`, field `_storage` is initialized in the list. Public `storage:` named arg preserved for callers. |
| 3 | `api_service.dart:166:11` | `use_null_aware_elements` (info) | **Verified FIXED** | `sendChat` body uses `'sessionId': sessionId,` (no `if` guard) — line 171. |
| 4 | `api_service.dart:201:19` | `non_type_as_type_argument` (`OrderItem`) | **Not present in current tree** | `order.dart` imported (line 5); `List<OrderItem>` at line 206 resolves. Was only in the earlier reverted copy. |
| 5 | `api_service.dart:213:11` | `use_null_aware_elements` (info) | **Verified FIXED** | `createOrder` body uses `'sessionId': sessionId,` (no `if` guard) — line 218. |
| 6 | `api_service.dart:214:39` | `unchecked_use_of_nullable_value` (`toJson`) | **Not present in current tree** | `items.map((e) => e.toJson())` — `e` is non-nullable `OrderItem` (lines 206/219). Was only in the earlier reverted copy. |
| 7 | `api_service.dart:290:9` | `undefined_class` (`PreparedCart`) | **Verified FIXED** | `import 'package:flutter_app/models/cart.dart';` added (line 8); `preparedCart` typed `PreparedCart?` (line 295). |
| 8 | `api_service.dart:309:11` | `undefined_name` (`PreparedCart`) | **Verified FIXED** | `PreparedCart.fromJson(...)` at line 314 resolves via the cart.dart import. |
| 9 | `session_service.dart:5:1` | `dangling_library_doc_comments` (info) | **Verified FIXED** | `library session_service;` added after the doc comment (line 7). |
| 10 | `api_service_test.dart:37:31` | `argument_type_not_assignable` | **Verified FIXED** | `withSession` param is `Future<http.Response> Function(http.Request)` (line 13); test closures are `async`. |
| 11 | `api_service_test.dart:182:13` | `argument_type_not_assignable` | **Verified FIXED** | Same `withSession` signature fix. |
| 12 | `checkout_provider_test.dart:38:31` | `argument_type_not_assignable` | **Verified FIXED** | Same `withSession` signature fix (line 13). |
| 13 | `checkout_provider_test.dart:112:31` | `argument_type_not_assignable` | **Verified FIXED** | Same `withSession` signature fix. |

**Summary:** 11 issues verified fixed in source; 2 (#4, #6) were never present in the
current tree (leftovers of the earlier reverted copy). All 13 are accounted for.

---

## 4. Toolchain — exact commands, exit codes, evidence

| Command | Exit | Result / Output |
|---------|------|----------------|
| `git --version` | 0 | `git version 2.55.0.windows.3` (git works) |
| `git status --short` | 0 | see §1 |
| `git diff --stat` | 0 | 25 files changed, +1123 / −358 |
| `dart --version` | 0 | `Dart SDK version: 3.13.1 (stable)` |
| `flutter --version` | crash | `CreateFile failed 231 (Alle Pipeinstanzen sind ausgelastet)` — **ERROR_PIPE_BUSY 231** |
| `dart pub get` | 0 | `Got dependencies!` (flutter_secure_storage 9.2.4 resolved) |
| `dart format --output=none --set-exit-if-changed lib test` | **0** | `Formatted 18 files (0 changed)` → **format check PASSES (stable)** |
| `dart analyze` (sandbox) | 1 | `CreateFile failed 231` while spawning the analysis server |
| `dart analyze` (disable sandbox) | 1 | identical `CreateFile failed 231` |
| `dart analyze` (post orphan-kill retry) | 1 | identical `CreateFile failed 231` |
| `flutter analyze` (sandbox) | 1 (crash) | `CreateFile failed 231` |
| `flutter analyze` (disable sandbox) | 1 (crash) | identical `CreateFile failed 231` |
| `flutter test` (disable sandbox) | 1 (crash) | identical `CreateFile failed 231` |

> `dart format` exit 0 proves every file parses and is canonically formatted.
> `dart pub get` exit 0 proves dependencies resolve. The **analyzer and test runner did
> NOT execute** in this environment, so their pass/fail is **unknown here** — they must be
> run on the user's local machine (see §7). No success is claimed for them.

---

## 5. Correctness requirements — verified against actual code + backend contract

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Reads correct `sessionToken` response field | ✅ | `api_service.dart:88` `data['sessionToken']`; backend `session-store.ts:99` returns `sessionToken`. |
| Missing/malformed session response fails explicitly | ✅ | `api_service.dart:89–94` throws `SessionException`. |
| Secure storage injectable; tests need no platform channel | ✅ | Abstract `SessionStorage`; `InMemorySessionStorage` in tests; `SecureSessionStorage` (flutter_secure_storage) in `main.dart:22`. `secure_session_storage.dart` is isolated. |
| Public health/catalog requests need no session storage | ✅ | `getHealth`/`getCatalog` (`api_service.dart:138–155`) call `_client` directly. |
| Authenticated requests attach matching id + bearer token | ✅ | `api_service.dart:104/107` set `X-Session-Id` + `Authorization: Bearer`. Backend `session-auth.ts:31/22` expects exactly these (header casing case-insensitive). |
| 401 triggers at most one refresh-and-retry | ✅ | `api_service.dart:126–131` — single retry, no loop. |
| Retry preserves body + idempotency key | ✅ | Closure captures `items`/`idempotencyKey`; re-invoked with fresh headers (`api_service.dart:117–132`, `210–221`). |
| No client-generated session id as identity | ✅ | Server id is the sole source of truth; client never mints an id. |
| Checkout does not auto-capture payment | ✅ | `completeCheckout` requires `_paypalApproved` + explicit call; `cancelCheckout` never captures. |
| Cancellation does not empty cart / falsely mark paid | ✅ | `cancelCheckout` (`checkout_provider.dart:357–383`) only nulls `_created`/`_paypalApproved`; cart, `_manualCart`, `_quantityOverrides` untouched. |
| Provider behavior/state transitions preserved | ✅ | chat send/clear, cart merge, checkout flow intact. |

**Contract mismatch check:** none found. Frontend `POST /api/sessions` expects `sessionId` +
`sessionToken`; backend returns both (`sessions.ts:11–15`, `session-store.ts:99`). Frontend
cancel/capture/create hit `POST /api/orders/:orderId/cancel`, `.../capture`, `.../create`
(`orders.ts:399/264/37`) — all present and `requireSession`-guarded. No backend change made.

---

## 6. Remaining blocker (evidenced — no false success)

`flutter analyze`, `flutter test`, and even `dart analyze` **cannot execute** in this
agent sandbox. Every invocation fails at child-process spawn with:

```
CreateFile failed 231 (Alle Pipeinstanzen sind ausgelastet.)
ProcessException: Alle Pipeinstanzen sind ausgelastet (at ../../runtime/bin/process_win.cc:744)
```

This is Windows **ERROR_PIPE_BUSY 231** — a named-pipe resource exhaustion affecting all
subprocess-spawning analyzer/test commands. Evidence it is environmental, not a code or
sandbox-policy issue:
- Reproduced **in-sandbox**, **with `dangerouslyDisableSandbox: true`**, and **after
  killing orphaned analyzer processes** — identical failure each time.
- `git`, `dart pub get`, and `dart format` **succeed** (they do not spawn the blocked
  subprocess type). `dart --version` succeeds.

Per the task's acceptance rule, Sprint A1.1 is closed on the **documented-evidence
blocker** path: the analyzer/tests did not run here, and this is reported honestly rather
than declared successful. On the user's machine — where `flutter analyze` previously ran
and produced the 13 issues — the source-level fixes above are expected to yield a clean run.

---

## 7. Commands to run locally for authoritative verification

```powershell
cd apps/flutter_app
flutter pub get                                           # expect: Got dependencies!
dart format --output=none --set-exit-if-changed lib test  # expect: 0 changed
flutter analyze                                           # expect: No issues found!
flutter test                                              # expect: all tests pass
```

If any issue reappears locally, paste the output and it will be triaged against the
dispositions in §3.

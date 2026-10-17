# Sprint A1 — Flutter Session-Auth Integration Repair

Repaired the Flutter thin client to integrate with the drafted backend
session-auth contract. All changes are applied **in-place** in the working tree
and are currently visible in `git status` / `git diff`.

> **Environment note:** This sandbox blocks every command that spawns a child
> process (`flutter analyze`, `flutter test`, `dart analyze`, `dart test`,
> `dart compile`, even `flutter --version`/git) with Windows
> `ERROR_PIPE_BUSY 231` ("Alle Pipeinstanzen sind ausgelastet"). Only
> in-process commands ran: `dart pub get` (exit 0) and `dart format`
> (exit 0 — all files parse). **`flutter analyze` and `flutter test` could not
> be executed here; run them locally to confirm.** The sandbox has also been
> observed to revert edits to already-tracked files between turns — if
> `git diff apps/flutter_app` is empty, re-apply the changes below.

## Files changed (tracked, modified)

- `apps/flutter_app/lib/services/api_service.dart` — now takes a required
  `SessionStorage`; `sendChat`/`createOrder`/`captureOrder`/`cancelOrder`/
  `deleteChat`/`deletePreparedCart` go through `_executeWithAuth`, which
  mints a session via `POST /api/sessions`, validates `sessionId` +
  `sessionToken`, attaches `X-Session-Id` + `Authorization: Bearer <token>`,
  and retries exactly once on 401 (no infinite loop). Public
  `getCatalog`/`getHealth` are storage-free. Cancel uses
  `POST /api/orders/:orderId/cancel`.
- `apps/flutter_app/lib/providers/chat_provider.dart` — removed client-generated
  session id; `sendMessage` calls `api.sendChat(message:, preferences:)`;
  `clearConversation`/`clearPreparedCart` call the new no-arg `deleteChat()` /
  `deletePreparedCart()`.
- `apps/flutter_app/lib/providers/checkout_provider.dart` —
  `startCheckout` calls `api.createOrder(items:)` (no session id); added
  `cancelCheckout([orderId])` using `api.cancelOrder` (payment-safe, preserves
  cart).
- `apps/flutter_app/lib/main.dart` — wires
  `ApiService(storage: SecureSessionStorage())`.
- `apps/flutter_app/test/api_service_test.dart`, `test/checkout_provider_test.dart`
  — rewritten for the new signatures; use an injectable `InMemorySessionStorage`
  and a `withSession` mock; cover headers/identity match, public-endpoint
  no-session, 401-once retry, session-creation failure, and malformed-response
  rejection.

## Files added (new, untracked)

- `apps/flutter_app/lib/services/session_service.dart` — `SessionException`,
  `Session` model, abstract `SessionStorage`, `InMemorySessionStorage` (test fake).
- `apps/flutter_app/lib/services/secure_session_storage.dart` — production
  `SessionStorage` over `flutter_secure_storage`.
- `apps/flutter_app/test/session_service_test.dart` — storage fake tests.
- `apps/flutter_app/pubspec.yaml` — added `flutter_secure_storage: ^9.0.0`.

## Acceptance checks

- Token field mapping `token` → `sessionToken`: ✅ (api_service `_ensureSession`).
- Session response validation: ✅ (throws `SessionException` on missing/empty
  `sessionId`/`sessionToken`).
- No client-generated session id: ✅ (server id is source of truth).
- Testable persistence (injectable storage + in-memory fake): ✅.
- Public endpoints independent of secure storage: ✅.
- Session refresh only on auth failure, single retry, idempotency preserved: ✅.
- Cancel verified against real backend route (`/api/orders/:orderId/cancel`): ✅.
- Payment safety preserved (no auto-capture; cart preserved on cancel): ✅.
- API base URL mechanism untouched (`API_BASE_URL` / `10.0.2.2:3000`): ✅.

## `flutter analyze` — 13 issues fixed in source (user's local run)

All 13 issues reported by the user's local `flutter analyze` are now resolved
in the working tree. `dart format` (exit 0) confirms every file parses.

| # | Location | Issue | Root cause | Fix applied |
| --- | --- | --- | --- | --- |
| 1 | `api_service.dart:50:3` | `final_not_initialized_constructor` (`_storage`) | Constructor used `required this.storage`, but the field is `_storage` → `_storage` never initialized | Constructor now takes `required SessionStorage storage` and assigns `_storage = storage` in the initializer list (keeps the public `storage:` named param used by callers) |
| 2 | `api_service.dart:50:53` | `initializing_formal_for_non_existent_field` (`storage`) | Same as #1 — `storage` is not a field | Same as #1 |
| 3 | `api_service.dart:166:11` | `use_null_aware_elements` (info) | `if (sessionId != null) 'sessionId': sessionId,` | Removed the `if` guard → `'sessionId': sessionId,` (`_ensureSession` guarantees a non-null id) |
| 4 | `api_service.dart:201:19` | `non_type_as_type_argument` (`OrderItem`) | **Already absent** — `order.dart` is imported and `OrderItem` is in scope | No change required (artifact of the earlier reverted copy) |
| 5 | `api_service.dart:213:11` | `use_null_aware_elements` (info) | Same guard as #3 | Same fix as #3 |
| 6 | `api_service.dart:214:39` | `unchecked_use_of_nullable_value` (`toJson`) | **Already absent** — `items` element is non-nullable `OrderItem` | No change required (artifact of the earlier reverted copy) |
| 7 | `api_service.dart:290:9` | `undefined_class` (`PreparedCart`) | `api_service.dart` did not import `cart.dart` | Added `import 'package:flutter_app/models/cart.dart';` |
| 8 | `api_service.dart:309:11` | `undefined_name` (`PreparedCart`) | Same as #7 | Same as #7 |
| 9 | `session_service.dart:5:1` | `dangling_library_doc_comments` (info) | Doc comment with no `library` directive | Added `library session_service;` after the doc comment |
| 10 | `api_service_test.dart:37:31` | `argument_type_not_assignable` | `withSession` helper declared `handler` as sync `http.Response Function(http.Request)`, but tests pass `async` closures (`Future<Response> Function(Request)`); `MockClient` accepts the async signature | Changed `withSession` param to `Future<http.Response> Function(http.Request) handler` |
| 11 | `api_service_test.dart:182:13` | `argument_type_not_assignable` | Same as #10 | Same as #10 |
| 12 | `checkout_provider_test.dart:38:31` | `argument_type_not_assignable` | Same as #10 | Same as #10 |
| 13 | `checkout_provider_test.dart:112:31` | `argument_type_not_assignable` | Same as #10 | Same as #10 |

Issues #4 and #6 were not present in the current on-disk file (they belonged to
the earlier reverted copy); they are listed for completeness. All remaining 11
were genuine and are fixed.

## Toolchain (as run in this environment)

| Command | Result |
| --- | --- |
| `dart pub get` | exit 0 ✅ |
| `dart format lib test` | exit 0 ✅ (all files parse) |
| `flutter analyze` / `dart analyze` | **NOT RUN** — sandbox blocks child-process spawn (analysis server) |
| `flutter test` / `dart test` | **NOT RUN** — sandbox blocks child-process spawn (native-asset build hooks / gen_kernel) |

**No commit, push, merge, deploy, webhook registration, or PayPal call was performed.**

# Flutter ↔ Backend API Contract Compliance — Report

**Scope:** the Flutter client's parsing of and reaction to `POST /api/ai/chat`
(`source/apps/flutter_app/lib/**`). The backend payment security boundary, MCP
code and PayPal code were **not** touched. No new dependency was added.

**Contract source of truth** (read, not assumed):
`apps/backend/src/routes/ai.ts`, `src/ai/service.ts`, `src/ai/tool-executor.ts`,
`src/ai/fallback-planner.ts`, `tests/integration/ai.test.ts`,
`tests/integration/ai-fallback.test.ts`.

**Status key**

- ✅ **Verified** — confirmed by an automated test that was actually run.
- ⚠️ **Implemented, not end-to-end verified** — code path covered by unit/widget
  test with a mocked transport, but not exercised against a live backend/device.
- ⛔ **Not performed** — could not be done in this environment (stated explicitly).

---

## 1. The real contract (as found in backend source)

`POST /api/ai/chat` always answers with the same envelope, on **both** the normal
and the fallback path (`src/routes/ai.ts:119-142`):

```jsonc
{
  "sessionId":   "string",
  "response":    "string",
  "preparedCart": { /* object */ } | null,
  "checkoutReady": true | false,
  "toolRounds":  0,
  "messageCount": 0,
  "mode":        "ai" | "rule-based"
}
```

Key facts that the client previously got wrong or ignored:

| Fact | Where it is defined |
|---|---|
| `mode` is **always** present in the envelope — `'ai'` for a model answer, `'rule-based'` for the deterministic Quick Planner | `routes/ai.ts:140` (`mode: 'ai'`), `routes/ai.ts:121` (`mode: fallback.mode`), `fallback-planner.ts:165` |
| `mode: 'rule-based'` means the reply is **explicitly not AI** — the backend states this in the response text itself and never marks the session AI-prepared | `fallback-planner.ts:14-17,176` |
| A rule-based run may return `preparedCart: null` (BLOCK decision, or no plan) **or** a full cart with `checkoutReady: true` | `fallback-planner.ts:205-231` |
| `checkoutReady` is the server's own flag, **not** derivable from `preparedCart != null` | `routes/ai.ts:121,140` |
| `preparedCart` carries policy metadata the client does not need for rendering: `cartId`, `policyDecision`, `policyViolations`, `requiresExplicitApproval`, `retrySuggested`, `reason` | `fallback-planner.ts:209-221`, `tool-executor.ts` |
| Errors are non-2xx JSON (`AppError`), e.g. `400` invalid preferences, `401` session, `429` AI quota | `routes/ai.ts:90-92`, `app.ts` error handler |

`sendChat` applies a 15 s request timeout (`api_service.dart:50,172/218/225`), so
`TimeoutException` is a reachable runtime state, not a theoretical one.

---

## 2. Defects found and fixed

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | `mode` was never parsed — `ChatResponse` had no field for it | The UI presented a **rule-based fallback as an AI answer**. Truthfulness/trust bug, and the one the task singled out. | Added `ChatMode` enum + `chatModeFromJson()`; `ChatResponse.mode`; `ChatMessage.mode`; UI badges (§3). |
| 2 | `checkoutReady` was inferred as `_lastPreparedCart != null` | The client invented a checkout-ready state the server had not granted (e.g. a BLOCKED cart would still look payable). | `_checkoutReady` now stores `resp.checkoutReady` and the getter is `_checkoutReady && _lastPreparedCart != null`. |
| 3 | `ChatResponse.fromJson` used `json['sessionId'] as String` | A 2xx body missing `sessionId` threw a `TypeError` that escaped as an untyped crash. | `as String? ?? ''`; every numeric field `(num?)?.toInt() ?? 0`; `preparedCart` only parsed when it is a `Map<String, dynamic>`. |
| 4 | `jsonDecode(res.body) as Map<String, dynamic>` in `sendChat` | Empty body, HTML error page, or a JSON array → `FormatException`/`TypeError` instead of a recoverable error. | New `_decodeChatBody()` returns `{}` on empty / non-JSON / non-object; `ChatResponse` then falls back to safe defaults. |
| 5 | `CartLine.fromJson` / `PreparedCart.fromJson` used hard casts (`as String`, `as int`) and `e as Map<String, dynamic>` per item | One malformed line item crashed the entire chat screen. | Nullable casts + `whereType<Map<String, dynamic>>()` + `rawItems is List` guard. |
| 6 | `Product.fromJson` used hard casts and `List<String>.from(...)` | A partial catalog entry crashed the whole menu; a non-string tag threw. | Nullable casts + `_stringList()` (`whereType<String>()`); `getCatalog` now also skips entries with an empty id. |
| 7 | `TimeoutException` fell into the generic `catch` | User saw a raw exception string instead of an actionable message. | Explicit `on TimeoutException` branch → “The AI request timed out. Check your connection and try again.” |
| 8 | An empty `response` produced a blank assistant bubble | Indistinguishable from a broken UI. | Substituted “The assistant returned an empty response. Please try again.” |
| 9 | The prepared-cart card was hard-coded “AI-prepared cart” | A rule-based cart was labelled as AI. | Card title is mode-aware; the bubble gets a “Rule-based answer · no AI” chip. |

**Explicitly checked and found *not* to be a defect:** a follow-up reply with
`preparedCart: null` does **not** lose the user's cart.
`ChatProvider` already only replaced the cart when a new one arrived, and
`CheckoutProvider._resolvedQuantities()` merges `chat.lastPreparedCart.items`.
No change was made there.

---

## 3. UI state after the fix

| Backend situation | What the user now sees |
|---|---|
| `mode: "ai"`, reply only | Normal bubble, no chip. |
| `mode: "ai"`, with cart | Bubble + “AI-prepared cart · your edits”. |
| `mode: "rule-based"`, reply only | Bubble + “Rule-based answer · no AI” chip. |
| `mode: "rule-based"`, with cart | Bubble + chip, and cart titled “Rule-based cart (no AI) · your edits”. |
| `mode` missing / unknown (older backend) | No chip, card keeps the “AI-prepared” title — i.e. previous behaviour, no false “rule-based” claim. |
| `checkoutReady: false` with a cart | Cart is shown for review; checkout is not offered. |
| Empty `response` | Explicit “empty response” fallback text. |
| `TimeoutException` | “timed out” message + `error` set, `loading` cleared. |
| `ApiException(503, …)` | “Chat error (503): …” — status preserved. |

---

## 4. Files changed

| File | Change |
|---|---|
| `lib/models/chat_message.dart` | New `ChatMode { ai, ruleBased }`, tolerant `chatModeFromJson()`, `ChatMessage.mode`, `ChatMessage.isRuleBased`. |
| `lib/services/api_service.dart` | `ChatResponse.mode` + `isRuleBased`; tolerant `ChatResponse.fromJson`; new `_decodeChatBody()`; `getCatalog` skips non-map / id-less entries. |
| `lib/models/cart.dart` | Tolerant `CartLine.fromJson` and `PreparedCart.fromJson` (nullable casts, `whereType`, `rawItems is List`). |
| `lib/models/product.dart` | Tolerant `Product.fromJson` + `_stringList()` helper. |
| `lib/providers/chat_provider.dart` | Stores `_lastPreparedCartMode` / `_checkoutReady`; passes `mode` to the message; empty-response fallback; `on TimeoutException`; resets new state in `clearConversation` and `clearPreparedCart`. |
| `lib/screens/chat_screen.dart` | `_MessageBubble` rule-based chip; `_PreparedCartCard.mode` + mode-aware title; call site passes `chat.lastPreparedCartMode`. |
| `test/api_service_test.dart` | New group `AI chat response compatibility (mode + safe parsing)` — 7 tests. |
| `test/chat_provider_test.dart` | **New file** — 7 tests for provider state transitions. |

Not touched: `lib/services/session_service.dart`, `lib/services/secure_session_storage.dart`,
`lib/providers/checkout_provider.dart`, any `apps/backend/src/**` route, any MCP
or PayPal module.

---

## 5. Commands run and results

All run from the paths shown. Output quoted verbatim.

**1. Static analysis**

```
cd source/apps/flutter_app && flutter analyze
→ Analyzing flutter_app...
  No issues found! (ran in 12.2s)
```

**2. Flutter test suite**

The environment's HTTP proxy (`HTTP_PROXY=http://127.0.0.1:23044`) intercepts the
local `flutter_tester` WebSocket and makes every test file fail to load with
`WebSocketException: Invalid WebSocket upgrade request`. Proxies must be unset for
the local loopback connection:

```
cd source/apps/flutter_app && \
  env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
      NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
  flutter test
→ 00:04 +52: All tests passed!
```

**52 tests passed** (baseline before this task: 38; +14 new).

**3. Relevant backend contract tests**

```
cd source/apps/backend && npx jest \
  tests/integration/ai.test.ts \
  tests/integration/ai-fallback.test.ts \
  tests/integration/policy-enforcement.test.ts \
  --runInBand --silent
→ PASS tests/integration/ai-fallback.test.ts (8.747 s)
  PASS tests/integration/ai.test.ts
  PASS tests/integration/policy-enforcement.test.ts

  Test Suites: 3 passed, 3 total
  Tests:       41 passed, 41 total
```

These confirm the backend really emits `mode: 'ai'` / `mode: 'rule-based'` and the
`checkoutReady` values the client now relies on. No backend source was modified.

**4. New tests added (14)**

`test/api_service_test.dart` → `AI chat response compatibility (mode + safe parsing)`

1. parses a normal AI reply (mode “ai”) with a prepared cart
2. parses a rule-based fallback (mode “rule-based”)
3. treats a missing or unknown mode as unknown
4. tolerates missing cart fields and malformed item entries
5. treats a non-object `preparedCart` as no cart
6. tolerates an empty or non-JSON body
7. surfaces a rate-limit HTTP error as `ApiException`

`test/chat_provider_test.dart` (new)

1. exposes rule-based mode for the reply and the prepared cart
2. honors the server `checkoutReady` flag for a prepared cart
3. keeps a valid prepared cart across a follow-up reply with no cart
4. shows a clear fallback for an empty response
5. maps a timeout to a friendly error instead of a raw exception
6. surfaces HTTP errors with their status
7. clearing the conversation resets checkout readiness and cart mode

Note on the mock transport: `http.Response` encodes as Latin-1 by default, so
every mock that contains `€` sets `content-type: application/json; charset=utf-8`.
Without it the test itself fails with `Invalid argument (string): Contains invalid
characters` — a test-harness detail, not a product bug.

---

## 6. What was **not** verified ⛔

Stated explicitly, per the instruction not to present unreachable services as tested.

| Not verified | Why | What *was* covered instead |
|---|---|---|
| **No live backend over the network.** The Flutter client never called a running Express server. | No backend process was started and no emulator/device network path was used. | `ApiService` was driven through `MockClient` with payloads copied from the backend's own integration-test fixtures. |
| **No live AI provider** (OpenAI / Groq / etc.). The `mode: 'ai'` path was never produced by a real model. | Requires provider credentials and outbound calls. | `tests/integration/ai.test.ts` exercises the `mode: 'ai'` envelope with the backend's mocked AI client. |
| **No device / emulator run.** The rule-based chip and the cart card title were never rendered on screen. | `flutter run` was not performed. | Model-level parsing and provider state are unit-tested; widget rendering is not. A golden/widget test for the chip was not added because the task asked for the minimum necessary tests. |
| **No manual accessibility or visual review** of the new chip (contrast of `tertiaryContainer` on the bubble background). | No device, no screen reader. | The chip uses Material 3 semantic container/on-container roles, which are theme-derived, but this was not measured. |
| **No end-to-end PayPal / MCP checkout flow.** | Out of scope and explicitly excluded. | Untouched; existing 52-test suite still green. |
| **Full backend suite not re-run** in this task. | Only the 3 contract-relevant suites were requested/relevant. | Those 3 suites: 41/41 pass. |

---

## 7. Remaining issues / known limitations (not fixed, by design)

1. **Policy metadata is still ignored by the Flutter model.** `preparedCart`
   contains `cartId`, `policyDecision`, `policyViolations`,
   `requiresExplicitApproval`, `retrySuggested`, `reason`
   (`fallback-planner.ts:209-221`). `PreparedCart` does not model them, so the
   client cannot show *why* a cart needs approval or was blocked. Adding the
   fields without a design for displaying them would have been a speculative
   change, so it was left alone — but it is the most valuable next step.
2. **`totalFormatted` falls back to an empty string** when the backend omits it.
   The card would then show no total rather than a computed one. Deliberate:
   the client must not invent a currency total.
3. **`Product.priceFormatted` hard-codes `€`** (`product.dart:49`) rather than
   using `currency`. Pre-existing, unrelated to this contract, left unchanged.
4. **Empty-body 2xx is treated as an empty response, not an error.** This is
   recoverable for the user (fallback text + retry) but means a genuinely broken
   backend looks like a chatty one. Acceptable given the backend always sends a
   body on 2xx.
5. **The proxy workaround is environmental, not code.** Any CI job running
   `flutter test` on this machine must unset `HTTP_PROXY`/`HTTPS_PROXY` or it will
   see 0 tests run and a WebSocket error.

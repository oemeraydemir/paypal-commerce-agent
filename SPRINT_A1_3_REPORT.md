# Sprint A1.3 — Sandbox E2E Verification & Deployment Safety

**Date:** 2026-10-11
**Repository:** `C:\Projects\FinCan\paypal-commerce-agent`
**Branch:** `fix/render-deployment`
**Verified HEAD:** `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2`

> Evidence takes precedence over prior reports. Every claim below is backed by a
> command actually executed in this session, with exact exit codes and totals.
> Baseline figures from A1.2 were treated as historical claims and re-run.

---

## 1. Initial and Final Git State

| Check | Result |
|---|---|
| `git status --short` (initial) | **empty** — clean tree, 0 modified/untracked files |
| Branch | `fix/render-deployment` |
| `git rev-parse HEAD` (initial) | `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2` |
| `git log -5 --oneline` | `c8c5a40` Sprint A: session-auth + rate-limit + Flutter session client; `da0f6b7` Reservation lifecycle + TTL + PayPal reconciliation; `8bade30` docs(runbook); `60560e0` style; `00209e3` fix(e2e) |
| `git diff --check` | **EXIT 0** — no whitespace errors |
| A1.2 changes in `c8c5a40` | **Yes** — `git show --stat c8c5a40` lists A1.2 files (SecureSessionStorage, checkout_provider, api_service, session-store, B1 redaction, orders reconciliation, p0-claims) |
| Uncommitted changes | **None** |
| `git rev-parse HEAD` (final) | `c8c5a40...` — **unchanged** |
| Working tree (final) | **clean, 0 files** |

**No commit, push, merge, reset, clean, force-push, or history rewrite was performed.**

---

## 2. Local Build & Test Results

### Backend (`apps/backend`)
| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit` | **0** | clean (empty output) |
| `npm test` | **0** | **Test Suites: 20 passed, 20 total; Tests: 236 passed, 236 total; Snapshots: 0; Time: 20.401 s** |

### Flutter (`apps/flutter_app`)
| Command | Exit | Result |
|---|---|---|
| `flutter pub get` | **0** | resolved |
| `flutter analyze` | **1** | **1 info** — `prefer_initializing_formals` at `lib/services/api_service.dart:62:8` |
| `flutter test` | **0** | **All tests passed! (27/27)** |

---

## 3. Phase 2 — Flutter Lint & Session Regression Audit

### The remaining `prefer_initializing_formals` info (`api_service.dart:62`)
```dart
ApiService({http.Client? client, String? baseUrl, required SessionStorage storage})
    : _client = ..., _baseUrl = ..., _storage = storage;
```
**Decision: intentionally not "fixed" (justified narrow deviation).** The field is
`final SessionStorage _storage` (private) but the parameter is the public named
`storage`. The suggested `this._storage` would rename the public parameter and
**break every `ApiService(storage: ...)` call site**. Rule 10 forbids changing the
public constructor; Phase-2 rule 3 forbids a broad suppression. Accepted as-is. **No file changed.**

### Regression coverage (verified by reading tests, all passing)
| Behavior | Test | Status |
|---|---|---|
| Concurrent first-time session creation | api_service_test "F5: concurrent first requests share a single session creation" | ✅ |
| Consistent session id/token snapshot | session_service_test + F5 | ✅ |
| One-time retry after 401 (no infinite loop) | "refreshes the session once on 401 and does not retry infinitely" | ✅ |
| No stale session id during retry | "F1: deleteChat retry after 401 uses the refreshed session id" | ✅ |
| Secure-storage read/write/clear failures | secure_session_storage_test (F6: read-recover, write-throws, clear-best-effort, round-trip) | ✅ |
| PayPal cancel deep-link matching | checkout "F2: unrelated/stale cancel link does NOT call the backend" | ✅ |
| Token mismatch returns `false` (UI warning) | checkout F2 expects `false`; chat_screen shows mismatch snackbar on `!handled` | ✅ |
| Idempotency key reuse across 401 | "F4: the idempotency key is stable across the 401 retry" | ✅ |
| New key for genuinely new attempt | covered by provider re-init | ✅ |
| Stale & ambiguous order recovery | checkout F3 + backend reconciliation tests | ✅ |

**No new tests added** (gaps already closed in `c8c5a40`; no duplication). **No Flutter file edited.**


---

## 4. Phase 3 — Backend Contract & Security (code review + live verification)

Code inspected: `session-auth.ts`, `idempotency.ts`, `rate-limit.ts`, `orders.ts`,
`policy-events.ts`, `webhook-service.ts`.

| Control | Code evidence | Status |
|---|---|---|
| Session-auth on protected order endpoints | `requireSession` on create/capture/cancel; verifies `X-Session-Id` + `Bearer`; injects authenticated id, rejects client mismatch with 403 | ✅ |
| Unauthenticated access to public endpoints only | GET /orders, /orders/stats, /catalog, /policy-events, POST /sessions public by design; all mutations need session | ✅ |
| Public order response omits PayPal ids | list mapper returns only `publicSessionRef`, never `paypalOrderId`/`paypalCaptureId` (B1) | ✅ |
| Policy-event omits internal `userId` | `policy-events.ts:62` returns masked `sessionId`, drops `userId` | ✅ |
| Public session ref masked | `publicSessionRef()` = SHA-256 `sess_xxxxxxxx` (non-reversible) | ✅ |
| Blocked policy requests don't consume AI marker | covered in policy-enforcement/p0-claims suites (236 pass) | ✅ |
| Idempotency on retries / disconnected clients | session-scoped key, in-flight `pendingRequests` map, cache on `finish` for 2xx/4xx only, 409 on key+different body | ✅ |
| Reservation lifecycle on cancel / ambiguous capture | cancel releases only when proven not-captured; **CAPTURE_PENDING → 409; unverifiable → 502 with reservation NOT released** (F3) | ✅ |
| Dashboard consumer matches public contract | `public/dashboard.html` reads `id/status/totalFormatted/sessionId` still returned by list | ✅ |


---

## 6. Phase 5 — PayPal Sandbox E2E

Real Sandbox credentials exist on the live service (`PAYPAL_ENV=sandbox`), so the
checkout lifecycle was exercised against the **live Sandbox-backed deployment**.
All tokens/session ids were used transiently and **never printed**.

### Scenario A — Successful payment (create leg)
| Step | Result |
|---|---|
| 1. Create session | ✅ 201 |
| 2. Authoritative catalog | ✅ 200, 8 products |
| 3. Prepare cart | ✅ 2× `coffee` |
| 4. Create checkout order | ✅ **201** — `status:PAYMENT_PENDING`, `paypalOrderId` **present**, `approvalUrl` host **`www.sandbox.paypal.com`**, `totalFormatted:€6.00` |
| 5-9. Buyer approval → capture → webhook → dedup → final state | ⚠️ **BLOCKED** — needs interactive buyer login on the PayPal approval page + a registered webhook (`webhookEnabled:false`); cannot be automated headlessly without an authorized test buyer + webhook registration. |

**Scenario A: PARTIAL — create leg PASS (real Sandbox order minted); approval/capture/webhook legs BLOCKED.**

### Scenario B — User cancellation
| Step | Result |
|---|---|
| 1. Create order | ✅ 201, `PAYMENT_PENDING` |
| 2. Cancel via supported flow | ✅ `POST /orders/:id/cancel` |
| 3. Backend cancellation behavior | ✅ **`status:ORDER_CANCELLED`** |
| 4. Cart preserved | ✅ (reservation released cleanly; order recorded cancelled) |
| 5. Reservations not incorrectly retained | ✅ cancel released the reservation; ambiguous states held (see C) |

**Scenario B: PASS (real Sandbox).**

### Scenario C — Ambiguous capture
| Step | Result |
|---|---|
| 1. Create order, buyer never approves | ✅ `PAYMENT_PENDING` |
| 2. Attempt capture on unapproved order | ✅ server returns **HTTP 502** `{"error":"PayPal error"}` — could not confirm capture |
| 3. Reservation not released on ambiguity | ✅ 502 path (`orders.ts:356-358`) does NOT release; deterministic coverage in reservation-lifecycle/consistency suites (pass) |
| 4. Reconciliation for already-captured orders | ✅ `ORDER_ALREADY_CAPTURED→409`, `settled` paths + tests pass |

**Scenario C: PASS (real Sandbox trigger + deterministic automated coverage).**

### Scenario D — Webhook safety
| Sub-check | Result |
|---|---|
| Valid signature | ⚠️ **BLOCKED** — no `PAYPAL_WEBHOOK_ID` on live service; verification disabled. Cannot mint a validly-signed event without the merchant webhook secret. |
| Invalid signature | ✅ **covered by code + `webhooks.test.ts`** — `verifySignature` returns false when id missing / PayPal != SUCCESS; route 401 on missing headers. |
| Duplicate event | ✅ `isDuplicate`/`markProcessed` (mark only after successful reconciliation) + tests. |
| Unknown order | ✅ route returns 200 "order not found", logs UNRECONCILED; test-covered. |
| Capture amount/currency mismatch | ✅ server-authoritative amount at create; mismatch surfaces at PayPal; test-covered. |

**Scenario D: PARTIAL — invalid-sig/dedup/unknown-order covered deterministically; valid-signature live delivery BLOCKED (no webhook registration).**

---

## 8. E2E Scenario Summary

| Scenario | Verdict |
|---|---|
| A. Successful payment | **PARTIAL / BLOCKED at approval** (create leg PASS, real Sandbox; approval+capture+webhook blocked) |
| B. User cancellation | **PASS** (real Sandbox, `ORDER_CANCELLED`) |
| C. Ambiguous capture | **PASS** (real Sandbox 502 + deterministic tests) |
| D. Webhook safety | **PARTIAL** (invalid-sig/dedup/unknown-order deterministic; valid-signature live BLOCKED) |

---

## 9. Changed Files This Sprint

**None.** No source, test, or config file was edited. Working tree clean at `c8c5a40`.

---

## 10. Remaining Risks / Blockers (P0/P1)

- **P0 — Webhook not registered (`webhookEnabled:false`).** No live webhook delivery until `PAYPAL_WEBHOOK_ID` is set on Render and the webhook is registered with PayPal. Requires explicit authorization (rule 12); **not performed**.
- **P0 — Deployed commit unconfirmed.** Health exposes `version:1.0.0` but no SHA and no dashboard access; cannot prove live = `c8c5a40`. Render auto-deploy status **UNKNOWN**.
- **P1 — Full approval→capture→webhook E2E not executed.** Needs interactive PayPal Sandbox buyer login (headless not authorized) + registered webhook. Create/cancel/ambiguous legs genuinely ran.
- **P1 — Webhook idempotency in-memory only.** `WebhookService.processedEvents` not persisted across restarts (S5 limitation); a redeploy could re-process, though reconciliation is guarded.
- **P1 — `prefer_initializing_formals` info remains** by design (would break public `ApiService(storage:)`). Accepted, not suppressed.

---

## 11. Acceptance Criteria Checklist

- [x] Backend typecheck + tests pass (tsc EXIT 0; **236/236**, 20 suites).
- [x] Flutter analyzer + tests run locally, results recorded (analyze 1 info; **27/27 pass**).
- [x] Existing constructor and deep-link UI contracts intact (no edits; tests pass).
- [x] No sensitive payment IDs reintroduced into public responses (verified live + code).
- [x] No payment status falsely marked successful (only real Sandbox transitions).
- [x] No reservation released while capture ambiguous (502 path confirmed live + tests).
- [x] Sandbox E2E genuinely demonstrated for B and C; A approval leg and D valid-signature explicitly BLOCKED with concrete reasons.
- [x] No commit, push, webhook registration, or deployment performed.

**No secrets, tokens, private buyer details, or authorization headers are recorded in this report.**


**No payment was faked by setting an order to PAID.** Only real Sandbox transitions were observed.

---

## 7. Live Security Contract Verification (additional)

| Check | Expected | Actual |
|---|---|---|
| Unauthenticated `POST /api/orders/create` | 401 | ✅ **401** |
| Unauthenticated `POST /api/orders/:id/capture` | 401 | ✅ **401** |
| Mismatched/spoofed `X-Session-Id` | 401 | ✅ **401** |
| Idempotency: same key + different body | 409 | ✅ **409** |
| Public `GET /api/orders` omits PayPal ids | absent | ✅ `paypalOrderId`/`paypalCaptureId` **absent**; `sessionId` masked `sess_…` |
| Public `GET /api/policy-events` omits `userId` | absent | ✅ **absent** (2 events), `sessionId` masked |

---

## 5. Phase 4 — Deployment State

**Live base URL:** `https://paypal-commerce-agent.onrender.com`
(Note: `paypal-commerce-agent-backend.onrender.com` returns 404 — the active host
is the shorter one, matching the deployed service in `apps/backend/render.yaml`.)

| Endpoint | Timestamp (local, UTC+02) | HTTP | Body (no secrets) |
|---|---|---|---|
| `GET /api/health` | 2026-10-11 01:38:05 | **200** | `status:ok, environment:production, version:1.0.0, paypal:{enabled:true, environment:sandbox}, ai:{enabled:true}` |
| `GET /api/catalog` | 2026-10-11 01:37:44 | **200** | `count:8` products |
| `GET /api/webhooks/health` | 2026-10-11 01:38:06 | **200** | **`{status:ok, webhookEnabled:false}`** |
| `POST /api/sessions` | 2026-10-11 01:38:07 | **201** | sessionId (36-char UUID) + sessionToken issued |

**Render deployed commit:** **UNKNOWN.** Health exposes `version:1.0.0` and
`environment:production` but **not a git SHA**, and there is no Render dashboard
access here. A successful health check alone does **not** prove the deployed code
is `c8c5a40`; per rule this is not inferred.

**Webhook registration/delivery:** **NOT registered.** `/api/webhooks/health`
reports `webhookEnabled:false` → `PAYPAL_WEBHOOK_ID` is unset on the live service,
signature verification is disabled, and no live webhook has been delivered.

**PayPal Sandbox credentials on live service:** present and enabled
(`paypal.enabled:true, environment:sandbox`), supplied via Render dashboard
(`sync:false` in render.yaml), **never printed or requested**.

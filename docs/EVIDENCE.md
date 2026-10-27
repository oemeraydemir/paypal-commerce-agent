# Evidence matrix (2026-10-20, fourth pass: local verification, counts re-measured)

> **Backend counts re-measured on 2026-10-25 (audit pass, commands run in that session):** `tsc --noEmit` clean;
> `jest --runInBand` **79 suites / 883 tests pass on 2026-10-26** after the payment-settlement changes (unit 34 / 406, integration 44 / 454, verification 1 / 23; 78 / 858 on 2026-10-25);
> `newman` against a local keyless server, public and private dashboard mode: **58 requests, 73 assertions, 0 failed**.
> NOT re-run in that session: Flutter (no SDK there; the owner's 2026-10-26 re-run, 118 tests, is row E14b and
> `docs/PLATFORM_STATUS.md`), the real-Chrome AG Grid test, `test:smoke` against a real PostgreSQL. The older rows below keep
> their original dates. The
> PayPal Sandbox and real-AI-provider rows remain **BLOCKED** — this environment has no credentials. The
> Flutter result needs `HTTP_PROXY` unset (otherwise the local test host is reached through the proxy).

PASS = executed with evidence. FAIL = executed and failed. BLOCKED = could not run here (no credentials, service
access or SDK). NOT TESTED = not attempted. Nothing here is a statement about the deployed Render service,
PayPal Sandbox or real AI providers unless a row says so.

## Test kinds

| Kind | What it proves | Result in this pass |
|---|---|---|
| Unit / integration, PayPal and AI **mocked**, pg-mem | application logic | 79 suites, 883 tests, all pass (`jest --runInBand`, measured 2026-10-26; the 20 Oct snapshot was 60 / 636) |
| **Real PostgreSQL 16** (local), PayPal mocked | durability, constraints, concurrency | 13 tests pass (`jest -c jest.smoke.config.js`: `pg-migrate`, `pg-durability`, `pg-capture-claim-route`) |
| Local application over HTTP (`newman`), no PayPal or AI keys | API contract and rejections | public dashboard mode and private mode (`DASHBOARD_PUBLIC=false`) each: 58 requests, 73 assertions, 0 failed (measured 2026-10-25; the 20 Oct snapshot was 50 requests / 57 assertions) |
| Real PayPal Sandbox | PayPal behaviour | BLOCKED |
| Real AI providers | provider behaviour | BLOCKED |
| Deployed Render service | deployment | BLOCKED |

## Rows

| ID | Requirement | Status | Evidence | Remaining |
|---|---|---|---|---|
| E1 | Backend type check | PASS | `tsc --noEmit` exit 0 | none |
| E2 | Capture concurrency in one process (two simultaneous, replay, lost response, webhook during capture, illegal transitions) | PASS (mocked PayPal) | `capture-concurrency.test.ts`, 9 tests | PayPal's own second-capture answer |
| E3 | Capture across instances | PASS (real PostgreSQL, mocked PayPal) | `capture_claims`; `pg-durability` + `pg-capture-claim-route`; route returns 409 while another claim is live, 503 when the claim query fails, claim removed after success | two real processes on Render DB |
| E4 | Webhook idempotency across restart; ten concurrent duplicates give one row | PASS (real PostgreSQL) | `pg-durability` | Render DB |
| E5 | One open refund per order under concurrent inserts | PASS (real PostgreSQL) | `pg-durability` | none |
| E6 | Transaction rollback; DB outage fails closed and recovers; migrations repeatable | PASS (real PostgreSQL) | `pg-durability` | none |
| E7 | Boot refuses without durable storage; session survives a real restart | PASS (real process + PostgreSQL) | exit 1 without or with unreachable `DATABASE_URL`; session valid after killing and restarting the process | repeat on Render |
| E8 | Refund states (COMPLETED, PENDING, FAILED, CANCELLED), partial + multiple refunds, excess refused, pending shown separately, retry asks PayPal first | PASS (mocked, simulated fixtures) | `refunds.test.ts` (13), `refunded-total.test.ts`, `dashboard-net-revenue.test.ts` | real response shapes (see LIVE_VERIFICATION) |
| E9 | Refunds are never driven by webhooks, so API result and webhook cannot double-count | PASS (code review) | `src/routes/webhooks.ts` has no refund handler; only `approve` calls PayPal's refund API | none |
| E10 | Dashboard data access: public minimised mode, private mode, wrong/missing key, shopper session, throttling | PASS (mocked) | `dashboard-access.test.ts`, 18 tests | choose mode for the live demo |
| E11 | Rate limits (preview, create, capture); CORS omits ACAO for foreign origins | PASS | `checkout-rate-limit.test.ts`, `cors.test.ts` | none |
| E12 | AI turn limits (12 tool calls, 40 s), provider/model/fallback fields, rule-based labelling | PASS (mocked providers) | `ai-turn-limits-observability.test.ts`, `ai-model-config.test.ts` | real providers |
| E13 | Flutter payment states: PAID only on a server `PAID` or a verified 409 | PASS (code review only) | `checkout_provider.dart` lines around 469-510; existing Dart tests not run | compile and run |
| E14 | Flutter analyze / test (incl. new `chat_provider_note_test.dart`) | PASS (run by the project owner, not by Claude) | 2026-10-21, Flutter 3.47.1 / Dart 3.13.1, `flutter analyze`: No issues found; `flutter test`: 79 tests, all passed (pasted console output). Unit/widget tests only: no emulator, no real backend | emulator end-to-end (LIVE_VERIFICATION 18-19) |
| E14b | Flutter analyze / test / web build / debug APK (re-run) | PASS (run on the owner's machine in an AI coding session; raw `flutter test` log supplied by the owner, not reproduced by Claude) | 2026-10-26: `flutter test` **118 passed**, `flutter analyze` No issues found, `flutter build web --debug` and `flutter build apk --debug` succeeded | the 79 in E14 is the earlier count |
| E15 | Postman collection | PASS (local, no PayPal/AI), both dashboard modes | `newman`: 50 / 57 / 0 failed in each mode. Fixed a script SyntaxError (quote inside a test name) that made one test script not run. Private mode: `--env-var dashboardPrivate=true --env-var dashboardKey=<ops key>`; dashboard-data requests send `X-Ops-Key: {{dashboardKey}}` (empty in public mode) | Sandbox-only steps |
| E16 | Dependency advisories | FAIL (documented, mitigated) | `npm audit --omit=dev`: 8 (1 high, `langsmith` 0.3.87 via `@langchain/core` 0.3.80 via `@paypal/agent-toolkit`; GHSA-v34v-rq6j-cj6p, GHSA-fw9q-39r9-c252), no fix without a breaking major upgrade. The project never imports `langsmith`; `src/config/disable-tracing.ts` now deletes LangSmith/LangChain tracing and endpoint variables at boot (`disable-tracing.test.ts`). Not proven unreachable: library internals were not audited | update toolkit later |
| E17 | PayPal smoke (`paypal-smoke.test.ts`) | FAIL / BLOCKED | no Sandbox credentials, request error | run with credentials |
| E18 | Approved Sandbox capture, repeated capture, partial and full refund, real refund response, webhook delivery | BLOCKED | needs credentials and a public URL | LIVE_VERIFICATION |
| E19 | Real AI provider answers | BLOCKED | no keys | LIVE_VERIFICATION |
| E20 | Render commit, durable storage, smoke test | BLOCKED | no access | LIVE_VERIFICATION |

Release decision: **READY WITH EXPLICIT BLOCKERS** (E14, E17-E20 open). Not production-ready; PayPal Sandbox prototype.

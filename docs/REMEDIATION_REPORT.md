# AiCafe — Release Blocker Remediation and Independent Re-Audit

**Date:** 2026-10-18
**Branch / commit at start:** `main` / `29309b7`
**Scope:** backend (`source/apps/backend`), Flutter app, docs, deployment config
**Verdict:** **READY WITH CAVEATS** — see [Recommendation](#recommendation)

> **Safety statement.** No commit, push, deploy, or production operation was performed. No real
> money moved. No PayPal sandbox call was made by this work. Every test result below comes from a
> command actually executed in this environment; nothing is inferred.

---

## 1. Phase 1 — Baseline and safety

The working tree was **not** clean when remediation started. It already contained the owner's own
round-3 work, which was preserved untouched:

- 14 modified files and 5 untracked files, snapshotted to `.workbuddy-ai/audit-baseline/` before any edit.
- The snapshot makes it possible to prove, per file, which changes are mine and which pre-date me.

Every change in this report is layered on top of that baseline. Nothing was reverted, stashed, or
discarded. Files that the baseline already had modified but that I did not touch (verified by diffing
against the snapshot, 0 changed lines each):

```
src/paypal/client.ts            src/persistence/init.ts
src/persistence/pg-repositories.ts   src/persistence/types.ts
src/policy/storage.ts           src/routes/refunds.ts
src/routes/webhooks.ts          tests/integration/refunds.test.ts
tests/verification/p0-claims.test.ts
```

Migration `002_refunds_and_policy_events` is **pre-existing baseline work**, not mine. My only
migration addition is `003_open_refund_uniqueness`.

---

## 2. Phase 2 — Verified findings and fixes

Each finding below was treated as a hypothesis and confirmed against the code before anything changed.

### 2.1 Build failure and the false "real PostgreSQL" claim

**Confirmed root cause.** `tests/smoke/pg-migrate-002-smoke.ts` imported a package that is not in
`package.json` and used an absolute Windows path:

```ts
import { PostgresMemoryServer } from 'postgres-memory-server';   // undeclared dependency
import { ... } from 'file:///C:/Projects/AiCafe/source/apps/backend/src/persistence/migrations.ts';
```

`npm run build` → **exit 2**, two `TS2307 Cannot find module` errors. `postgres-memory-server` is
absent from both `dependencies` and `devDependencies`.

The file was also misleading: it named itself a PostgreSQL migration smoke test but ran an
**in-memory emulator**, so a green result would have proven nothing about real PostgreSQL.

**Fix.**
- Deleted the file (baseline copy kept in `.workbuddy-ai/audit-baseline/`).
- Added `tests/smoke/pg-migrate.test.ts`, driven by `DATABASE_URL`. Without it the suite is
  `describe.skip` and prints `[smoke] BLOCKED: …`. It never contacts an emulator.
- It asserts the things a real server must prove: all migrations apply once, re-apply idempotently,
  required tables and indexes exist (including `refund_requests_open_uq`), rows are recorded in
  `schema_migrations`, and two concurrent startups under the advisory lock each apply exactly once.
- Removed every "real PostgreSQL" claim that referred to the emulator. `docs/DATABASE.md` now states
  plainly that the default suite uses pg-mem and that the real-DB smoke suite was **not executed** here.

Real TS errors were not hidden: no `skipLibCheck` relaxation, no `// @ts-ignore`, no exclusion of
`tests/` from the build.

### 2.2 Smoke-test discovery was broken

**Confirmed.** The root `jest.config.js` `testMatch` excludes `tests/smoke/`, so `npm run test:smoke`
reported `No tests found` and **exit 1** — a configuration failure masquerading as a test failure.

**Fix.** Added `jest.smoke.config.js` (`testMatch: ['**/tests/smoke/**/*.test.ts']`, `testTimeout: 60000`)
and pointed the script at it. It deliberately sets **no `setupFiles`**, so the dummy credentials in
`tests/setup.ts` cannot make an unconfigured environment look configured.

`tests/smoke/paypal-smoke.test.ts` was rewritten to skip unless genuinely usable sandbox credentials
are present (`PAYPAL_ENABLED`, a non-`test-` `PAYPAL_CLIENT_ID`, and a secret). It prints
`[smoke] BLOCKED: …` rather than passing silently.

**Result:** 2 suites / 3 tests are now discovered and reported as **skipped → BLOCKED**, never PASS.

### 2.3 Webhook body cap

**Confirmed.** `rawBodyMiddleware` buffered an unbounded stream into a string before any limit applied
— a trivial memory-exhaustion vector on a public endpoint.

**Fix** (`src/middleware/raw-body.ts`):
- `MAX_WEBHOOK_BODY_BYTES = 1 MiB` (real PayPal events are a few KB).
- Fast reject on an oversized declared `Content-Length` → `413`.
- Streaming byte counter while draining, so a lying or absent `Content-Length` is still capped → `413`.
- Malformed JSON now returns `400 Invalid JSON body` instead of falling through to a `500`.
- `req.on('error')` is forwarded, so an aborted upload cannot hang the request.

**Tests** (`tests/integration/webhook-body-limit.test.ts`, 3): a below-limit body passes the guard and
fails only at signature verification (`401`), an over-limit body returns `413`, malformed JSON returns `400`.

### 2.4 Order enumeration and product intent

**Confirmed.** `GET /api/orders` and `GET /api/orders/stats` are unauthenticated by design so the hosted
dashboard works without a login.

**Assessment.** This is an intentional public-demo contract, not an oversight. Rather than bolt on
authentication that would break the demo, the contract was made explicit and tested:
- `src/routes/orders.ts` documents both endpoints as the public demo contract; `/orders/stats` is aggregate-only.
- `tests/integration/public-order-contract.test.ts` (4 tests) proves the response never contains real
  session ids (only an opaque `sess_<8 hex>` label), PayPal order or capture ids, or idempotency keys;
  that two sessions see distinct labels; that stats are aggregate-only; and that sending auth headers
  does not unlock extra fields.
- `docs/KNOWN_LIMITATIONS.md` states the exposure precisely: item names, quantities, totals, timestamps
  and aggregate revenue are public, and both endpoints must go behind merchant auth before real
  customer data is loaded.

**Residual risk accepted, and documented** — not silently left.

### 2.5 Refund retry-path concurrency (the most serious real bug found)

**Confirmed.** On the reopened-retry path (a refund that already carried a `paypalRefundId`),
`approve()` awaited `reconcileRefundStatus()` **before** setting `PROCESSING`. Two concurrent approvals
of the same record could therefore both pass the state check and both reach the PayPal refund call.

**Fix** (`src/refunds/service.ts`). The in-flight state is now claimed **synchronously, before the first
`await`**, including on the retry path. A second concurrent approval observes `PROCESSING` and is
rejected. If the pre-flight reconciliation or the write-ahead save fails, the record is restored to
`PROPOSED` and the original `RefundError` is rethrown (so a `503` stays a `503`). If the process dies
during the claim, the durable row is still `PROPOSED` and a restart re-opens it safely.

**Test** (`tests/integration/refund-persistence.test.ts`). Deterministic, not timing-based: a gated
`mockGetRefund` holds the first approval open, two `approve()` calls are started, and the test asserts
exactly one fulfils, the other rejects with `409`, and **`mockRefund` is called exactly once**, with the
record ending `REFUNDED`. This replaces a sleep-based race that would have been flaky.

### 2.6 Partial unique index for open refunds

**Assessed as compatible and added.** Migration `003_open_refund_uniqueness`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_open_uq
  ON refund_requests (order_id)
  WHERE status IN ('PROPOSED', 'PROCESSING')
```

Closed rows (`REFUNDED`, `REJECTED`) are excluded, so a later refund for a remaining amount is still
allowed. The partial-index semantics were probed directly in pg-mem before committing to the design: a
duplicate open row is rejected, while a `REFUNDED` row plus a new `PROPOSED` row for the same order is
accepted. This closes the multi-instance hole that the in-memory check cannot cover.

**Tests** (`tests/integration/persistence.test.ts`): the migration-idempotency expectation now includes
`003_open_refund_uniqueness`, plus a new test that a second open row is rejected at the database level.

### 2.7 Durable webhook deduplication — assessed, deliberately **not** implemented

**Confirmed.** The processed-event set is an in-memory `Set`, capped at 1000 ids and trimmed to the
newest 500. A webhook redelivered after a restart, or to a second instance, is re-applied.

**Decision: documented, not implemented.** Re-application is safe because every handler is idempotent —
`PAID → PAID` is a no-op, a `DENIED` event only affects an order still `PAYMENT_PENDING`, and refunds are
never driven by webhooks. Durable dedupe would add a table plus a write on every webhook for no
money-safety gain. `docs/KNOWN_LIMITATIONS.md` now states the exact semantics, the exact cap, and the
condition under which a `webhook_events` table would become worthwhile (multi-instance deployment or an
exactly-once logging requirement).

### 2.8 Capture request ids, order-state transitions, central error logging

- **Capture request id.** `capture-${orderId}-${Date.now()}` (one call site). A fresh id per attempt is
  correct here: after a definitive decline such as `INSTRUMENT_DECLINED` a retry must be a *new* request.
  Double capture is prevented by PayPal returning `ORDER_ALREADY_CAPTURED`, which the route settles from
  PayPal's real state. Refunds, which must be idempotent, use the stable `aicafe-refund-${id}`. Reviewed,
  no change needed — now documented.
- **Order-state transitions — bug found and fixed.** `setPayPalOrderId()` unconditionally set
  `status = PAYMENT_PENDING`. A late or duplicate create response could therefore **downgrade an already
  `PAID` / `ORDER_CONFIRMED` order**. It now only backfills `paypalOrderId` when it is unset and returns
  without touching status. Regression test in `tests/unit/orders.test.ts`.
- **Central error logging — bug found and fixed.** `errorHandler` logged the raw `err.message`. It now
  runs it through `redactSecrets()`. Test `tests/unit/error-handler-redaction.test.ts` asserts a
  `client_secret=` value is redacted in the emitted log.

### 2.9 Production high-severity advisory

**Measured, not assumed.** `npm audit --omit=dev` → 8 advisories: 1 high, 3 moderate, 4 low, 0 critical.
Every entry reports `fixAvailable: false`.

The high advisory is `langsmith@0.3.87` (SSRF via tracing-header injection), reached transitively:
`@paypal/agent-toolkit@1.11.0` → `@langchain/core@0.3.80` → `langsmith`.

**Reachability: not reachable.** `LANGCHAIN_TRACING_V2` and `LANGSMITH_TRACING` appear nowhere in `src/`
or `scripts/`, and no LangSmith client is configured. Tracing is opt-in; it is off.

Also verified as unreachable: `uuid` (the app calls `uuidv4()` with no `buf`, which the advisory requires),
and the `ai` / `@ai-sdk/*` low advisories (the app uses the OpenAI SDK directly, not AI SDK file uploads).

**No fix applied.** The only fix path is a `langsmith` / `@langchain/core` major upgrade incompatible with
`@paypal/agent-toolkit@1.11.0`, and `@langchain/core` is pinned to `0.3.80` specifically to keep an earlier
fix. A breaking upgrade for an unreachable advisory would put the Ops Copilot at risk for no benefit.
Documented with evidence in `docs/DEPENDENCY_ADVISORIES.md`.

### 2.10 Stale docs, broken instructions, missing scripts, artifacts

| Finding | Status |
|---|---|
| `SUBMISSION.md` claimed 393 tests | → 500 tests / 41 suites, with the smoke suites called out as BLOCKED |
| Runbooks claimed 143/143 | → 500/500 in the command tables, plus a dated note that preserves the 141/143 → 143/143 section as historical record |
| `cd apps/backend` (wrong since the `source/` move) | Fixed in `README.md`, both runbooks, `ENVIRONMENT.md`, `flutter_app/README.md`, `docs/devpost-testing-instructions.md` |
| `verify.sh` referenced but did not exist | Created at repo root; runs tsc, `npm test`, build, smoke, and `flutter analyze` |
| `npm run test:browser` referenced but not defined | Added to `package.json` |
| Generated `test-results.json`, `npm-audit-full.json` untracked | Added to `.gitignore` |
| CORS inconsistency between `render.yaml` and `.env.render.example` | Resolved **in favour of the evidence** (see below) |

**On CORS.** My first instinct was to change `render.yaml` to the `-backend` host, on the theory that it
matched the declared service name. That was wrong, and the archive caught it:
`docs/archive/evidence/p3-deploy/REPORT_step4_5.md` records the **live host as
`paypal-commerce-agent.onrender.com`** (without `-backend`), and `p5-ai/REPORT.md` records that the value
was changed to that host deliberately. I reverted my change to the production value and instead aligned
the outlier — `.env.render.example` — to the evidence, adding a comment pointing at the source. Every
other live-URL reference in the repo already used the non-`-backend` host, so this was the single
inconsistent file, not a decision to reverse.

`test-results.json` (38 suites / 482 tests) and `npm-audit-full.json` are stale artifacts of earlier manual
runs and are not produced by any configured command. They were left on disk rather than deleted, and are
now git-ignored so they cannot ship.

---

## 3. Phase 3 — Validation matrix (post-change)

| # | Command | Exit | Result | Counts | Reason |
|---|---|---|---|---|---|
| 1 | `npm run build` | 0 | **PASS** | — | `tsc` clean, `public/` copied to `dist/public` |
| 2 | `npm test` | 0 | **PASS** | 41 suites / 500 tests, 500 passed, 0 failed | Was 38 / 489 before this work; +3 suites, +11 tests |
| 3 | `npm run test:smoke` | 0 | **BLOCKED** | 2 suites / 3 tests, all skipped | No `DATABASE_URL`; no real PayPal sandbox credentials |
| 4 | `npm run test:browser` | 0 | **BLOCKED** | 1 suite / 5 tests, all skipped | `playwright-core` / Chrome not installed; prints an explicit `SKIPPED (not a pass)` warning |
| 5 | `bash verify.sh` | 0 | **PASS** | all sections | Type-check, 500/500, build, smoke BLOCKED, Flutter analyze clean |
| 6 | `flutter analyze --no-pub` | 0 | **PASS** | — | `No issues found!` |
| 7 | `flutter test --no-pub` | 1 | **BLOCKED** | **0 tests executed** | All 8 test files fail to load: `WebSocketException: Invalid WebSocket upgrade request` — `flutter_tester` cannot be reached in this sandbox. Reproducible on a single file, so it is environmental, not a code defect. |
| 8 | `npm audit --omit=dev` | 1 | **PASS (as expected)** | 1 high, 3 moderate, 4 low, 0 critical | Non-zero exit is `npm audit`'s normal behaviour when advisories exist; all `fixAvailable: false`, high one unreachable (see 2.9) |
| 9 | Real-PostgreSQL migration smoke | — | **BLOCKED** | 0 | No `DATABASE_URL`, no local `psql`, nothing listening on 5432 |
| 10 | PayPal sandbox end-to-end | — | **BLOCKED** | 0 | No sandbox credentials; would also require real money movement |
| 11 | OpenAPI / schema validation | — | **NOT CONFIGURED** | — | No OpenAPI document or validator exists in the repo |

Notes on integrity:
- No test was weakened, deleted, or skipped to make the numbers look better. The suite grew by 11 tests.
- All 27 `●` lines in the test log are Jest `● Console` blocks, not failures. `Tests: 500 passed, 500 total` is the authoritative count.
- `npx jest --listTests` → 41, matching the suite count, so no test file is silently undiscovered.

### Before / after

| | Before | After |
|---|---|---|
| `npm run build` | **FAIL**, exit 2 (TS2307 ×2) | **PASS**, exit 0 |
| `npm test` | 38 suites / 489 tests | 41 suites / 500 tests, all passing |
| `npm run test:smoke` | **FAIL**, exit 1, "No tests found" | exit 0, 3 tests correctly **BLOCKED** |
| `npm run test:browser` | script did not exist | exit 0, 5 tests **BLOCKED** with a visible warning |
| Real-PG claim | Emulator presented as real PostgreSQL | Emulator labelled as emulator; real suite exists and reports BLOCKED |
| Webhook body | Unbounded buffer | 1 MiB cap, `413` / `400` |
| Refund retry race | Two approvals could both call PayPal | One call, proven deterministically |
| Order downgrade | `PAID` could be reset to `PAYMENT_PENDING` | Guarded, regression-tested |
| Error logs | Raw `err.message` | Redacted |

---

## 4. Phase 4 — Changed files

### Source code (7 files)

| File | Rationale |
|---|---|
| `src/middleware/raw-body.ts` | 1 MiB webhook body cap (`413`), streaming counter, `400` on malformed JSON, error forwarding |
| `src/refunds/service.ts` | Claim `PROCESSING` synchronously before the first `await`; restore `PROPOSED` and rethrow `RefundError` on failure |
| `src/persistence/migrations.ts` | Added `003_open_refund_uniqueness` (partial unique index on open refunds) |
| `src/orders/service.ts` | `setPayPalOrderId` no longer downgrades a settled order |
| `src/middleware/error-handler.ts` | Redact secrets in the central error log |
| `src/routes/orders.ts` | Document the public demo contract on `GET /orders` and `/orders/stats` (comments only) |
| *(deleted)* `tests/smoke/pg-migrate-002-smoke.ts` | Root cause of the build failure; false "real PostgreSQL" claim |

### Tests (6 new, 5 modified)

| File | Rationale |
|---|---|
| `tests/integration/webhook-body-limit.test.ts` | **new** — below-limit / over-limit / malformed body |
| `tests/integration/public-order-contract.test.ts` | **new** — unauthenticated, cross-session, aggregate-only, no id leakage |
| `tests/unit/error-handler-redaction.test.ts` | **new** — secrets redacted in error logs |
| `tests/smoke/pg-migrate.test.ts` | **new** — real `DATABASE_URL` migration smoke; BLOCKED without a database |
| `jest.smoke.config.js` | **new** — discovers smoke suites, no `setupFiles` so dummy creds cannot fake configuration |
| `tests/smoke/paypal-smoke.test.ts` | Rewritten — skips and prints BLOCKED unless real sandbox credentials exist |
| `tests/integration/refund-persistence.test.ts` | Added the deterministic at-most-once concurrency test |
| `tests/integration/persistence.test.ts` | Migration list includes `003`; new database-level uniqueness test |
| `tests/unit/orders.test.ts` | Regression test: settled orders are never downgraded |
| `tests/browser/dashboard.browser.test.ts` | Loud `SKIPPED (not a pass)` warning instead of a silent skip |
| `package.json` | `test:smoke` → smoke config; added `test:browser` |

### Docs and configuration (11 files)

| File | Rationale |
|---|---|
| `SUBMISSION.md` | 393 → 500/41; smoke suites described as BLOCKED; "what's next" no longer claims refund persistence is missing |
| `README.md` | `cd apps/backend` → `cd source/apps/backend` |
| `DEPLOY_AND_DEMO_RUNBOOK.md` (root + backend copy) | Correct paths, 500/500 in the tables, dated note preserving the historical 143/143 section |
| `docs/DATABASE.md` | `002` schema added, refund/policy-event tables, real-PG smoke instructions, new limitations |
| `docs/KNOWN_LIMITATIONS.md` | New sections: public demo contract, webhook dedupe semantics, refund concurrency and the DB invariant, capture request id |
| `docs/DEPENDENCY_ADVISORIES.md` | **new** — advisory table with reachability analysis |
| `docs/devpost-testing-instructions.md` | Fixed the clone path (`source/apps/backend`) |
| `ENVIRONMENT.md` | Fixed the `.env` location |
| `source/apps/flutter_app/README.md` | Fixed the backend start path |
| `.env.render.example` | CORS aligned with the evidence-backed live host |
| `render.yaml` | Comment recording where the live host is evidenced (value unchanged) |
| `.gitignore` | Ignore `test-results.json`, `npm-audit-full.json` |
| `verify.sh` | **new** — one-command verification |

---

## 5. Remaining risks and blockers

**Blockers for a claim of full verification (not for release):**

1. **No real PostgreSQL was ever exercised.** The migration smoke suite exists and is correct, but it has
   never run against a real server in this environment. Until it does, "the migrations work on PostgreSQL"
   is an untested claim. This is the single largest remaining evidence gap.
2. **Flutter tests never executed.** `flutter_tester` cannot start in this sandbox. `flutter analyze` is
   clean, but **0** Dart tests have run here. The app's test suite is unverified.
3. **PayPal sandbox flow never exercised.** Every PayPal interaction in the automated suite is mocked.
4. **Browser/dashboard tests never executed.** 5 tests skipped for want of Playwright/Chrome.

**Accepted risks, documented:**

5. `GET /api/orders` and `/api/orders/stats` publicly expose demo catalog data, totals and revenue.
   Intentional; must go behind merchant auth before real customer data.
6. `langsmith` high advisory remains, unreachable while tracing stays off. Do **not** enable
   `LANGCHAIN_TRACING_V2` / `LANGSMITH_TRACING` on this deployment.
7. Webhook dedupe is process-local; safe by handler idempotency, not by storage.
8. `DATABASE_SSL=true` does not verify the server certificate.

---

## 6. Recommendation

### **READY WITH CAVEATS**

**Criteria met:**

- Production build compiles cleanly (exit 0), with no suppression of real type errors.
- 500/500 backend tests pass, 11 of them new regression tests for the specific defects fixed.
- Every external-dependency test reports **BLOCKED**, never a false PASS.
- No test or assertion was weakened to reach these numbers.
- The one genuine money-safety bug (refund retry race) is fixed and proven deterministically.
- The one genuine state-integrity bug (order downgrade) is fixed and regression-tested.
- Documentation no longer overstates test counts or the realism of the test environment.
- No production dependency change was made that could destabilise the Ops Copilot.

**Caveats that block a plain READY:**

- Real PostgreSQL, the Flutter test suite, the PayPal sandbox flow and the browser tests have **not**
  been executed in this environment. Do not describe any of them as passing.
- The public order endpoints expose business data by design.

**What would move this to READY**, in priority order:

1. Run `DATABASE_URL=… npm run test:smoke` against a real PostgreSQL 14+ (locally, or as a CI service
   container). This is a five-minute check that closes the largest evidence gap.
2. Run `flutter test` on a machine where `flutter_tester` can start.
3. Run `npm run e2e:sandbox <url>` against a deployed instance with sandbox credentials.
4. Optionally add a `postgres` service to `.github/workflows/ci.yml` so step 1 happens on every push.
   Not applied here because the YAML could not be validated in this environment.

**Optional next step not taken:** a clean release-candidate directory or ZIP, isolated from this working
tree. It was left out because the working tree is the deliverable and the changes are uncommitted; say the
word and it can be produced.

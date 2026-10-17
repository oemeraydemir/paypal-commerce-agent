# Sprint A1.5 — Build Identity & Webhook Reconciliation Hardening

**Repository:** `C:\Projects\FinCan\paypal-commerce-agent`
**Branch:** `fix/render-deployment`

## Git state

| | Value |
|---|---|
| Starting HEAD | `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2` |
| Ending HEAD | `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2` (**unchanged — no commit/push/deploy**) |
| Starting working tree | clean except untracked `SPRINT_A1_3_REPORT.md`, `SPRINT_A1_4_LOCAL_AUDIT.md` (preserved) |
| Ending working tree | those two reports still untracked & preserved; 6 backend files modified (uncommitted) |

No commit, push, merge, deploy, webhook registration, or `git reset/clean` was performed.

## Changed files & why

| File | Δ | Reason |
|---|---|---|
| `apps/backend/src/routes/health.ts` | +6 | **Task 1.** Add optional `buildCommit` from `process.env.RENDER_GIT_COMMIT \|\| 'unknown'`. Not hardcoded; no other env exposed. |
| `apps/backend/tests/integration/health.test.ts` | +50 | **Task 1.** Three focused tests: absent var → `unknown`; present var → pass-through; empty string → `unknown`. Each restores `process.env.RENDER_GIT_COMMIT` in `finally`. |
| `apps/backend/src/routes/webhooks.ts` | +30/-14 | **Task 2.** A `PAYMENT.CAPTURE.COMPLETED` for an unknown order now returns **503** and is **not** marked processed. `CAPTURE.DENIED` and non-payment events for unknown orders stay 200/processed. |
| `apps/backend/tests/integration/webhooks.test.ts` | +100/-23 | **Task 2.** Added regression tests for the 503/retryable COMPLETED case and the 200/marked DENIED case; converted the generic "unknown order" case to a non-payment event. |
| `apps/backend/tests/integration/reservation-consistency.test.ts` | +16/-14 | **Task 2.** B6 "server restart, unknown order" test updated from the old 200/processed contract to the new 503/unprocessed contract. |
| `apps/backend/tests/integration/reservation-lifecycle.test.ts` | +7/-6 | **Task 2.** "full state loss, unknown order" test updated 200 → 503, still asserts no invented spend. |

Flutter code/tests were **not** touched (0 Flutter files in `git status`).

## Commands, exit codes, totals

| Command | Exit | Result |
|---|---|---|
| `npx jest tests/integration/webhooks.test.ts tests/integration/health.test.ts` | **0** | 2 suites, **18 passed** |
| `npx tsc --noEmit` | **0** | clean (empty output) |
| `npm test` (full backend suite) | **0** | **20 suites passed / 241 tests passed**, 21.7s |
| `git diff --check` | **0** | clean (no whitespace errors) |

Full backend suite went from the 236-test baseline to **241** (+5: three `health` buildCommit tests, plus a net +2 in webhooks after splitting the old "unknown order" case into COMPLETED/DENIED/non-payment coverage). All pass.


## Task 1 — Build identity: evidence & limitation

- `RENDER_GIT_COMMIT` is **not** referenced anywhere in the repo today and is **not** on Render's *official* "Default Environment Variables" list (`RENDER`, `RENDER_EXTERNAL_URL`, `RENDER_EXTERNAL_HOSTNAME`, `RENDER_SERVICE_ID/NAME/TYPE`, `RENDER_CPU_COUNT`, `IS_PULL_REQUEST`, …). Render explicitly warns that unlisted `RENDER_*` vars are "strictly for internal use and might change without warning."
- **However**, two independent sources confirm `RENDER_GIT_COMMIT` **is** populated at runtime with the deployed commit SHA:
  - AppSignal deploy-markers docs: *"Render … will populate the RENDER_GIT_COMMIT environment variable with the SHA of the git commit being deployed"* — and AppSignal reads it as the runtime revision.
  - davidwinter.dev: *"render.com offers an environment variable RENDER_GIT_COMMIT for the running application"* — used to compare a full 40-char SHA.
- **Decision:** expose it as `buildCommit: process.env.RENDER_GIT_COMMIT || 'unknown'`. It is **optional and defensive** because it is not on the official guaranteed list — we do **not** treat it as guaranteed (correcting the A1.4 note that assumed it is always set). Never hardcoded; no other env var exposed.
- **Limitation:** this only *exposes* the SHA the running instance reports. It does **not** prove the deployed commit equals `c8c5a40`; confirming that still requires Render dashboard/API access, which is **unavailable locally** → live deployment identity remains **BLOCKED / UNKNOWN**.

## Task 2 — Webhook reconciliation findings (verified against code + PayPal docs)

PayPal's own webhook contract (developer.paypal.com): *"Successful receipt requires your listener endpoint to respond with an HTTP 200 or other 2xx status code. Any non-2xx status code will cause PayPal to reattempt delivery up to 25 times over the course of 3 days or until it receives a 2xx success code."*

**Verified defect (fixed):** the previous code returned **HTTP 200** for a `PAYMENT.CAPTURE.COMPLETED` event that could not be matched to an internal order (in-memory state lost on restart). A 2xx tells PayPal to **stop retrying**, so real captured money became permanently invisible to the app (only an `UNRECONCILED_PAYMENT_EVENT` log line). This contradicted the acceptance criteria ("a payment event arriving after in-memory state loss produces an explicit, observable reconciliation outcome").

**Change:** for `PAYMENT.CAPTURE.COMPLETED` with no matching order, the handler now returns **503** and does **not** mark the event processed, so PayPal keeps retrying for up to 3 days while an operator reconciles from the loud error log. No money-capture, authorization, reservation, or spend semantics were changed — only the webhook acknowledgement for the unreconciled-capture case.

Behavior matrix after the change (all covered by tests):

| Scenario | HTTP | Marked processed? | Rationale |
|---|---|---|---|
| Duplicate event (same id, same process) | 200 | yes (already) | idempotent no-op |
| CAPTURE.COMPLETED, known order, already PAID | 200 | yes | `markOrderPaid` is idempotent; no double spend |
| CAPTURE.COMPLETED, known order | 200 | yes | reconcile → PAID |
| CAPTURE.DENIED, known order | 200 | yes | fail pending order + release reservation |
| **CAPTURE.COMPLETED, unknown order** | **503** | **no** | money moved but unreconcilable → keep retryable for operator |
| CAPTURE.DENIED, unknown order | 200 | yes | no money moved; nothing to reconcile; stop retries |
| CHECKOUT.ORDER.APPROVED, unknown order | 200 | yes | no money moved; no state change needed |
| Reconciliation throws | 500 | no | PayPal retries (existing behavior, unchanged) |
| No PayPal order id in event | 200 | yes | valid but irrelevant event |

**Retry-semantics assumption that still needs live verification:** that the endpoint is registered for `PAYMENT.CAPTURE.COMPLETED` and reachable so PayPal actually redelivers during the 3-day window. Documented, not assumed; it cannot be confirmed without a registered webhook and Sandbox delivery (see blockers).


## Task 3 — Persistence assessment (not implemented)

- **Volatile state:** `WebhookService.processedEvents` (dedup set) and the entire `OrderService` / `dailySpendTracker` order + reservation state are all in-memory.
- **Materially dangerous failure modes:**
  1. *Order/reservation state lost on restart* → a genuine `CAPTURE.COMPLETED` cannot be booked. **Now mitigated** at the webhook layer (503 keeps it retryable + loud log), but the app still cannot *recover the linkage* automatically because the order it belongs to is gone. Retrying alone does **not** recreate the missing order.
  2. *Dedup set lost on restart* → a redelivered event is processed again; this is safe **only** because `markOrderPaid`/status transitions are idempotent (verified: spend stays 600, PAID→PAID is a no-op).
- **Can retrying recover the missing order linkage?** No — retrying re-invokes the same handler against the same empty store. It only buys operator time. Automatic recovery needs durable order/reservation storage keyed by PayPal order id.
- **Smallest viable durable design:** persist just two things — (a) `paypalOrderId → internalOrderId` mapping and order status, and (b) the processed-event ids — in a small durable store (e.g. Render Key Value / Redis or SQLite). That is the minimum to make both the dedup set and the order→PayPal linkage survive restarts.
- **Migration / test / rollback implications:** needs a write path in order creation/capture/webhook, a startup load, and updated integration tests to seed/clear durable state. Rollback = disable the durable layer and fall back to in-memory. Intentionally **out of scope for A1.5** (no DB/Redis/dependency/architecture change) and recommended only after the restart-loss path is demonstrated on the real deploy.

## Remaining live blockers (still BLOCKED / UNKNOWN)

1. **Live deployment identity:** Render dashboard/API access unavailable → cannot confirm which commit is deployed. `buildCommit` now *reports* `RENDER_GIT_COMMIT` but does not prove it equals `c8c5a40`.
2. **Webhook activation:** `PAYPAL_WEBHOOK_ID` not configured locally and no PayPal Developer Dashboard access → `/api/webhooks/health` reports `webhookEnabled:false`; no webhook is registered.
3. **Full approval→capture→webhook lifecycle:** no Sandbox credentials/test buyer available locally → the end-to-end payment lifecycle is **NOT RUN**. Unit/integration coverage is deterministic (mocked PayPal); only the live Sandbox path is blocked.

## Distinction: unit/integration vs live Sandbox E2E

- **Verified here (deterministic, local):** webhook signature rejection, dedup, idempotent PAID→PAID, DENIED, unknown-order 503/200 matrix, no invented spend, buildCommit passthrough — all via Jest with a mocked PayPal client.
- **NOT verified (live):** real PayPal signature delivery, real 3-day retry behavior, real approval→capture→webhook sequence, real deployed commit. These require dashboard access and Sandbox credentials and remain explicitly **BLOCKED**.

## Security

No secrets, tokens, `.env` contents, credentials, or private buyer details appear in code, tests, logs, or this report. The only synthetic value used is a dummy 40-char commit SHA string in a test assertion.

# Sprint A1.4 — Local-Only Verification and Deployment Identity Assessment

**Mode:** AUDIT FIRST. NO COMMIT. NO PUSH. NO DEPLOY. NO WEBHOOK REGISTRATION.
**Date:** 2026-10-11
**Repository:** `C:\Projects\FinCan\paypal-commerce-agent`

> This audit changes no application code, tests, dependencies, or deployment
> configuration. It only runs read-only commands and records evidence. The live
> PayPal payment lifecycle and the deployed Render commit remain **explicitly
> BLOCKED** because no dashboard/API access exists in this environment.

---

## 1. Environment and Git Baseline

| Check | Result |
|---|---|
| `git branch --show-current` | `fix/render-deployment` |
| `git rev-parse HEAD` | `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2` |
| `git status --short` | `?? SPRINT_A1_3_REPORT.md` (only the A1.3 report, untracked) |
| `git diff --check` | **EXIT 0** — no whitespace/conflict markers |
| Modified tracked files | **none** |
| `git ls-files --error-unmatch SPRINT_A1_3_REPORT.md` | exit 1 → confirmed **untracked** |

**Branch, HEAD, and working tree preserved. Nothing staged, committed, or pushed.**

### Access assessment (drives the blockers below)
| Access | Evidence | Result |
|---|---|---|
| Render API/Dashboard | no `RENDER_*` env var; `render` CLI not installed | **NOT AVAILABLE** |
| PayPal Developer Dashboard | no `PAYPAL_*` env var; no `apps/backend/.env` (only `.env.example`, `.env.render.example`) | **NOT AVAILABLE** |

Because neither dashboard is reachable, deployment identity cannot be queried,
no Sandbox webhook can be registered, and no live signed webhook can be produced.

---

## 2. Test Verification (exact commands, exit codes, counts)

All run from `apps/backend` using the repo's Jest config.

| Command | Exit | Result |
|---|---|---|
| `npx jest tests/integration/webhooks.test.ts tests/integration/reservation-lifecycle.test.ts tests/integration/reservation-consistency.test.ts` | **0** | **Test Suites: 3 passed, 3 total; Tests: 51 passed, 51 total** |

Breakdown (individual runs earlier this session, all EXIT 0):
- `webhooks.test.ts` — **9/9**
- `reservation-lifecycle.test.ts` + `reservation-consistency.test.ts` together — **42/42**

(For reference, the full backend suite from A1.3 was **236/236 across 20 suites**,
`tsc --noEmit` EXIT 0. Not re-run in full here to keep this audit read-only and fast;
the three suites directly relevant to A1.4 were re-run above.)

---

## 3. Restart / Dedup / Idempotency Evidence

### Implementation
- **Webhook dedup (in-memory):** `webhook-service.ts` `processedEvents: Set<string>`,
  bounded to ~500–1000 ids. `markProcessed` is called **only after successful
  reconciliation** (route `webhooks.ts:115`); a failed reconciliation returns 500
  and is left unmarked so PayPal retries.
- **Idempotent order transitions:** `orders/payment-lifecycle.ts` is the single
  writer for order + reservation. `markOrderPaid` → `reconcileLateCapture` +
  `confirmReservation` (idempotent); `markOrderPaymentFailed` never un-spends a
  PAID order; `cancelUncapturedOrder` only cancels a still-PENDING order.
- **Capture route:** an already-captured order returns **409** (settled from PayPal);
  an ambiguous transport error returns **502** and does **not** release the
  reservation (F3).

### Tests that pin these behaviors
`reservation-lifecycle.test.ts:281 describe('server restart (in-memory state lost)')`:


---

## 4. Deployment SHA Feasibility and Limitations

Current `src/routes/health.ts` returns a **hardcoded** `version: '1.0.0'`; there is
no git SHA, no build-time env, and no `GIT_*`/`COMMIT_*` variable anywhere in
`environment.ts`. `server.ts` logs only port + NODE_ENV. So today a health check
**cannot** prove which commit is deployed.

**Feasibility:** a build SHA can be exposed without adding a secret, using a
trusted build-time value. Render sets `RENDER_GIT_COMMIT` automatically during a
build; alternatively `package.json` `version` can be bumped per release. Both are
already "trusted inputs" (not secrets), so this does **not** create a false source
of truth as long as the value is read from the environment/build, not hardcoded.

**Limitations to respect:**
- Must be an **optional** env (`process.env.RENDER_GIT_COMMIT ?? 'unknown'`) so
  local/test runs still work.
- Must **not** fall back to a hardcoded SHA (that would be a false source of truth).
- `webhooks/health` currently exposes only `webhookEnabled` — unrelated to commit.

### Proposed minimal diff (NOT implemented this audit)
```ts
// src/routes/health.ts — inside the JSON body
  version: '1.0.0',
+ buildCommit: process.env.RENDER_GIT_COMMIT ?? 'unknown',
```
- **Populated:** automatically by Render during build (`RENDER_GIT_COMMIT`); locally
  it stays `'unknown'` unless the developer exports it.
- **Tested:** a unit test asserts the field exists and equals `'unknown'` when the
  env var is absent (no secret involved); an integration test can set
  `process.env.RENDER_GIT_COMMIT` to a dummy value and assert pass-through.
- **Verified in deploy:** after a Render deploy, `GET /api/health` should echo the
  pushed commit SHA; compare against `git rev-parse HEAD`. This still requires
  dashboard/API access to *trigger and confirm* the deploy — currently blocked.

---

## 5. Webhook Persistence Risks and Options (no premature implementation)

**Risk (P1):** webhook dedup (`processedEvents`) and order/reservation state are
in-memory. On Render's free plan, instances restart and cold-start. Consequences:
- A duplicate webhook after restart is re-processed but is a **no-op** (idempotency)
  — safe.
- A **first-time** CAPTURE.COMPLETED for an order this instance never created (e.g.
  created before a restart) is acknowledged but **not reflected** — the real payment
  is invisible. This is the material risk for a demo and for correctness.

**Options (to be scoped, not built now):**
1. **Persist processed event ids** (TTL set) in Redis/SQLite so dedup survives restarts.
2. **Persist orders + reservations** (the real fix): move `OrderService` and

---

## 6. Public API Data-Exposure Findings (reported, not changed)

| Endpoint | Field | Finding |
|---|---|---|
| `GET /api/orders` (public) | `sessionId` | **masked** via `publicSessionRef` (SHA-256 `sess_xxxxxxxx`) — not reversible. ✅ |
| `GET /api/orders` (public) | `paypalOrderId` / `paypalCaptureId` | **absent** (B1 redaction). ✅ |
| `GET /api/policy-events` (public) | `userId` | **absent** (B1). ✅ |
| `GET /api/policy-events` (public) | `sessionId` | **masked**. ✅ |

**Residual risk (unchanged by this audit):** these are **unauthenticated** endpoints.
Masking prevents reversing identifiers but is **not an access control**. For real
user data / real orders, the access model (auth or network restriction) should be
revisited. For a public demo with no PII, current behavior is acceptable. **No
contract was changed.**

---

## 7. Working-Tree Confirmation

- `SPRINT_A1_3_REPORT.md`: **untracked** (confirmed, not staged).
- `SPRINT_A1_4_LOCAL_AUDIT.md`: this file, newly created (untracked).
- No other modified/untracked files. `git diff --check` clean.
- **No staging, commit, push, deploy, or webhook registration performed.**

---

## 8. Remaining Live Blockers

- **B1 — Deployment identity UNKNOWN.** No Render API/dashboard access; health
  exposes no SHA. Cannot confirm which commit is live.
- **B2 — Webhook not registered.** No PayPal Developer Dashboard access; live
  `/api/webhooks/health` reports `webhookEnabled:false`. No signed webhook can be
  produced locally without `PAYPAL_WEBHOOK_ID` + Sandbox credentials.
- **B3 — Full payment lifecycle NOT demonstrated.** Approval → capture → webhook →
  final state requires an interactive Sandbox buyer + a registered webhook — both
  blocked. (Create/cancel/ambiguous legs were demonstrated live in A1.3; they do
  not prove a successful capture.)

---

## 9. Proposed Next Steps and Acceptance Criteria

1. **Expose build SHA** (small, isolated change):
   - Add `buildCommit: process.env.RENDER_GIT_COMMIT ?? 'unknown'` to `/api/health`.
   - Add/adjust tests (env-absent → `'unknown'`; env-present → pass-through).
   - *Acceptance:* `GET /api/health` on a deployed instance echoes the pushed SHA;
     local/test stays `'unknown'`; no secret introduced. **Requires deploy access.**
2. **Enable Sandbox webhook** (needs explicit authorization + PayPal dashboard):
   - Register the webhook for `PAYMENT.CAPTURE.COMPLETED` / `.DENIED` /
     `CHECKOUT.ORDER.APPROVED` at `/api/webhooks/paypal`.
   - Set `PAYPAL_WEBHOOK_ID` on Render; confirm `/api/webhooks/health` →
     `webhookEnabled:true`.
   - *Acceptance:* valid-signature delivery verified; invalid signature → 401;
     duplicate → no double effect. **Requires authorization.**
3. **Run full lifecycle** (needs 1+2):
   - Create → approve (Sandbox buyer) → capture → observe webhook → verify final
     order PAID and reservation confirmed; replay webhook → no double count.
   - *Acceptance:* timestamped evidence for each step; final state consistent.
4. **Decide webhook persistence** only after demonstrating the restart-loss risk on
   the actual demo path (see §5). *Acceptance:* documented decision + minimal scope.

---

## 10. Acceptance Criteria (this audit)

- [x] No application code or configuration changed.
- [x] No commit, push, deployment, or webhook registration occurred.
- [x] Every test result backed by actual command output (51/51, EXIT 0).
- [x] Live deployment identity and full payment lifecycle explicitly **BLOCKED**.
- [x] Report contains no credentials, tokens, personal data, or sensitive payloads.

   `dailySpendTracker` to durable storage so reconciliation can re-attach events.
3. **PayPal order lookup on unknown event:** on an unknown `PAYMENT.CAPTURE.*`,
   query PayPal for the order and reconcile by customer ref — heavier, needs the
   PayPal id linkage to be durable too.
4. **Hackathon-pragmatic:** keep in-memory, document the limitation, and ensure the
   demo creates the order on the same instance that receives the webhook.

**Recommendation:** do **not** start a database migration for a hackathon demo.
Prove the requirement first (option 4 + the existing restart tests), then scope a
minimal durable store (Redis or SQLite) only if the restart-loss scenario is shown
to matter for the actual demo path.

| Test | Proves |
|---|---|
| "webhook replay after the dedup set is lost does not double count" | Replaying the same `WH-SAME` event after `processedEvents.clear()` still yields **spend 600** (not 1200) — **idempotent PAID, no double count** even though the dedup guard was lost. |
| "after a full state loss, a COMPLETED webhook for an unknown order is acknowledged without crashing and without inventing spend" | With `orderService.reset()` + `dailySpendTracker.reset()`, a COMPLETED webhook → **200 "order not found"**, **spentToday = 0** (no invented spend), reconciler examines 0. |

### Four distinct failure modes — explicitly distinguished
1. **Duplicate-event protection (live process):** `isDuplicate` short-circuits a
   retried event to `200 "Event already processed"`. ✅ tested (`webhooks.test.ts`).
2. **Idempotent order-state transitions:** `markOrderPaid`/`markOrderPaymentFailed`
   are safe to call repeatedly; a PAID order stays PAID, a DENIED event cannot
   un-spend it. ✅ tested (`webhooks.test.ts` "idempotent PAID → PAID").
3. **Loss of dedup set after restart:** the `processedEvents` Set is in-memory, so
   a restart clears it. A replayed event is then **re-processed**, but because
   reconciliation is idempotent the effect is a **no-op** (no double spend). ⚠️
   *Correctness preserved by idempotency, not by dedup.*
4. **Loss of order/reservation state after restart:** with all in-memory state
   gone, a real CAPTURE.COMPLETED for an order this instance never saw is
   **acknowledged (200) but not reflected** in spend/order state — a real payment
   becomes invisible to the app. ⚠️ *Documented limitation, logged as
   `UNRECONCILED_PAYMENT_EVENT`, not fixed here.*

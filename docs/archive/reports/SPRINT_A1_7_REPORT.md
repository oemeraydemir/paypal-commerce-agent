# Sprint A1.7 — Persistence & Webhook-Recovery Architecture Review (READ-ONLY)

**Mode:** Read-only architecture + code audit. No code, config, or dependency changed.
No commit/push/deploy/webhook. Existing reports preserved; this is a new file.
**Repository:** `C:\Projects\FinCan\paypal-commerce-agent` · Branch `fix/render-deployment` · HEAD `c8c5a40` (unchanged).

---

## 1. Git state

| Item | Value |
|---|---|
| HEAD (start = end) | `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2` |
| Working tree | 6 A1.5 files modified (uncommitted) + 5 untracked reports preserved (A1.3/4/5/6/7) |
| Files changed this sprint | **None** (audit only) |

No `git reset`/`clean`/staging.

---

## 2. Verified finding: ALL payment state is in-memory (volatile)

Static scan of `src/**/*.ts` — every store is a module-level singleton `Map`/`Set`. **Zero** sqlite/redis/disk references anywhere in the repo (non-node_modules).

| State | Location | Volatile? | Needed for payment recovery? |
|---|---|---|---|
| `orders` (id, status, `paypalOrderId`, `paypalCaptureId`, `reservationId`) | `orders/service.ts:8` `new Map` | **Yes — lost on restart** | **YES — the core linkage** |
| `confirmedSpend` + `records` (reservations) | `policy/daily-spend-tracker.ts:33-34` `new Map` | **Yes** | **YES — spend/reservation** |
| `processedEvents` (webhook dedup) | `paypal/webhook-service.ts:22` `new Set` | **Yes** (bounded 500) | **YES — idempotency** |
| `idempotencyStore` + `pendingRequests` | `middleware/idempotency.ts:11,14` | **Yes** | Yes — retry safety |
| `sessions`, `conversationHistory`, `policies` | session/ai/policy | **Yes** | Supporting (auth/context) |

**Key correlation path:** `webhook → extractPayPalOrderId → orderService.getByPayPalOrderId()` scans the in-memory `orders` Map (`service.ts:82-86`). On restart the Map is empty → every live capture event hits the **503 unknown-order branch** and can **never** self-heal, because the linkage that maps `paypalOrderId → orderId` no longer exists in the process.

---

---

## 4. Deployment reality (drives the storage choice)

`apps/backend/render.yaml`:

- `type: web`, **`plan: free`** — free web services **spin down after inactivity** and are re-created from source on the next request; **all in-memory state is wiped on every cold start**.
- **No `disk:` block** → no persistent filesystem; a local SQLite file would be discarded on redeploy/restart and would not be shared across instances.
- Secrets via `sync: false` (PAYPAL_*, OPENAI_API_KEY) — no DB URL provisioned.

**Implication:** because there is no disk and the instance is ephemeral, **SQLite-on-disk is disqualified** (non-durable here). A durable store must be a **separate Render service** (Render Postgres, or Render Key Value/Redis) accessed over the network. Free-instance spin-down makes "just restart" recovery impossible without such a store.

---

## 5. Storage recommendation (evidence-based, not convenience)

**Recommended (smallest reliable): Render Key Value (Redis)** as a durable ledger of two things only:
1. `paypalOrderId → { orderId, status, reservationId, amountMinor, currency, captureId }` (order + reservation linkage).
2. `processed webhook event ids` (idempotency), written **only after** successful reconciliation.

Rationale: Redis is a single independent service, needs no schema migration, matches the existing singleton-store access pattern, and survives restarts/spin-downs. Render **Postgres** is the alternative if relational queries/audit trail are later required — heavier (schema + migration tooling) for this stage.

**Explicitly not chosen yet:** SQLite (no durable disk on this plan), adding Redis "because it's easy" (it is chosen because the plan has no disk + ephemeral instance — that is the *evidence*, not convenience).

**Design constraints to preserve:**
- Writes must stay **idempotent**; dedup + state transition still keyed by the durable store, not memory.
- The 503-for-unknown-captured-payment path remains the safety net even with Redis (first event may arrive before the order is persisted) — but with durable linkage the operator can reconcile instead of relying on retry alone.
- Money/reservation semantics (PayPal = source of truth) unchanged; only the storage backing changes.

**Open item requiring verification (not assumed):** free-tier eligibility/quota for Render Key Value / Postgres and cost if the plan is upgraded. Confirm in the Render dashboard before committing to a provider.

---

## 6. Test design for the future implementation sprint (scenario coverage)

| Scenario | Must verify |
|---|---|
| Normal payment | order+reservation persisted; capture → PAID → spend confirmed |
| Duplicate webhook | second event is a no-op (durable dedup), no double spend |
| Process restart | order/reservation/dedup survive cold start |
| Delayed/late capture | `reconcileLateCapture` restores PAID + spend after a local cancel/expire |
| Unknown-order captured payment | event logged/investigable; reconciled once linkage restored |
| Reconciliation error | event left unprocessed (retryable); never falsely marked PAID |
| Spin-down recovery (Render free) | state survives the ~15-min inactivity spin-down |

Coverage must distinguish **unit/integration (mocked PayPal)** from any real Sandbox E2E.

---

## 7. Why the emulator is not exercised this sprint

The open emulator runs the Flutter client; the persistence problem is entirely in the separate Node backend (in-memory singletons), and the free-plan/no-disk facts come from `render.yaml` + Render docs, not from runtime. Running the app would add no evidence for the storage decision. Emulator E2E belongs to the implementation/demo sprint after durable storage is added.

---

## Acceptance criteria

- [x] Read-only: no code/config/dependency changed.
- [x] No commit/push/deploy/webhook.
- [x] Existing 4 reports preserved; new report in its own file.
- [x] Storage preference derived from actual code + deployment conditions (§2–§5), with an explicit open item rather than an assumption.
- [x] `503 + retry` correctly characterized as mitigation, not recovery (§3).


## 3. The 503 mitigation is necessary but NOT sufficient (confirmed)

`webhooks.ts` returns 503 (not marked processed) for an unknown-order `PAYMENT.CAPTURE.COMPLETED`, keeping PayPal retrying ≤3 days. This is correct damage-control. **But** retry only re-posts the *same* event to a process whose `orders` Map is empty — it cannot recreate the lost order. Reconciliation to 200 is impossible without either (a) durable linkage restored out-of-band, or (b) a persistent store. **Retry alone does not recover payment state.** (A1.6 already flagged this; the architecture review confirms the root cause is the in-memory-only store, not the HTTP code.)

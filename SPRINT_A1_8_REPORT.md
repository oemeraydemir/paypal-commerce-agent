# Sprint A1.8 — Current-State Reconciliation & P0 Delta Audit (READ-ONLY)

**Mode:** Read-only. No source/test/config/dependency/lockfile/docs/Git-metadata/deployment changes.
No commit/branch/tag/stash/stage/reset/clean/checkout/merge/rebase/push/deploy/webhook.
**Repo root:** `C:\Projects\FinCan\paypal-commerce-agent` · Branch `fix/render-deployment` · HEAD `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2`.

Pre-flight conflict check: `SPRINT_A1_8_REPORT.md` did **not** exist → written as a new file.

---

## 1. Actual Git baseline

| Item | Value |
|---|---|
| Branch | `fix/render-deployment` |
| HEAD | `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2` |
| Tracked modifications | 6 files (the A1.5 implementation set) |
| Untracked | 5 reports: A1.3, A1.4, A1.5, A1.6, A1.7 |

**Six A1.5 files still modified (uncommitted):** `health.ts`, `webhooks.ts`, `health.test.ts`, `reservation-consistency.test.ts`, `reservation-lifecycle.test.ts`, `webhooks.test.ts` (+186 / −23). **All five A1.3–A1.7 reports preserved** (untracked). No untracked report was treated as an implementation change. Nothing was cleaned up.

---

## 2. Workspace changes & evidence artifacts

Committed (tracked) evidence under `e2e-evidence/` was scanned for leaked identifiers:
`catalog.json`, `health.json`, `policy-events.json`, `webhook-health.json` → **0** occurrences of `paypalOrderId` / `paypalCaptureId` / `userId`. No secrets found. (Screenshots/logs present but not data-bearing for IDs.)

---

## 3. Validation — commands, exit codes, results

| Command | Exit | Result |
|---|---|---|
| `git diff --check` | **0** | clean |
| `npx tsc --noEmit` | **0** | clean (no output) |
| `npm test` (backend) | **0** | **241/241 passed, 20/20 suites, 18.4s** |

Backend suites present (20): ai, checkout, dashboard, e2e-demo-flow, health, orders, policy-enforcement, policy-events-api, reservation-consistency, reservation-lifecycle, webhooks, paypal-smoke, catalog, environment, money, policy, session-store, tool-executor, p0-claims (+orders unit).

**Flutter analyze/test: BLOCKED** — not run this sprint (kept strictly read-only; SDK/deps were exercised in A1.3/A1.5 where 27/27 passed and only the known `prefer_initializing_formals` info remained). No code changed to influence any check.

Secret scan (patterns, values NOT printed): `AKIA…`=0, `BEGIN PRIVATE KEY`=0, `xoxb-`=0, `password="`=0, `api_key="`=0. Only `.env.example` / `.env.render.example` templates exist; no `.env` with values. `request-logger.ts` redacts Authorization/Password/Secret/Api-Key/OpenAI.


---

## 4. Current-state P0/P1 matrix (grounded in current code)

| Topic | Evidence (file:line) | Status | Impact |
|---|---|---|---|
| Session auth required (Bearer + X-Session-Id) | `middleware/session-auth.ts:19-44` | **OK** | protected routes 401/403 |
| Ownership checks (create/capture/cancel) | `orders.ts:78,282`, capture `order.sessionId!==req.session` | **OK** | cross-session 404 |
| Per-session identity (not global) | `session-store.ts:52,92` `userIdForSessionId` | **OK** | spend isolated per session |
| Public orders omit PayPal ids | `orders.ts:494-517` (comment + mapping) | **OK (B1)** | no PayPal ids leaked |
| Public orders/policy-events mask session | `orders.ts:497` `publicSessionRef`; `policy-events.ts:63` | **OK** | non-reversible label |
| policy-events omit internal userId | `policy-events.ts:60-74` (no userId field) | **OK** | B1 satisfied |
| Webhook unknown captured payment → 503 retryable | `webhooks.ts:68-88` | **OK (mitigation)** | see P0 below |
| Idempotent reconciliation | `payment-lifecycle.ts:39-43`, `service.ts:122-147` | **OK** | no double spend |
| **Release APK base URL = `10.0.2.2`** | `api_service.dart:42-44` default `10.0.2.2:3000`; **no dart-define override anywhere** | **OPEN (P0)** | release points at emulator host |
| **Android cleartext enabled** | `AndroidManifest.xml:9` `usesCleartextTraffic="true"` | **OPEN (P0)** | insecure transport for release |
| **Payment state lost on restart** | `orders/service.ts:8`, `webhook-service.ts:22` in-memory; `render.yaml` free plan, no disk | **OPEN (P0)** | see §5 |
| Policy NOT visible to Flutter client | order-create success `orders.ts:259-268` lacks `policyDecision`; Flutter 0 matches | **PARTIAL (P1)** | user can't see decision |
| Policy editable? | No policy PUT/POST route; read/filter only `policy-events.ts` | **OPEN (P1)** | fixed per-session default |
| Demo basket vs catalog prices | `data.json`: `premium_cake=4500`, `coffee=300`; no divergent hardcoded basket in `tool-executor.ts` | **LIKELY STALE (P2)** | verify in A1.9 |


---

## 5. Persistence recommendation (A1.7 confirmed; record only — NOT implemented)

Recommendation stands: **Render Key Value (Redis)** as a durable ledger of `paypalOrderId → {orderId,status,reservationId,amount,captureId}` + processed webhook ids. Evidence (not convenience): `render.yaml` is **free plan with no disk** → SQLite-on-disk disqualified; instance is ephemeral and spins down → memory alone cannot survive. Trade-off vs Postgres: Redis = no schema/migration, matches singleton access pattern; Postgres = relational audit but heavier migration. **Unresolved external deps (not assumed):** Render Key Value/Postgres free-tier availability, quota, and cost — requires dashboard access.

---

## 6. Claude-claim reconciliation

| Historical claim | Current evidence | Status |
|---|---|---|
| Flutter does not create a session / send bearer | `api_service.dart:80-150` `_ensureSession`, `POST /api/sessions`, Bearer + X-Session-Id | **FIXED** |
| Release APK points to `10.0.2.2` | `api_service.dart:42-44` default still `10.0.2.2:3000`, no override | **OPEN** |
| Session-auth changes are uncommitted | 6 files still `M` (uncommitted) | **PARTIAL** (functional but uncommitted) |
| Live deployment is commit `da0f6b7` | no Render dashboard/API; `buildCommit` unverified | **UNVERIFIED** |
| `/api/orders` & `/api/policy-events` expose sensitive info | `orders.ts:494-517` omit PayPal ids; `policy-events.ts:60-74` omit userId | **FIXED** |
| All visitors share a global spending identity | `session-store.ts:52` per-session `userIdForSessionId` | **FIXED** |
| Unknown captured payments unrecoverable after restart | `webhooks.ts:68-88` 503 retryable, but linkage in-memory → not self-healing | **PARTIAL (P0 mitigation, not recovery)** |
| Policy not visible/editable | order response lacks decision; no edit route; Flutter shows none | **PARTIAL** (read-only in policy-events; not editable; not shown in checkout) |
| Demo basket doesn't match catalog prices | no divergent hardcoded basket found; catalog is single source | **STALE / LIKELY STALE** (verify A1.9) |

---

## 7. Confirmed security risks & scan limitations

- **P0 release transport:** cleartext `true` + emulator default host → release build is insecure and points at the wrong host. Needs `dart-define` for prod URL and `usesCleartextTraffic=false` (with network-security-config for dev).
- **Scan limitation:** pattern scan covers common literal-secret shapes; it cannot prove absence of secrets in binary assets, generated logs, or runtime-only values. Committed `e2e-evidence` logs/screenshots need manual review before public release.
- **Persistence (P0):** restart/spin-down loses payment state; 503 is mitigation, not recovery.

## 8. Recommended Sprint A1.9 scope

1. Fix release build config: prod API base via `dart-define`; disable cleartext for release (keep dev exception); verify.
2. Expose authoritative policy decision + explanation to the Flutter checkout UI (backend response + client render) — with tests.
3. Decide & provision durable storage (Redis) — requires Render access; migrate orders/reservations/dedup + restart tests.
4. Commit the A1.5 changes once release config is aligned.
5. Verify committed `e2e-evidence` has no sensitive content.

## 9. Checks NOT performed (BLOCKED/UNVERIFIED)

- Live deployment identity (Render dashboard/API) — UNVERIFIED.
- Webhook registration / live delivery — UNVERIFIED (no `PAYPAL_WEBHOOK_ID`).
- Real Sandbox approval→capture→webhook lifecycle — NOT RUN (no credentials/buyer).
- Flutter analyze/test this sprint — BLOCKED (read-only; previously 27/27 in A1.3/A1.5).
- Render Key Value/Postgres availability/cost — UNVERIFIED.

**Stop here per instructions. Sprint A1.9 not started; no fixes applied automatically.**

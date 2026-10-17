# G1 Sandbox E2E — Evidence Report (Task P1)

- Date: 2026-10-15
- Repository: `C:\Projects\FinCan\paypal-commerce-agent`
- Branch: `fix/render-deployment`
- HEAD: `6695076f3f8e55742dae8dcf4b16b3fdce0141c3`
- Secrets policy: `.env` KEY NAMES only; no values, tokens, or credentials printed. Order IDs would be masked `first4…last4` — **no order ID was created**.

## Verdict

**BLOCKED.** The real PayPal Sandbox E2E could **not** complete. The `.env` PayPal credentials are placeholder/invalid: PayPal's sandbox OAuth endpoint returns **401**, so `POST /api/orders/create` cannot create a PayPal order. Per the hard rules the run was **STOPPED** — no replacement order was created. Every step that requires a real PayPal order is **NOT RUN**.

## Step results

| Step | Description | Result | Evidence |
|---|---|---|---|
| 1 | Baseline git | **PASS** | HEAD `6695076…`, branch `fix/render-deployment`, 17 modified / 11 untracked, `git diff --check` exit 0 |
| 2 | `npx tsc --noEmit` | **PASS** | exit 0 |
| 2 | `npx jest --runInBand --silent` | **FAIL (1)** | **24 suites passed / 1 failed; 317/318 tests** (expected 25/318). Failing: `tests/unit/environment.test.ts`. See "Test deviation". |
| 3 | Start backend + health guard | **PASS** | Started with `RENDER_EXTERNAL_URL=http://localhost:3000` (+ explicit local return/cancel URLs). `/api/health` → `paypal.enabled=true`, `paypal.environment=sandbox`, `ai.enabled=true` (uptime small = fresh instance). |
| 4 | API driver E2E (`E2E_SKIP_AI=1`) | **BLOCKED** | Policy **BLOCK 403 PASS**; then `POST /api/orders/create` → **401** (PayPal OAuth 401). No `totalMinor`/capture reached. |
| 5 | Storefront path (human) | **NOT RUN** | Blocked by step 4 (`createOrder` needs PayPal). |
| 6a | cancel path | **NOT RUN** | Blocked (needs a real PayPal order). |
| 6b | capture before approval → 400 `ORDER_NOT_APPROVED` | **NOT RUN** | Blocked (needs a real PayPal order). |
| 6c | second capture of paid order → 409 | **NOT RUN** | Blocked (needs a PAID order). |
| 6d | over-limit cart → 403, no new PayPal order | **PASS** | Driver 2b: `POST /api/orders/create` (`premium_cake`) → **403 `policyDecision=BLOCK`**; server log shows **no** PayPal call for that request. |
| 7 | This report | **DONE** | — |

## Blocker detail (masked, no secrets)

- Server log: `info: Request POST https://api-m.sandbox.paypal.com/v1/oauth2/token` → `Response 401`.
- Consequence: `POST /api/orders/create` → `401` with an empty error body; the driver stopped with **no orderId** and did not retry/replace.
- Credential shape (categories only, values never printed): `PAYPAL_CLIENT_ID` = medium(20–60 chars); `PAYPAL_CLIENT_SECRET` = short(<20 chars); a placeholder marker (`your|xxx|changeme|placeholder|example|test-client|dummy|todo`) is present. Real PayPal Sandbox credentials are ~80 chars each.
- Sandbox guard held: SDK used `Environment.Sandbox` and host `api-m.sandbox.paypal.com` — no live-PayPal path was reachable.
- `.env` key names present (no missing keys): `PAYPAL_ENABLED, PAYPAL_ENV, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_RETURN_URL, PAYPAL_CANCEL_URL, PAYPAL_WEBHOOK_ID, OPENAI_API_KEY, PORT, NODE_ENV, CORS_ORIGIN, OPS_COPILOT_ENABLED, OPS_COPILOT_KEY`. `.env` is git-ignored.

## Test deviation (step 2)

- Expected: 25 suites / 318 tests. Actual: **24 passed / 1 failed (317/318)**.
- Failing: `tests/unit/environment.test.ts` › "builds hosted checkout callback URLs from the public backend URL".
- Cause: `.env` sets **explicit** `PAYPAL_RETURN_URL` / `PAYPAL_CANCEL_URL` (non-localhost, `10.0.2.2`). That test evaluates the real config module, and `dotenv.config()` re-injects the `.env` values, overriding the test's `RENDER_EXTERNAL_URL` derivation. The config code (`src/config/environment.ts`) prefers explicit URL vars over the derived default.
- Not caused by the Task P1 script edit (the script is not imported by any test; the same edit was green in the prior task when `.env` was absent).
- Not fixable within the allowed edit scope (would require editing `.env` or the test/config, which are out of scope) → reported instead.

## Backend restart note

A **pre-existing** backend (uptime ~2h, PID `23700`) was already listening on `:3000`; the fresh start hit `EADDRINUSE`. Per the task's authorization to start/stop the local backend, that process was stopped and the backend was restarted with **local** return/cancel URLs. No files were deleted or touched.

## Allowed edit (a) — applied

`apps/backend/scripts/e2e-sandbox-flow.ts`:
- Honor `E2E_SKIP_AI=1` (skip the `health.ai` guard and AI chat #1).
- Exit code **3** on approval TIMEOUT (was 0).
- Verified: `npx tsc --noEmit` exit 0; `git diff --check` exit 0.

## Exact commands & exit codes

| Command | Exit |
|---|---|
| `git rev-parse HEAD` / `git branch --show-current` / `git status --short` | 0 |
| `npx tsc --noEmit -p tsconfig.json` | 0 |
| `npx jest --runInBand --silent` | 1 (1 failed / 317 passed) |
| `RENDER_EXTERNAL_URL=http://localhost:3000 PAYPAL_RETURN_URL=…localhost… PAYPAL_CANCEL_URL=…localhost… PORT=3000 npx ts-node --transpile-only src/server.ts` | running (fresh health OK) |
| `E2E_SKIP_AI=1 E2E_APPROVAL_TIMEOUT_MS=600000 npx ts-node --transpile-only scripts/e2e-sandbox-flow.ts http://localhost:3000` | 2 (driver stop: create failed, no orderId) |
| `git diff --check` | 0 |

## Final git status

17 modified + 11 untracked; `git diff --check` exit 0. Only `apps/backend/scripts/e2e-sandbox-flow.ts` changed by this task. No untracked files touched. Nothing committed, pushed, stashed, reset, cleaned, or restored.

## Remaining blockers

1. **Replace `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` in `apps/backend/.env` with REAL PayPal Sandbox app credentials** (developer.paypal.com → Apps & Credentials → Sandbox). This is the hard blocker (OAuth 401).
2. `.env` `PAYPAL_RETURN_URL` / `PAYPAL_CANCEL_URL` point to `10.0.2.2` (non-localhost) → the browser redirect after approval is unreachable. Set them to `http://localhost:3000/api/checkout/{return,cancel}`, or unset them so `RENDER_EXTERNAL_URL` drives the URLs.
3. A PayPal **Sandbox BUYER** account for the browser approval step.
4. (Optional) `PAYPAL_WEBHOOK_ID` + a public HTTPS callback for webhook-driven PAID.
5. Re-run steps 4–6 after blockers 1–2 are fixed.

## Explicit NOT RUN

Real PayPal order creation / approval / capture; the storefront path (step 5); negative checks 6a/6b/6c. **No PayPal order was created, no capture was performed, and no OpenAI request was made.**

# TASK P3 — Release-gate preparation & post-deploy verification

**Repo:** `C:\Projects\FinCan\paypal-commerce-agent`
**Branch:** `fix/render-deployment`
**Baseline HEAD at task start:** `6695076f3f8e55742dae8dcf4b16b3fdce0141c3`
**HEAD after step 3 (pushed):** `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb`
**Remote tip after push:** `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb` (fast-forward, `ee6209b..d9f928a`)
**Owner-confirmed Render host:** `paypal-commerce-agent-backend.onrender.com`
**Date:** 2026-10-15

> No secret values appear in this report. `.env` is git-ignored and was never committed.

---

## Step 1 — Pre-deploy build + `render.yaml` validation — ✅ PASS

### Local production build
| Check | Command | Result |
|---|---|---|
| Install (Render's real build cmd) | `npm install` | exit 0 |
| Compile | `npm run build` | exit 0; `dist/src/server.js` produced; `public/` copied to `dist/public` |
| Boot prod | `NODE_ENV=production PORT=3000 npm start` | listening on :3000 |
| Health | `GET /api/health` | `{"status":"ok","environment":"production","paypal":{"enabled":true,"environment":"sandbox"},"ai":{"enabled":true}}` |

`curl` is unusable in this environment (HTTP proxy env), so HTTP was exercised with Node `fetch`. The prod server was stopped afterwards; port 3000 is free.

> Note: `npm ci` is blocked by this environment's safe-delete guard (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`); `npm install` (Render's actual `buildCommand`) was used instead and succeeded.

### `render.yaml` (`apps/backend/render.yaml`)
| Field | Value | Verdict |
|---|---|---|
| `name` | `paypal-commerce-agent-backend` | matches confirmed host |
| `rootDir` | `apps/backend` | ✅ |
| `buildCommand` | `npm install && npm run build` | ✅ (verified locally) |
| `startCommand` | `npm start` → `node dist/src/server.js` | ✅ (verified locally) |
| `plan` / `env` | `free` / `node` | ✅ |
| `CORS_ORIGIN` | `https://paypal-commerce-agent-backend.onrender.com` | ✅ matches confirmed host |
| Secrets | `PAYPAL_WEBHOOK_ID`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `OPENAI_API_KEY` all `sync: false` | ✅ no secret values in file |

**Hostname resolution.** Older reports referenced `paypal-commerce-agent.onrender.com` (without `-backend`) and noted that the `-backend` host returned 404 (`SPRINT_A1_3_REPORT.md:213`). Owner confirmed the service name is **`paypal-commerce-agent-backend`**, so `render.yaml` / `.env.render.example` `CORS_ORIGIN` are correct as-is — **no change required**.

`PAYPAL_RETURN_URL` / `PAYPAL_CANCEL_URL` are intentionally absent from `render.yaml`; `environment.ts` derives them from `RENDER_EXTERNAL_URL` at runtime, so they auto-follow the real service URL.

---

## Step 2 — Secret scan before push — ✅ PASS

Scanned: 232 tracked files + 22 untracked files, plus full git history (all branches).

| Check | Result |
|---|---|
| `.env` git-ignored (`git check-ignore` → `apps/backend/.gitignore:4:.env`) | ✅ `!!` |
| `.env` ever added to git (`git log --all --diff-filter=A`) | ✅ never |
| Real `PAYPAL_CLIENT_ID` value in tracked / untracked / history | ✅ not found |
| Real `PAYPAL_CLIENT_SECRET` value in tracked / untracked / history | ✅ not found |
| Real `OPENAI_API_KEY` value (`sk-…`, 164 chars) in tracked / untracked / history | ✅ not found |
| History: `sk-` tokens | ✅ 0 files |
| History: `OPS_COPILOT_KEY=<value>` | ✅ 0 files |
| History: private-key blocks | ✅ 0 (only doc mentions of the *string* in `SPRINT_A1_6/8_REPORT.md`) |
| `PAYPAL_CLIENT_SECRET=` occurrences | ✅ placeholders only — `README.md`, `apps/backend/.env.example`, `.env.render.example`, `DEPLOYMENT.md` |

Working-tree hits reported by the raw scanner were all **benign config values** (`NODE_ENV`, `CORS_ORIGIN`, `PAYPAL_RETURN_URL`, `PAYPAL_CANCEL_URL`) that legitimately appear in docs/examples — not secrets.

**Additional release gate:** targeted Jest run over the changed areas — **7 suites / 106 tests passed**:
`catalog`, `health`, `web-storefront`, `p0-claims`, `policy-preview`, `ops-route`, `ops-agent`.
(Pre-existing, out-of-scope: `tests/unit/environment.test.ts` fails when a real `.env` is present, because its explicit `PAYPAL_RETURN_URL`/`PAYPAL_CANCEL_URL` override the test's `RENDER_EXTERNAL_URL`. Not touched.)

---

## Step 3 — Logical commits + push — ✅ DONE

Push was a clean **fast-forward** (local 7 ahead / 0 behind `origin/fix/render-deployment`); no force, no history rewrite.

| # | SHA | Commit | Files |
|---|---|---|---|
| 1 | `2e28e9c` | `feat(storefront): policy preview endpoint + expanded 25-item catalog` | `public/app.js`, `public/index.html`, `public/dashboard.html`, `src/routes/policy-preview.ts`*, `tests/integration/policy-preview.test.ts`*, `src/catalog/data.json`, `tests/unit/catalog.test.ts`, `tests/integration/web-storefront.test.ts`, `tests/integration/health.test.ts`, `src/app.ts` |
| 2 | `4b85c74` | `feat(ops): read-only Ops Copilot agent, route and PayPal agent-toolkit deps` | `public/ops-copilot.js`*, `src/ops/config.ts`*, `src/ops/ops-agent.ts`*, `src/ops/ops-tools.ts`*, `src/routes/ops.ts`*, `tests/integration/ops-route.test.ts`*, `tests/unit/ops-agent.test.ts`*, `package.json`, `package-lock.json`, `tests/verification/p0-claims.test.ts` |
| 3 | `b7abb52` | `test(e2e): authenticated session + deterministic EUR 13 cart in sandbox driver` | `scripts/e2e-sandbox-flow.ts` |
| 4 | `0729aec` | `docs: deployment/env guides, demo script and security remediation report` | `README.md`, `apps/backend/README.md`, `SUBMISSION.md`, `.env.example`, `.env.render.example`, `DEMO_VIDEO_SCRIPT.md`*, `SECURITY_REMEDIATION_REPORT.md`* |
| 5 | `56c1c6c` | `fix(flutter): release-safe base URL resolution + capture-state provider hygiene` | `apps/flutter_app/lib/services/api_service.dart`, `lib/providers/checkout_provider.dart` |
| 6 | `d9f928a` | `chore(evidence): security audit artifacts + verification evidence` | `npm-audit-full.json`*, `security-remediation/**`* (6), `evidence/**`* (4) |

`*` = newly added. 41 files total. Working tree is clean afterwards; only ignored files remain (`.env`, `dist/`, `node_modules/`, `.dart_tool/`, …).

Note: `src/app.ts` registers **both** `policy-preview` and `ops` routes and lives in commit 1, so commit 1 alone does not compile in isolation; commit 2 completes it. The tree is green from commit 2 onward.

---

## Step 4 — Post-deploy verification — ⏳ PENDING (awaiting owner deploy)

**Owner action:** deploy `fix/render-deployment` @ `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb` on Render (`paypal-commerce-agent-backend`), then send the live URL.

Once live:
1. `GET https://paypal-commerce-agent-backend.onrender.com/api/health` → assert `buildCommit === d9f928a6e1318039e9f1ffd6c6c60329e4a936cb` and `environment === "production"`, `paypal.environment === "sandbox"`.
2. **Warm-up:** free plan sleeps after ~15 min idle — first request may take 30–60 s. Warm up before smoke checks.
3. Smoke: `GET /api/catalog` (25 products), storefront `GET /`, `POST /api/sessions`, policy BLOCK path.

## Step 5 — Webhook registration + delivery — ⏳ PENDING (needs live URL)

1. `npm run register-webhook https://paypal-commerce-agent-backend.onrender.com/api/webhooks/paypal` (sandbox credentials).
2. Report the returned webhook id to the owner → set it as `PAYPAL_WEBHOOK_ID` in Render env vars.
3. Confirm a delivered `PAYMENT.CAPTURE.COMPLETED` shows **signature verified** and a duplicate is **ignored** in the Render logs.

---

## Open items / risks
- **Free-plan cold start** — expect first-request latency; warm up before demo.
- **Flutter release build** must pass the host explicitly:
  `flutter build apk --release --dart-define=API_BASE_URL=https://paypal-commerce-agent-backend.onrender.com`
  (release builds reject non-HTTPS/absent URLs by design).
- `flutter analyze` / `flutter test` remain **NOT RUN** in this environment (Dart VM cannot spawn child processes — `process_win.cc:744`).
- `tests/unit/environment.test.ts` failure is pre-existing and out of scope (see Step 2).

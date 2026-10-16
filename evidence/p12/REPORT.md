# TASK P12 — Dead Gemini default, resilient model choice, stale docs, AG Grid warnings

- **Live URL:** https://paypal-commerce-agent.onrender.com
- **Branch:** `fix/render-deployment` (GitHub default branch)
- **Local HEAD at verification time:** `57ca495` (live service deployed `9eaca56` — see §3)
- **Date:** 2026-10-16
- **Secrets:** none printed or committed. Provider keys live only in `apps/backend/.env` (git-ignored)
  and in the host's env panel. `ai:check` prints provider names, public model ids, statuses and
  latencies only — never keys, base URLs, or upstream bodies.
- **Scope:** AI provider layer + checker + tests + docs + dashboard rendering. **No**
  policy/orders/capture/webhook/ops code was touched.

---

## 1. The dead Gemini default (root cause)

`gemini-2.5-flash` was shut down on **2026-10-16**; the provider answers **HTTP 404**
("model is no longer available"). The code shipped `defaultModel: 'gemini-2.5-flash'`, so any
deployment that did not set `GEMINI_MODEL` would 404 on every Gemini attempt.

**Fix — per-provider model lists.** `*_MODEL` now accepts a comma-separated list (first = preferred):

| Provider | Default model list | Env override |
|---|---|---|
| gemini | `gemini-3.6-flash,gemini-3.5-flash` | `GEMINI_MODEL` |
| groq | `openai/gpt-oss-120b,llama-3.3-70b-versatile` | `GROQ_MODEL` |
| cerebras | `llama-3.3-70b` | `CEREBRAS_MODEL` |
| openrouter | `meta-llama/llama-3.3-70b-instruct:free` | `OPENROUTER_MODEL` |
| openai | `gpt-4o-mini` | `OPENAI_MODEL` |

Routing rules (all previous rules kept):

| Upstream result | Action |
|---|---|
| **404** (model retired/unknown) | skip **that model** for the process lifetime → try the next model of the **same** provider first |
| **all models of a provider 404** | disable that **provider** for the process lifetime |
| 429 / 5xx / timeout / network | cooldown the provider (Retry-After, else 60 s) → next provider |
| 400 / 401 / 403 | disable the provider for the process lifetime → next provider |
| empty / malformed tool-call response | cooldown → next provider |
| every provider exhausted | `AppError(503, …, {code:'AI_UNAVAILABLE'})` |

Also fixed while here: the real SDK completer built the request from `provider.model` instead of the
model **currently being tried**, which would have defeated the new model fallback. It now uses
`params.model` (guarded by a test).

`src/ai/providers.ts` gains pure, secret-free helpers: `parseModelList`, `providerModels`,
`providerModelKey`; `classifyProviderError` now classifies **404 as `model_not_found`**
(`disable:false`, `modelNotFound:true`) instead of a provider-level disable.

## 2. `ai:check` now reports model ids and the model actually used

`scripts/ai-provider-check.ts` prints, per provider: the `GET /models` status, the **public** model
ids matching `/flash|gpt-oss|llama|mini/i`, the PASS/FAIL of a full `AI_TOOLS` tool round trip and
of the injection probe, the latency, and **which configured model was actually used**. Models are
tried in order and a 404 moves on to the next one, mirroring the runtime client.

## 3. Verification results

### `npx tsc --noEmit` — **PASS** (exit 0)

### `npx jest --runInBand --silent` — **PASS: 26 suites, 347 tests**

347 = 335 (P10) + 12 new. New coverage in `tests/unit/ai-client.test.ts`:

- model-list fallback: a 404 on the first model falls through to the next model of the same provider;
- a retired model is skipped for the process lifetime (never retried);
- a provider is disabled **only** when all of its models 404;
- a transient 429 on a model is **provider-level** (the next model is not tried; the next provider is);
- all models 404 across every provider → 503 `AI_UNAVAILABLE`;
- the completer receives the per-attempt model (regression guard);
- config parsing: `parseModelList` split/trim/dedupe, `providerModels` fallback, comma-list `*_MODEL`,
  the new gemini/groq defaults (and that `gemini-2.5-flash` is gone);
- `classifyProviderError`: 404 → `modelNotFound` (not a disable); 400/401/403 → provider disable.

### ⚠️ Two pre-existing tests were failing for an environment reason (not this change)

`tests/integration/ai.test.ts` ("11th request returns 429") and
`tests/verification/p0-claims.test.ts` (2b) failed at first. Cause: the developer's local
`apps/backend/.env` sets **`AI_CHAT_PER_IP_PER_MIN=4`** and **`AI_CHAT_GLOBAL_PER_MIN=10`** (a stricter
local ceiling for manual quota protection). `dotenv` loads `.env` in tests, so the rate-limit tests
saw a 4/min IP ceiling and failed at the 5th request. Proof: re-running with the documented defaults
forced into the shell env made the file pass 9/9.

**Fix:** `tests/setup.ts` now pins `AI_CHAT_PER_SESSION_PER_MIN=10`, `AI_CHAT_PER_IP_PER_MIN=30`,
`AI_CHAT_GLOBAL_PER_MIN=120`. `setupFiles` run before module imports and `dotenv` never overrides an
existing `process.env` value, so the suite is now hermetic — a developer's local `.env` can no longer
change test expectations. **No assertion was weakened**; the ceilings are pinned at their documented
defaults, which is exactly what the tests assert. `.env` itself was left untouched.

### `npm run ai:check` — **PASS (2/2 active providers)**

Run 1 — default env (`.env` overrides `GEMINI_MODEL=gemini-3.5-flash`):

| Provider | /models | tool-RTT | injection | latency | model used |
|---|---|---|---|---|---|
| gemini | PASS 200 | PASS | PASS | 6261 ms | `gemini-3.5-flash` |
| groq | PASS 200 | PASS | PASS | 1733 ms | `openai/gpt-oss-120b` |

Run 2 — **default list exercised** (`GEMINI_MODEL=''` → falls back to the code default):

| Provider | configured | tool-RTT | injection | model used |
|---|---|---|---|---|
| gemini | `gemini-3.6-flash, gemini-3.5-flash` | PASS | PASS | **`gemini-3.6-flash`** |
| groq | `openai/gpt-oss-120b, llama-3.3-70b-versatile` | PASS | PASS | `openai/gpt-oss-120b` |

→ Both documented replacement models are live-valid.

Run 3 — **live 404 fallback proof** (`GEMINI_MODEL='gemini-2.5-flash,gemini-3.5-flash'`):

| Provider | configured | tool-RTT | injection | model used |
|---|---|---|---|---|
| gemini | `gemini-2.5-flash, gemini-3.5-flash` | **PASS** | PASS | **`gemini-3.5-flash`** |

→ The retired model 404'd and the chain transparently fell through to the next model of the **same**
provider and completed the full tool round trip. This is the P12 feature working live.

Public `/models` ids observed (no secrets): gemini returns `models/gemini-2.5-flash`,
`models/gemini-flash-latest`, … — note that `/models` **still lists** `gemini-2.5-flash` even though
chat completions 404 on it, which is precisely why the ids list alone is not sufficient and the
tool round trip matters.

### Headless dashboard — **PASS: zero console warnings and zero errors**

Local run (`npm run build` first so the server serves the fresh `dist/public`, then `npm start`,
headless Chromium via Playwright):

```
P12_DASH = {
  "status": 200,
  "gridPresent": true,
  "ordersGridRendered": true, "eventsGridRendered": true,
  "ordersHeaders": ["Order ID","Created","Origin","Status","Items","Total","Currency"],
  "consoleErrors": [], "consoleWarnings": [], "pageErrors": [],
  "zeroWarnings": true
}
```

Fixes in `public/dashboard.js`:

1. Removed the invalid `colDef` property **`enablePinning`** from `defaultColDef`.
2. AG Grid error **#48** (an object-valued column without a `valueFormatter`): the `Violations`
   column (`field: 'violatedRules'`, an array) now has a `valueFormatter` (in addition to its
   `cellRenderer`). Sorting/filtering/CSV export now get a primitive string.

→ The 3 non-blocking AG Grid warnings recorded in `evidence/p11/REPORT.md` are **gone**.

Screenshots: `dashboard-1280.png`, `dashboard-390.png`.

CSP unchanged (`script-src 'self' https://cdn.jsdelivr.net` with a per-response nonce; dashboard
logic stays in same-origin `/*.js`, `textContent` only). Dashboard integration tests stay green.

### Live re-verification after the Render redeploy — **PASS**

`GET /api/health` (live):

```json
{"status":"ok","buildCommit":"9eaca56d560ac86391e1da5effc085eb2ad8e311","environment":"production",
 "paypal":{"enabled":true,"environment":"sandbox"},
 "ai":{"enabled":true,"providers":["groq"]}}
```

- **`buildCommit` = `9eaca56`** — the P12 functional commit (AI provider layer + dashboard fix +
  docs + tests). It is the commit that contains every P12 behaviour change, so the live service runs
  the reviewed code. *(The follow-up `57ca495` is a README wording-only commit; it had not finished
  deploying when this check ran.)*
- **Live dashboard (`/dashboard.html`), headless Chromium, 1280 px and 390 px:**

```json
{"status":200,"gridPresent":true,"ordersGridRendered":true,"eventsGridRendered":true,
 "consoleErrors":[],"consoleWarnings":[],"pageErrors":[],"zeroWarnings":true}
```

→ **Zero console warnings and zero errors live.** The `enablePinning` warning and AG Grid error #48
are gone in production, not just locally.
- Live `ai.providers` is `["groq"]` — the Render environment sets `GROQ_API_KEY` (no Gemini key), so
  the chain routes to Groq. The retired-Gemini default therefore never hit *this* deployment, but it
  would have hit any deployment that sets `GEMINI_API_KEY` without `GEMINI_MODEL` — which is exactly
  what the per-provider model list fixes.

## 4. Docs corrected (no "Primary OpenAI" claim anywhere)

The default order is **gemini, groq, cerebras, openrouter, openai** — OpenAI is **optional and last**.
A free Groq or Gemini key is enough. Removed the "Primary OpenAI" wording and aligned every surface:

| File | What changed |
|---|---|
| `README.md` | "Why this matters" step 1; Requirements; Android `.env` snippet; "Try it in your browser" block; Tools table; "Explore without keys"; **new "AI provider setup" section** (env var names, where to get free keys, never commit keys) |
| `README.md` | every quick start is now consistent: `git clone … && cd paypal-commerce-agent/apps/backend` |
| `apps/backend/SUBMISSION.md` | short description, judges step 2, "backend must be configured with…", tools bullet, Devpost draft, Prototype limitations |
| `apps/backend/ARCHITECTURE.md` | Technical Summary line |
| `apps/backend/.env.example` | gemini/groq default model lists; note that `*_MODEL` is a comma-separated list; `gemini-2.5-flash` retired note |
| `docs/devpost-testing-instructions.md` *(git-ignored)* | section 5 now has the real commands: `git clone` → `cd paypal-commerce-agent/apps/backend` → `npm install` → `Copy-Item .env.example .env` → set **one** free AI key → `npm run dev`; `<BUYER_EMAIL>`/`<BUYER_PASSWORD>` placeholders kept |

`SUBMISSION.md` → **PROVEN LIVE** now also carries the P11 live-AI evidence **honestly**: 4 of 8 chat
calls returned 200 with correct carts, produced carts matched their `/api/policy/preview` totals
(€20.00 → `REQUIRE_CONFIRMATION`, €6.90 → `AUTO_ALLOW`), the injection prompt was refused, and rapid
back-to-back calls on the free tiers returned 503 `AI_UNAVAILABLE` (designed graceful degradation)
before recovering. The **YouTube** and **Team** TODOs remain visible.

## 5. Commits

1. `fix(ai): per-provider model lists + 404 model fallback` — `src/ai/providers.ts`, `src/ai/client.ts`
2. `test(ai): model-list fallback coverage; ai:check model ids` — `scripts/ai-provider-check.ts`,
   `tests/unit/ai-client.test.ts`, `tests/setup.ts`
3. `docs+fix(dashboard): provider-agnostic docs; silence AG Grid warnings; P12 evidence` —
   `README.md`, `apps/backend/SUBMISSION.md`, `apps/backend/ARCHITECTURE.md`,
   `apps/backend/.env.example`, `apps/backend/public/dashboard.js`, `evidence/p12/*` — `9eaca56`
4. `docs: state that the Validate block runs from the repository root` — `README.md` — `57ca495`
   (wording only; every clone-based quick start already used
   `cd paypal-commerce-agent/apps/backend`)

Pushed fast-forward to `origin/fix/render-deployment` (`eb6185f..57ca495`). Unrelated untracked files
(`evidence/g1-sandbox-e2e/REPORT_run2.md`, `evidence/p3-deploy/REPORT.md`) were left untouched.

> `docs/devpost-testing-instructions.md` is git-ignored by design and is therefore not in any commit.

## 6. Two things worth flagging

1. **The local `apps/backend/.env` broke the test suite, not the code.** It sets
   `AI_CHAT_PER_IP_PER_MIN=4` / `AI_CHAT_GLOBAL_PER_MIN=10`. That is a legitimate local setting for
   manual quota protection, but `dotenv` loads `.env` during tests, so it silently changed the limits
   the rate-limit tests assert. `tests/setup.ts` now pins the three ceilings at their documented
   defaults; `.env` itself was **not** modified. If you want the stricter ceilings to apply to your
   manual runs, keep them in `.env` — the test suite is now immune to them.
2. **The retired model is still listed by `GET /models`.** Gemini's `/models` endpoint still returns
   `models/gemini-2.5-flash` even though chat completions 404 on it. Listing the ids is therefore a
   diagnostic aid, not proof a model works — which is why `ai:check` performs the real tool round trip.

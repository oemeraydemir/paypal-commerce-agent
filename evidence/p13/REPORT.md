# TASK P13 — Live-verify the Ops Copilot, fix remaining doc inaccuracies, prepare the release

**Result: PASS** (local 12/12 checks, live 12/12 checks; two honest caveats reported below).
No secret was printed, logged or committed. No payment, refund or any other write call was made.
No deploy command was run.

Scope actually exercised under the stated authorization: docs edits, local commits, fast-forward push,
**read-only** PayPal sandbox calls (local + live, via the Ops Copilot and one direct read-only toolkit
probe), AI calls (≈15 of the allowed 20), release commands **printed but not run**.

---

## 1. LOCAL — Ops Copilot with `OPS_COPILOT_ENABLED=true`

`OPS_COPILOT_ENABLED` was flipped to `true` in `apps/backend/.env` and a fresh 32-character
`OPS_COPILOT_KEY` was generated into the same file (the placeholder was empty). The key is read from
`.env` by the test scripts and sent only in the `X-Ops-Key` header; it is never echoed. `.env` is
git-ignored (`apps/backend/.gitignore:4`), so nothing was committed. (Later in the session the key
lines were normalised to the value the live demo accepts — see §8; the local checks below ran before
that and are unaffected, because the key is only the gate.)

Server: `npm run build && npm start` (the built `dist/src/server.js`), `PAYPAL_ENABLED=true`,
`PAYPAL_ENV=sandbox`, AI keys present. `GET /api/ops/status` → `enabled: true`.

### `POST /api/ops/ask` — five questions (raw data: `local-ask.json`)

| # | Question | HTTP | Latency | `toolsUsed` (name / source / ok) | Answer (truncated) |
|---|----------|------|---------|----------------------------------|--------------------|
| a | Which payments were blocked today and why? | **200** | 16 091 ms | `get_policy_audit`/internal/true, `get_policy_audit`/internal/true, `list_transactions`/paypal/true, `get_policy_summary`/internal/true | ⚠️ "I reached my step limit before I could finish." (`steps: 4`) |
| b | List my recent PayPal transactions | **200** | 3 565 ms | `list_transactions`/paypal/true | Reports the sandbox 403 verbatim (see §2) |
| c | Summarise orders by origin | **200** | 1 048 ms | `list_internal_orders`/internal/true | "no AI Café orders … zero records" |
| d | Refund my last order | **200** | 839 ms | *(none — 0 tool calls)* | "I'm a read-only analyst, so I can't … issue refunds." |
| e | Pay order X | **200** | 1 157 ms | *(none — 0 tool calls)* | "I'm a read-only analyst, so I can't create or capture any payments." |

**(d) and (e) never reached PayPal:** `toolsUsed` is empty, no `source: "paypal"` entry exists, and the
toolkit is configured with read permissions only, so no write tool is even advertised. The refusal is
produced by the model from the system prompt — the write tools do not exist in the request.

⚠️ Honest caveat for (a): the copilot burned its whole 4-step budget (`get_policy_audit` twice,
`list_transactions`, `get_policy_summary`) and returned the step-limit message instead of a summary.
The API answered 200 and every tool call is recorded, but the *answer* is not a summary. On the live
demo the same question answered correctly with a single tool call (§3).

### Authentication and rate limiting (raw data: `local-auth.json`) — **7/7 PASS**

| Probe | Expected | Got | Latency | Notes |
|---|---|---|---|---|
| no `X-Ops-Key` header | 401 | **401** | 172 ms | `{"error":"A valid X-Ops-Key header is required."}` |
| wrong key (28 chars) | 401 | **401** | 13 ms | same body; compared in constant time (`timingSafeEqual` over SHA-256) |
| hits 3–6 (valid key, invalid question) | 400 | **400** | 6–7 ms | `question must be a string of 3 to 500 characters`; the limiter counts *before* validation and *before* auth |
| 7th hit within one minute | 429 | **429** | 4 ms | `Retry-After: 60`, `{"error":"Too many Ops Copilot requests; try again shortly."}` |

The 401/400 probes consume limiter slots on purpose (key guessing is throttled too), which is how the
7th call inside the window is provably rejected.

---

## 2. The masked PayPal read error (not hidden)

A direct read-only probe (`p13-paypal-read-probe.cjs`, same `PAYPAL_READ_ONLY_PERMISSIONS` as
`src/ops/ops-tools.ts`, sandbox context) captured the exact upstream payloads:

- Toolkit with the read-only configuration advertises **exactly 8 tools** — the same 8 as the
  allow-list — and **zero** write-looking tools (`create*`, `pay*`, `capture*`, `cancel*`, `refund*`,
  `send*`, `update*`, `delete*`).
- `list_transactions` → **exact masked error**:

  ```json
  {"ok":false,"status":403,"code":"PAYPAL_API_HTTP_ERROR","message":"Authorization failed due to insufficient permissions.: Authorization failed due to insufficient permissions."}
  ```

  The copilot surfaces this verbatim to the user: *"the sandbox API returned a 'Authorization failed
  due to insufficient permissions' error"*. This is a **PayPal app-permission limitation** on the
  sandbox REST app (Transaction Search/Reporting is not enabled for it) — not a code defect, and not
  something the copilot hides.
- `list_invoices` → `{}` (no invoices on the account). `list_disputes` → `{"items":[], ...}` (empty).

---

## 3. LIVE — the deployed demo (`https://paypal-commerce-agent.onrender.com`)

The owner set `OPS_COPILOT_ENABLED=true` and the same `OPS_COPILOT_KEY` on Render and redeployed.

- `GET /api/health` → `buildCommit: 718ba401d515fdfbabe96cd3ebac1546de219d6a` (= the reviewed commit
  `718ba40`), `paypal.enabled: true`, `environment: sandbox`, `ai.enabled: true`,
  `ai.providers: ["groq"]`.
- `GET /api/ops/status` → **`enabled: true`** (the previous smoke run recorded `false`), `readOnly: true`,
  8 read-only PayPal tools, 3 internal tools.

### `POST /api/ops/ask` — same five questions (raw data: `live-ask.json`)

| # | Question | First run | Retries | Final | Final `toolsUsed` | PayPal writes |
|---|----------|-----------|---------|-------|-------------------|---------------|
| a | Which payments were blocked today and why? | **200** (9 968 ms) | — | **200** | `get_policy_audit`/internal/true | 0 |
| b | List my recent PayPal transactions | **200** (1 906 ms) | — | **200** | `list_transactions`/paypal/true | 0 |
| c | Summarise orders by origin | 502 (542 ms) | 200 (975 ms) | **200** | `list_internal_orders`/internal/true | 0 |
| d | Refund my last order | 502 (73 ms) | 200 (1 189 ms) | **200** | `list_internal_orders`/internal/true | 0 |
| e | Pay order X | 502 (42 ms) | 502 (80 ms), 200 (1 028 ms) | **200** | *(none — 0 tool calls)* | 0 |

- **Live (d) and (e) refused with zero tool calls** — the read-only guarantee holds on the deployed
  demo exactly as it does locally.
- Live (a) answered properly: *"No payments were blocked today. The policy-audit log shows zero BLOCK
  events for the current day."*
- Live (b) reported the same 403 as §2, quoted to the user.
- The three 502s are the **free Groq tier's rate limit**: the first failure of a burst cools the only
  configured provider down for ~60 s, so the next calls fail *instantly* (42–80 ms) without a network
  call, and succeed on retry after the cooldown. Reported as-is, not hidden — see §6, finding F1.

### Authentication and rate limiting, live (raw data: `live-auth.json`) — **7/7 PASS**

| Probe | Expected | Got | Latency |
|---|---|---|---|
| no key | 401 | **401** | 290 ms |
| wrong key | 401 | **401** | 48 ms |
| hits 3–6 (valid key, invalid question) | 400 | **400** | 43–48 ms |
| 7th hit within a minute | 429 | **429** | 45 ms, `Retry-After: 60` |

---

## 4. Docs corrected

| File | Change |
|------|--------|
| `README.md` | Ops paragraph: "spends OpenAI credits" → **"spends AI-provider quota"**. New **"Which providers are verified live"** paragraph: **Gemini and Groq verified live**, **Cerebras / OpenRouter / OpenAI supported but not verified** (also mirrored in *Requirements*). |
| `README.md` | **Android-steps numbering fixed** — see §5. |
| `apps/backend/.env.example` | AI block: verified-live vs untested providers; Ops block: "AI-provider quota". |
| `apps/backend/.env.render.example` | Same two corrections. |
| `apps/backend/render.yaml` | Declares `OPS_COPILOT_ENABLED` and `OPS_COPILOT_KEY` as `sync:false` (names only, no secret). |
| `apps/backend/src/ops/config.ts` | Comment only: "spend OpenAI credits" → "spend AI-provider quota". No logic, no allow-list, no route behaviour touched. |
| `apps/backend/SUBMISSION.md` | Ops Copilot bullet now says it is **enabled on the live demo** and how judges get the key; smoke item 7 annotated as predating the change; new "judges can try" step 6 (ask the copilot, then ask for a refund); **new PROVEN LIVE entry** for the live Ops Copilot with the 403 caveat. |
| `docs/devpost-testing-instructions.md` *(git-ignored by design)* | §4 rewritten to match the real live setting: enabled, key shared privately and pasted into the dashboard's *Ops access key* box, 6 req/min per IP, 401 without a key, the two refusal examples, and the `list_transactions` 403 limitation. |

---

## 5. The Android-steps numbering (root cause found and fixed)

The owner reported the README's *"Configure and run on Android emulator"* list rendering as
`1, 2, 3, 1, 2`. The source was already `1..5` with no gap or duplicate, and GitHub's own renderer
(`POST /api/github/markdown`) produced **one `<ol>` with 5 items**. The difference is the
**indentation of the continuation blocks**: with a **3-space** indent (aligned to `1. `) the list
survives in CommonMark engines but is split by non-strict parsers. Measured with three engines:

| Continuation indent | marked | markdown-it | showdown |
|---|---|---|---|
| 3 spaces (before) | 1 list × 5 | 1 list × 5 | **5 lists × 1 item** ← the restart |
| **4 spaces (after)** | **1 list × 5** | **1 list × 5** | **1 list × 5** |

Fix: every code fence and continuation paragraph of that section is now indented by **4 spaces**
(34 lines, whitespace only). Re-verified after the change: marked / markdown-it / showdown all report a
single 5-item ordered list, and GitHub's renderer returns **1 `<ol>`, 5 items, no `start` attribute** —
i.e. a continuous, sequential 1, 2, 3, 4, 5 in every renderer tested.

---

## 6. Findings (honest, not fixed — outside the authorized scope)

- **F1 — the Ops route reports provider exhaustion as `502`, not `503`.** `src/routes/ops.ts` wraps
  *any* failure of `runOpsCopilot` in `AppError(502, 'Ops Copilot could not complete the request; try
  again.')`. When the only configured provider is cooling down (free-tier 429), the chat route returns
  the designed `503 AI_UNAVAILABLE` while the Ops route returns `502`. Observed live: 3 of 15 live
  probes, all recovering on retry after the ~60 s cooldown. **Not changed** — P13 authorizes docs,
  commits and read calls, not route behaviour changes.
- **F2 — `list_transactions` is 403 on this sandbox app.** Reported in §2 and in the judge
  instructions. Fixable only in the PayPal Developer Dashboard (enable Transaction Search for the
  sandbox REST app), not in code.
- **F3 — local (a) exhausted the 4-step budget** and answered with the step-limit message. Live (a)
  answered correctly. A narrower question (or a larger `MAX_STEPS`) would avoid it; behaviour is
  bounded and honest, so it was left alone.
- **F4 — free-tier AI capacity is the real bottleneck** for a live demo: one provider
  (`ai.providers: ["groq"]`) is configured on Render. Adding `GEMINI_API_KEY` on Render would give the
  fallback chain a second lane.

---

## 7. Release preparation (commands printed, **not run**)

Run in **PowerShell** from the repository root (`C:\Projects\FinCan\paypal-commerce-agent`), after this
P13 commit is pushed. `HEAD` below means the final P13 commit on `fix/render-deployment`.

```powershell
# ---- 1. Create `main` from the current HEAD (same commit; no merge, no history rewrite) ----
cd C:\Projects\FinCan\paypal-commerce-agent
git status                      # expect: only the two pre-existing untracked evidence files
git switch -c main              # create `main` at the current HEAD (fix/render-deployment)
git push -u origin main         # publish it

# ---- 2. Tag the release ----
git tag -a v1.0 -m "AI Cafe v1.0 - hackathon submission (agentic commerce, human-authorized PayPal sandbox checkout)"
git push origin v1.0
git tag -l                      # expect: v1.0

# ---- 3. Rebuild the release APK against the live backend ----
cd C:\Projects\FinCan\paypal-commerce-agent\apps\flutter_app
flutter pub get
flutter build apk --release --dart-define=API_BASE_URL=https://paypal-commerce-agent.onrender.com
# Output: C:\Projects\FinCan\paypal-commerce-agent\apps\flutter_app\build\app\outputs\flutter-apk\app-release.apk
```

### Render settings to change (dashboard → the `paypal-commerce-agent-backend` service)

| Setting | Value / action | Why |
|---|---|---|
| `OPS_COPILOT_ENABLED` | `true` | Already set by the owner for P13; the live checks above ran against it. |
| `OPS_COPILOT_KEY` | the same 32-char value as `apps/backend/.env` | Already set; rotate and re-share if it ever leaks. |
| `GROQ_API_KEY` | present | The only configured provider today (`ai.providers: ["groq"]`). |
| `GEMINI_API_KEY` | **add** (free key) | Finding F4: gives the fallback chain a second lane so one rate-limited provider cannot stall a demo. |
| `OPENAI_API_KEY` | verify or remove | P5 found the Render value invalid/expired; leave it unset unless a working key is provided. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` | present | Sandbox only. |
| Branch to deploy | `main` (after step 1) | Today it deploys `fix/render-deployment`; switch only if you want `main` to be production. |
| Health check path | `/api/health` | Already set; the API checks `buildCommit` to prove which revision is live. |

---

## 8. Budget and evidence

- **AI calls used: ≈15 of the allowed 20** (local 5 questions ≈ 9 completions; live 5 questions + 4
  retries ≈ 6). Local `ai:check` was *not* re-run in P13 to stay inside the budget; the P12 results
  (Gemini + Groq PASS) still stand.
- `npx tsc --noEmit -p tsconfig.json` → **PASS (exit 0)**.
- `npx jest --runInBand` → **PASS: 26 suites, 347 tests** (run with the new `.env`, i.e. with the
  copilot enabled — no test needed changing).
- Raw artifacts (no keys, verified by grep for `OPS_COPILOT_KEY` / `x-ops-key` / `sk-` / `Bearer` → 0
  hits): `evidence/p13/local-ask.json`, `local-auth.json`, `live-ask.json`, `live-auth.json`.
- Secrets: `OPS_COPILOT_KEY` lives only in `apps/backend/.env` (git-ignored) and in the Render
  environment. A temporary `.env.p13.bak` created before editing was removed; nothing secret was
  written to the repo or to any log.
- **Key consistency checked and repaired.** During the session `.env` ended up with **two**
  `OPS_COPILOT_KEY` lines holding **different** values (the generated one, and the owner's). Verified
  without printing either value: the **live demo accepts the first line's value and rejects the second**
  (probed with an invalid question so a valid key answers `400` and a wrong key `401` — no AI call
  spent). The two lines were then normalised to the value the live demo accepts, and a fresh local
  start was re-probed: both lines now answer `400` locally. So the documented rule — *the key in `.env`
  is the key Render has* — now holds; the duplicate line can be deleted at any time.

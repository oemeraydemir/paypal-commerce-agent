# Phase 1 — Preserve & Inspect: Baseline Report

Generated: 2026-10-14 (local, GMT+2)  
Repo: C:/Projects/FinCan/paypal-commerce-agent  
Backend: apps/backend

## 1. Git state (before any change)

- `git rev-parse HEAD` = `6695076f3f8e55742dae8dcf4b16b3fdce0141c3` (matches user-reported `6695076`).
- Branch: `fix/render-deployment`.
- `git stash list` = empty (no stashes).
- Working tree already has pre-existing modifications (NOT touched by this task):
  - Modified: README.md, apps/backend/.env.example, .env.render.example, README.md, SUBMISSION.md,  
    package-lock.json, package.json, public/app.js, public/dashboard.html, public/index.html,  
    src/app.ts, src/catalog/data.json, tests/integration/health.test.ts,  
    tests/integration/web-storefront.test.ts, tests/unit/catalog.test.ts, tests/verification/p0-claims.test.ts
  - Untracked: apps/backend/DEMO_VIDEO_SCRIPT.md, npm-audit-full.json, public/ops-copilot.js,  
    src/ops/, src/routes/ops.ts, src/routes/policy-preview.ts,  
    tests/integration/ops-route.test.ts, tests/integration/policy-preview.test.ts,  
    tests/unit/ops-agent.test.ts
- This remediation only edits `apps/backend/package.json` (adds `overrides`) and regenerates  
  `package-lock.json`. No other tracked/untracked files are modified, no reset/stash/clean/delete.

## 2. Verified dependency versions (backend package.json + transitive)

Direct prod deps of interest:

- `@paypal/agent-toolkit`: ^1.11.0  (resolved 1.11.0, pins @langchain/core EXACTLY 0.3.6; ai ^4.0.23; mathjs ^14.0.1)
- `uuid`: ^9.0.1 (root)
- openai, @paypal/paypal-server-sdk, express, helmet, cors, dotenv, morgan, zod, fast-json-stable-stringify

Transitive vulnerable packages (paths traced via `npm ls`):

```
@paypal/agent-toolkit@1.11.0
├─ @langchain/core@0.3.6
│   ├─ langsmith@0.1.68  (range ^0.1.56)  → uuid@10.0.0
│   └─ uuid@10.0.0
├─ ai@4.3.19  (pins jsondiffpatch EXACTLY 0.6.0; @ai-sdk/provider-utils 2.2.8; @ai-sdk/react 1.2.12; @ai-sdk/ui-utils 1.2.11)
│   └─ jsondiffpatch@0.6.0  (NOT imported by ai dist)
└─ mathjs@14.9.1
root uuid@9.0.1
```

## 3. Baseline vulnerability counts (re-verified, not assumed)

- `npm audit`             : **46** (3 low, 7 moderate, 36 high)
- `npm audit --omit=dev`  : **10** (3 low, 2 moderate, 5 high)  
  Matches user-provided baseline exactly.

### Production (--omit=dev) = 10

- LOW (3): @ai-sdk/provider-utils, @ai-sdk/react, @ai-sdk/ui-utils
- MODERATE (2): ai, uuid
- HIGH (5): @paypal/agent-toolkit (aggregator), @langchain/core, jsondiffpatch, langsmith, mathjs

### Full = 46 (the extra 36 are dev-only Jest/braces/ts-node-dev chain)

## 4. Advisory research (patched versions & compatibility)

| Package                | Installed | Advisory                                                                                             | Patched                                                            | Fixable within toolkit pin?                                             |
| ---------------------- | --------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| @langchain/core        | 0.3.6     | GHSA-r399-636x-v7f6 (HIGH, CVE-2025-68665)                                                           | **0.3.80** (backport in 0.3.x; also 1.1.8)                         | ✅ override to 0.3.80 (same major 0.3)                                   |
| jsondiffpatch          | 0.6.0     | GHSA-j4fx-xxwh-2485 (HIGH, CVE-2026-8657) + GHSA-33vc-wfww-vjfv (XSS)                                | **0.7.6**                                                          | ✅ override to 0.7.6 (not imported anywhere)                             |
| mathjs                 | 14.9.1    | GHSA-29qv-4j9f-fjw5 (HIGH, CVE-2026-40897)                                                           | **15.2.0 only** (no 14.x backport; "no workaround without 15.2.0") | ❌ blocked (major bump breaks `^14.0.1`)                                 |
| langsmith              | 0.1.68    | GHSA-3644-q5cj-c5c7 (HIGH) + GHSA-fw9q-39r9-c252 (proto pollution) + GHSA-rr7j-v2q5-chgv (redaction) | **0.6.0** (npm)                                                    | ❌ blocked (0.6.0 outside @langchain/core's `^0.1.56`; major bump)       |
| ai                     | 4.3.19    | GHSA-rwvc-j5jr-mgvh (filetype whitelist, LOW)                                                        | >5.0.206                                                           | ❌ blocked (major bump breaks `^4.0.23`)                                 |
| @ai-sdk/provider-utils | 2.2.8     | GHSA-866g-f22w-33x8 (LOW, CVE-2026-8769)                                                             | **3.0.28** (no 2.x patch listed)                                   | ❌ blocked (major bump)                                                  |
| uuid                   | 9/10      | GHSA-w5hq-g745-h8pq (MOD, CVE-2026-41907)                                                            | 11.1.1 / 12.0.1 / 13.0.1                                           | ❌ blocked (major bump; root ^9, lc ^10)                                 |
| dev: braces            | 3.0.2-ish | GHSA-vfj7-8cjw-p6xm (HIGH)                                                                           | 3.0.3                                                              | ✅ override within ^3                                                    |
| dev: micromatch        | 4.0.x     | via braces                                                                                           | 4.0.8                                                              | ✅ override within ^4                                                    |
| dev: sprintf-js        | 1.0.x     | GHSA-hp3w-g68c-fv3c (MOD)                                                                            | 1.1.3                                                              | ✅ override within ^1 (cascades to argparse/js-yaml/@istanbuljs/@jest/*) |

## 5. Decision (Phase 2 design)

Apply NARROW, compatibility-proven overrides (no major upgrades, no toolkit downgrade, no jest 30):

- PROD: `@langchain/core` -> 0.3.80, `jsondiffpatch` -> 0.7.6
- DEV:  `braces` -> 3.0.3, `micromatch` -> 4.0.8, `sprintf-js` -> 1.1.3  
  Blocked (documented, not forced): mathjs, langsmith, ai, @ai-sdk/*, uuid — all require major bumps  
  that would break @paypal/agent-toolkit 1.11.0's pinned ranges.

## 6. Baseline test command record

From apps/backend:

- `npm ci`
- `npx jest --runInBand --silent`
- `npx tsc --noEmit`
- `npm audit --omit=dev`
- `npm audit`  
  User-reported prior result: 318/318 Jest passed; tsc passed. (Will re-verify on THIS env pre-change.)


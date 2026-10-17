# TASK P1b — Real local sandbox E2E (run 2) — ABORTED at preflight

**Repo:** `C:\Projects\FinCan\paypal-commerce-agent`
**Branch:** `fix/render-deployment`
**HEAD at start:** `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb` (== remote tip)
**Date:** 2026-10-15
**Result:** ❌ **ABORTED at Step 1** — credentials in `apps/backend/.env` are still placeholders.

> Run 1 is preserved in `evidence/g1-sandbox-e2e/REPORT.md`. This is a separate run-2 record.
> No secret values or tokens are printed anywhere below (masked / shape-only).

---

## Step 1 — Preflight — ❌ FAIL

### Git state
| Check | Result |
|---|---|
| `git status --porcelain` | only `?? evidence/p3-deploy/` (untracked, expected) — tracked tree clean |
| `git rev-parse HEAD` | `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb` |
| Remote tip `origin/fix/render-deployment` | `d9f928a6e1318039e9f1ffd6c6c60329e4a936cb` (in sync) |

### `.env` credential SHAPE (values never printed)
Only one env file exists in the repo: `apps/backend/.env` (mtime `2026-10-15 11:47`).

| Key | Length | Verdict |
|---|---|---|
| `PAYPAL_ENABLED` | 4 | present |
| `PAYPAL_ENV` | 7 (`sandbox`) | ok |
| `PAYPAL_CLIENT_ID` | **37** | ❌ **placeholder** — email-shaped (`…@…example…`) |
| `PAYPAL_CLIENT_SECRET` | **8** | ❌ **FAILS `>= 60` rule** (8 chars, junk `x]x;?x&x` shape) |
| `OPENAI_API_KEY` | 164 | present (not used — `E2E_SKIP_AI=1`) |
| `PAYPAL_WEBHOOK_ID` | 0 | empty (expected for now) |

**Shape gate: FAIL** (`client secret >= 60 chars` violated; placeholder marker matched on the client id).

### PayPal sandbox OAuth verification (Node `fetch`, status only)
```
POST https://api-m.sandbox.paypal.com/v1/oauth2/token   (Basic auth, grant_type=client_credentials)
HTTP status: 401
error: invalid_client
error_description: Client Authentication failed
token present in response: false
```
**OAuth gate: FAIL.**

---

## Action taken
Per the task rule *"If not 200 → STOP and tell the owner"*:

- ❌ **STOPPED.** Did **not** start the backend (Step 2).
- ❌ Did **not** run the e2e driver (Step 3) — **no PayPal order created**, so no "replacement order" risk.
- ❌ No OpenAI calls made at any point.
- ❌ Steps 4–7 not attempted (storefront, negative checks, test fix, commit/push).
- ✅ No secrets/tokens printed; ids masked.
- ✅ No untracked files deleted; no force-push; working tree otherwise untouched.

## What is needed to proceed
Place the **real PayPal sandbox REST app** credentials into `apps/backend/.env`:

- `PAYPAL_CLIENT_ID` — sandbox REST app client id (a long alphanumeric string, **not** email-shaped).
- `PAYPAL_CLIENT_SECRET` — sandbox REST app secret, **≥ 60 characters** (real ones are ~80 alnum chars).
- `PAYPAL_ENV=sandbox`, `PAYPAL_ENABLED=true` (already set).

> Likely cause: the edit landed in a **different copy** of the repo, or the file was not saved. The only `.env` under this checkout is `apps/backend/.env` and it still holds the old placeholder values. If credentials were written elsewhere, tell me the path — or re-save them here and I will re-run from Step 1.

## Side note (P2 Flutter blocker — resolved by owner)
Owner ran on their machine: `flutter test` → **38 passed** (exit 0); `flutter analyze` → **No issues found** (exit 0); `dart format` clean. The earlier P2 "Dart VM cannot spawn child processes" blocker was environment-specific to the agent sandbox, not the project. Flutter hygiene is therefore **verified green**.

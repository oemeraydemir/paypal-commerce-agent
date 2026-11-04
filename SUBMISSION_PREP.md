# AI Café — Submission Prep Pack (NOT committed, local reference)

Prepared 2026-11-04. This file lives outside the repo intentionally: it contains the private
testing-instructions text for Devpost, which the checklist says must **never** go into the public repo.

## 0. Confirmed state (2026-11-04)

- GitHub repo `oemeraydemir/paypal-commerce-agent` cleaned and force-pushed to a fresh single commit
  **`778428f`** on `main`. 950 files, top-level tree clean (no `.env`, no zips, no logs, no `node_modules`,
  no `_owner`/`audit` junk).
- `LICENSE` (MIT), `README.md`, `SPONSOR_INTEGRATION.md`, `docs/`, `openapi.json`, `postman/`,
  `apimatic/`, `render.yaml`, `sdks/`, `source/`, `tools/` all present. `ci.yml` + `apimatic-sdk.yml` workflows present.
- Live demo (free-tier, may sleep): **https://paypal-commerce-agent.onrender.com** — wake with `GET /api/health` (takes ~60 s).

## 1. Remaining checklist status

| Item | Status | Who |
|---|---|---|
| Repo clean + public + MIT license | DONE | me |
| CI workflows present | DONE | me |
| Devpost description/tools draft | DONE (`docs/DEVPOST_DRAFT.md`) | me |
| Set GitHub About description + topics | PENDING | you (GitHub UI) |
| Render redeploy of current source (confirm order→201) | PENDING | you (Render dashboard) |
| Live E2E sandbox run + paste result into `docs/PAYMENT_E2E.md` | PENDING | you (needs sandbox buyer login) |
| Refund approval from dashboard (sandbox) | PENDING | you |
| Split Bill → SETTLED (only if shown in video) | PENDING | you |
| Record + upload video (< 2:50) → YouTube | PENDING | together |
| Fill Devpost form + private testing instructions | PENDING | you (text ready below) |

## 2. Devpost — private "testing instructions" field (paste this block)

> Set up a free sandbox:
> 1. In the PayPal Developer dashboard create a Sandbox app and copy `Client ID` / `Secret`.
> 2. Create a **personal (buyer)** sandbox account (these login credentials are what you use at the approval step).
> 3. Set env on Render: `PAYPAL_ENABLED=true`, `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
>    `PAYPAL_WEBHOOK_ID`, `PAYPAL_RETURN_URL`, `PAYPAL_CANCEL_URL`, `MANDATE_SIGNING_KEY`, `PUBLIC_BASE_URL`,
>    `DATABASE_URL`, and one of `GEMINI_API_KEY` / `GROQ_API_KEY`, plus `OPS_COPILOT_ENABLED=true` with `OPS_COPILOT_KEY`.
> 4. Wake the app: `curl https://paypal-commerce-agent.onrender.com/api/health` until it answers
>    (`paypal.enabled: true`, `paypal.environment: "sandbox"`).
> 5. Run the end-to-end check: `npm run e2e:sandbox -- https://paypal-commerce-agent.onrender.com`. It prints a PayPal
>    approval URL — open it, log in with the **sandbox buyer** account, approve, and the script waits for order `PAID`.
> 6. For a refund: open `/dashboard.html`, use the merchant key, propose a partial refund for that order, then
>    **Approve & refund**; confirm in the refund queue and in the PayPal sandbox dashboard.

## 3. Devpost — other fields

- **Title / one-liner**: *AI Café — AI prepares the order, users control spending, PayPal completes the payment.*
- **Description & tools**: paste from `docs/DEVPOST_DRAFT.md` (already copy-ready; replace only `[YOUTUBE LINK]`
  and `[TEAM NAME]`).
- **Repo link**: `https://github.com/oemeraydemir/paypal-commerce-agent`
- **Demo URL**: `https://paypal-commerce-agent.onrender.com`
- **Video**: `< 3 min`, public on YouTube.

## 4. Video — runbook (follow `DEMO_VIDEO_SCRIPT.md`)

- Surface: **desktop browser** (web storefront + AG Grid dashboard) at the hosted URL or localhost.
  Use the Flutter app only if you re-ran `flutter test` (163/163) on your machine.
- Order: storefront+chat → policy verdict + server prices → "Why these items?" + unverified allergy note →
  PayPal sandbox approval (human) → merchant AG Grid dashboard + refund queue → Cart Mandate + MCP (no pay tool) → wrap.
- Keep every claim matched to code; never say "allergen-free"; never say "verified PayPal integration" beyond what the
  live E2E run proves; never show live money, secrets, or `.env`.
- If AI answers "at capacity": say the rule-based fallback took over and continue — the payment steps are identical.
- Keep it under **2:50**.

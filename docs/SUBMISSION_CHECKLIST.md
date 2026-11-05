# Submission checklist (Devpost, deadline 12 Nov 2026, 21:00 GMT+1)

Order matters: do the top block first, because everything below depends on it.

## 1. Make the repository complete and public
- [ ] `git status` is clean: everything in `source/`, `docs/`, `openapi.json` is committed and pushed (judges only see what is on the remote).
- [ ] Repository is **public**; `LICENSE` (MIT) shows in the About box; description and topics are set.
- [ ] CI is green on the pushed commit (backend, real-PostgreSQL smoke, Flutter).

## 2. Prove it runs
- [ ] Deployed to Render from that commit; wait for `GET /api/health` (free tier needs about a minute).
- [ ] `PAYPAL_ENABLED=true` with **sandbox** credentials, `MANDATE_SIGNING_KEY`, `PUBLIC_BASE_URL`, `DATABASE_URL`, `OPS_COPILOT_KEY`, and one of `GEMINI_API_KEY` / `GROQ_API_KEY` are set on Render.

### 2a. Render environment — verified 2026-11-04 (all required vars present)
Confirmed on the Render dashboard (values masked, never shared). Every key the code needs in production is present:
- **PayPal:** `PAYPAL_ENABLED`, `PAYPAL_ENV` (sandbox), `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_RETURN_URL`, `PAYPAL_CANCEL_URL`.
- **AI:** `AI_PROVIDER_ORDER`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` (Gemini + Groq are the verified-live fallback chain).
- **Ops Copilot / merchant:** `OPS_COPILOT_ENABLED`, `OPS_COPILOT_KEY`, `DASHBOARD_PUBLIC`.
- **Durable storage:** `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `REQUIRE_PERSISTENCE`.
- **Mandate signing:** `MANDATE_SIGNING_KEY` (required in production; the server refuses to boot without it).
- **Discovery/URLs:** `PUBLIC_BASE_URL`, `CORS_ORIGIN`.
- **Channel3:** `CHANNEL3_API_KEY`.
- `APIMatic_API_Key` is present but **not read by runtime code** — it is the GitHub Actions *repository secret* for the manual SDK-generation workflow (`apimatic-sdk.yml`); harmless at runtime, keep it out of the app env if you prefer.
- Not set (all optional, safe defaults apply): `CEREBRAS_API_KEY`, `AUTOMATION_*`, `MANDATE_PREVIOUS_PUBLIC_KEYS`, `OPS_COPILOT_PER_IP_PER_MIN`, `TRUST_PROXY_HOPS`, `SESSION_*`, `PICKUP_*`.
- [ ] `npm run e2e:sandbox -- <render-url>` run once; result pasted into `docs/PAYMENT_E2E.md` with the date.
- [ ] Refund approved from the dashboard against the sandbox payment (cheapest real evidence of the refund path).
- [ ] Split Bill with two sandbox buyers until it shows SETTLED (only claim it in the video if you saw it).

## 3. Video (under 3 minutes, public on YouTube)
- [ ] Follows `DEMO_VIDEO_SCRIPT.md`; shows the app running; no third-party logos or copyrighted music.
- [ ] Shows the mandate card (limit, cart, remaining, per-person split, refunded so far) and the Agent timeline.
- [ ] Nothing in the video says "allergen-safe", "verified PayPal integration" beyond what step 2 proved, or that Flutter enforces the guard.

## 4. Devpost form
- [ ] Description from `docs/DEVPOST_DRAFT.md` with `[YOUTUBE LINK]` and `[TEAM NAME]` replaced.
- [ ] Tools used: PayPal Orders/Refunds/Webhooks (sandbox), the AI provider you actually ran, AG Grid, Render, PostgreSQL.
- [ ] Repo link, demo URL, and testing instructions (sandbox buyer login goes only in the private testing-instructions field, never in the repo).

Status of each verification layer: `docs/KNOWN_LIMITATIONS.md`.

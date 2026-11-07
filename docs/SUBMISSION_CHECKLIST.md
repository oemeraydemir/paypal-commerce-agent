# Submission checklist (Devpost, deadline 12 Nov 2026, 21:00 GMT+1)

Order matters: do the top block first, because everything below depends on it.
Status refreshed **2026-11-07**. The video is already uploaded (`https://youtu.be/X2y7Iw5WNhE`) but is **Private**; only publishing it as Public with metadata, plus the form submission, remain for the account owner. Full field-by-field audit: [DEVPOST_ANSWER_AUDIT.md](./DEVPOST_ANSWER_AUDIT.md).

## 1. Make the repository complete and public

- [x] Everything in `source/`, `docs/`, `openapi.json`, `DEMO_VIDEO_SCRIPT.md` is committed and pushed (judges only see what is on the remote). Confirm with `git status` and `git log -1` after the final push: HEAD must match `origin/main`. Backend re-measured 2026-11-07 after the Split Bill cancellation fix: 141 suites / 1361 tests pass (289 s), `tsc --noEmit` clean.
- [x] Repository is **public** (`private: false`), `LICENSE` (MIT) shows in the About box; description, homepage and 18 topics are set. Spam issue #1 closed; 0 open issues. A `hackathon-submission` release exists.
- [x] README has the submission summary, a two-minute no-keys quick start, a Tools-used table, an explicit "How AI and PayPal are used" section and ten screenshots captured from the live deployment.
- [ ] CI is green on the pushed commit (backend, real-PostgreSQL smoke, Flutter) — verify in the Actions tab.

## 2. Prove it runs

- [x] Deployed to Render; `GET /api/health` verified 2026-11-07: `status: ok`, `buildCommit: 987af54`, `paypal.environment: sandbox`, `paypal.enabled: true`, `storage: postgres / durable`, `mandates.keyPersistence: configured`, `ai.enabled: true` with `groq` + `gemini`.
- [x] `PAYPAL_ENABLED=true` with **sandbox** credentials, `MANDATE_SIGNING_KEY`, `PUBLIC_BASE_URL`, `DATABASE_URL`, `OPS_COPILOT_KEY`, and one of `GEMINI_API_KEY` / `GROQ_API_KEY` are set on Render (dashboard audit below).
- [x] Live order-creation smoke on 2026-11-07: fresh session → `PUT /api/wellbeing/preferences` → `POST /api/orders/create` returns **201 PAYMENT_PENDING** with a real PayPal Sandbox `approvalUrl`.
- [ ] `npm run e2e:sandbox -- <render-url>` run once on the current build; result pasted into `docs/PAYMENT_E2E.md` with the date. (Order creation is verified; full buyer approval → capture is not re-run on this build.)
- [ ] Refund approved from the dashboard against a sandbox payment (cheapest real evidence of the refund path).
- [ ] Split Bill with two sandbox buyers until it shows SETTLED (only claim it in the video if you saw it — the video says "with friends" and quotes no number).

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

## 3. Video (under 3 minutes, public on YouTube)

- [x] Final video produced: `AICafe_Final.mp4`, **2:52.17**, split-screen web + Flutter, English narration in nine beat-aligned blocks, no third-party music or footage. Follows [DEMO_VIDEO_SCRIPT.md](../DEMO_VIDEO_SCRIPT.md) and shows the app actually running. The PayPal Sandbox screen is the sponsor's own checkout, not a third-party advertisement.
- [x] Nothing in the video says "allergen-safe", "verified PayPal integration" beyond what step 2 proved, or that Flutter enforces the guard. Allergy language is always "unverified"; the split-bill narration quotes no number; "e-invoice" is the app's own UI label.
- [x] The "For cafés" control center and the human-approved refund queue are shown and narrated.
- [ ] Confirm the mandate card (limit, cart, remaining, per-person split, refunded so far) and the Agent timeline are legible in the final encode before publishing.
- [ ] Uploaded at **https://youtu.be/X2y7Iw5WNhE** but **Private** (`AICafe`, empty description). Set `Sichtbarkeit` = **Öffentlich / Public** — the official rules require a *"publicly visible"* video, so Unlisted is not enough. Paste title, description, chapters and tags from [DEVPOST_DRAFT.md](./DEVPOST_DRAFT.md#7-youtube-upload-copy--paste), upload `Video_Kit/youtube_thumbnail.jpg`, set "not made for children", no paid promotion, **AI use = Yes**, language English, category Science & Technology, allow embedding. Then verify playback in a signed-out browser.

## 4. Devpost form

- [x] Description, one-liner, tools list, built-with list and private testing instructions written and fact-checked: [DEVPOST_DRAFT.md](./DEVPOST_DRAFT.md). Every paste block is plain text with no table markup.
- [x] Repo link, hosted demo URL and testing instructions prepared. Sandbox buyer credentials go only in the private testing-instructions field, never in the repo.
- [ ] Replace `[TEAM NAME]`, use `https://youtu.be/X2y7Iw5WNhE` for the video link, mark the sponsor tools **AG Grid, Render, Postman, APIMatic and Channel3** (not Bryntum/Elastic/Astropods/KERNEL/Zapier), fill the declaration fields yourself (country, consents, submitter type, PayPal rating, feedback, learning level, AI-value-for-career), paste sections 1–7 into the form, and submit before the deadline.
- [ ] Warm the Render service shortly before judging starts.

Status of each verification layer: `docs/KNOWN_LIMITATIONS.md`.

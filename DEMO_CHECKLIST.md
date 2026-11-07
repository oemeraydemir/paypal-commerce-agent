# AI Café — Demo Checklist

Use this to confirm the live demo and the recorded video cover the right things **before** you submit.  
This is a companion to [DEMO\_VIDEO\_SCRIPT.md](./DEMO_VIDEO_SCRIPT.md): the script is the shot order, this  
list is the pass/fail gate.

## Environment

- [ ] Local recording: start with `npm run demo` (public dashboard view, free port, ops key printed). Plain `npm run dev` keeps the dashboard private (503 until `OPS_COPILOT_KEY` is set).
- [ ] Backend boots with `npm run dev` and `GET /api/health` reports `storage` mode and the PayPal environment (sandbox).
- [ ] `PAYPAL_ENABLED=true` with **sandbox** credentials; never live.
- [ ] Deployment warmed before judging (free tier sleeps).
- [ ] No secrets in screen recordings (blur/omit `.env`, dashboard keys).

## Must-show flows (each maps to a judging criterion)

- [ ] Intent → cart: shopper types a goal + budget; agent returns items.
- [ ] Server-owned truth: prices and policy verdict shown from the server, not the model.
- [ ] Human-in-the-loop payment: PayPal **sandbox** approval by a person.
- [ ] Merchant side: AG Grid dashboard (sort/filter/pin/CSV), refund queue.
- [ ] Purchase impact: the allowance card shows limit, cart, remaining, the per-person amounts if split in 2 or 3, and (after a refund) what was refunded.
- [ ] Agent Control Center: the Agent timeline lists what the AI did, what policy decided and where money moved.
- [ ] Audit: Cart Mandate (`/api/orders/:id/mandate`) + MCP server with **no pay tool**.
- [ ] Flutter: Coco avatar, "Why these items?" explanation, allergy warning labelled **unverified**.

## Honesty gates (do not ship if any fail)

- [ ] No statement claims an item is **allergen-free** or **safe**.
- [ ] Allergen preferences are sent as **guidance only**: they prefer/flag items but are never filtered hard server-side, never declared safe, and always labelled unverified. Dietary preferences (vegan/vegetarian/gluten-free) ARE used server-side in catalog discovery, and the UI never claims a match is a safety guarantee.
- [ ] No live-money PayPal flow shown; sandbox only.
- [ ] Test counts quoted match `docs/EVIDENCE.md` and keep the historical/re-measured distinction. Current backend run (re-measured **2026-11-07**, after the Split Bill cancellation fix): **141 suites / 1361 tests pass** (289 s). Six stale expectations were updated for the intentional gluten-free labels and Groq model change, and ten regression tests were added for the owner-abandon path; `tsc --noEmit` clean. `flutter analyze` clean (widget tests blocked in sandbox; owner-machine run 163/163).
- [ ] Links in `README.md`, `docs/JUDGING.md`, `docs/DETAILS.md` resolve (no broken demo-checklist/arch links).

## Open items before submitting (carried over from the jury self-review)

- [ ] Warm the Render service shortly before judging starts (free tier needs about a minute) and say so in the testing instructions.
- [x] Repository: About description, website and 18 topics set via the GitHub API; MIT license visible in the About box. Spam issue #1 closed. README now has a submission summary, a Tools-used table, an explicit "How AI and PayPal are used" section and ten live-deployment screenshots.
- [x] APIMatic: SDK generated from `openapi.json` (TypeScript + Python, committed under `sdks/`); portal config is in `apimatic/`. Generated locally via the APIMatic CLI; nothing has been uploaded to the APIMatic cloud portal.
- [ ] Postman (optional): add requests for the three mandate endpoints, then update every quoted newman count together.
- [x] Render: redeployed the current source (verified 2026-11-07: `/api/health` reports `buildCommit: 987af54`, `paypal: sandbox`, durable PostgreSQL; a fresh session + wellbeing preferences + `POST /api/orders/create` answers **201** with a real Sandbox approval URL). `MANDATE_SIGNING_KEY` and `PUBLIC_BASE_URL` are set in production.
- [ ] Local demo: confirm `http://localhost:3000/api/health` returns JSON (another project's server can occupy port 3000); otherwise start the backend on another port and set `BASE`.
- [ ] Real-AI evidence: run `npm run ai:check` with the provider shown in the video and name that provider in the video.
- [ ] If the video shows the Flutter app: `flutter test` was 163/163 on 2026-10-27; re-run it after any change and update `docs/PLATFORM_STATUS.md`.
- [x] Final demo video produced (2026-11-07): `AICafe_Final.mp4`, 2:52.17, split-screen web + Flutter, English narration in nine beat-aligned blocks, no third-party music or footage. Shot order and exact narration: [DEMO_VIDEO_SCRIPT.md](./DEMO_VIDEO_SCRIPT.md).
- [x] Devpost form copy written and fact-checked against the video and the live deployment: [docs/DEVPOST_DRAFT.md](./docs/DEVPOST_DRAFT.md). Includes the project name, description, tools list, built-with list, private testing instructions and the YouTube title/description/tags.
- [ ] The video is uploaded at https://youtu.be/X2y7Iw5WNhE but is **Private** with a placeholder title. Set it to **Public** (official rule: *"publicly visible"* — Unlisted is not enough), add the title/description/chapters/tags/thumbnail and the AI-use disclosure from [docs/DEVPOST_DRAFT.md](./docs/DEVPOST_DRAFT.md), replace `[TEAM NAME]`, and submit. This can only be done by the account owner.

## Packaging note

This file and `DEMO_VIDEO_SCRIPT.md` live at the repository root and are part of the submission package. They are linked from `docs/JUDGING.md`.

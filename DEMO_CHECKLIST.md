# AI Café — Demo Checklist

Use this to confirm the live demo and the recorded video cover the right things **before** you submit.  
This is a companion to [DEMO\_VIDEO\_SCRIPT.md](./DEMO_VIDEO_SCRIPT.md): the script is the shot order, this  
list is the pass/fail gate.

## Environment

- [ ] Backend boots with `npm run dev` and `GET /api/health` reports `storage` mode and the PayPal environment (sandbox).
- [ ] `PAYPAL_ENABLED=true` with **sandbox** credentials; never live.
- [ ] Deployment warmed before judging (free tier sleeps).
- [ ] No secrets in screen recordings (blur/omit `.env`, dashboard keys).

## Must-show flows (each maps to a judging criterion)

- [ ] Intent → cart: shopper types a goal + budget; agent returns items.
- [ ] Server-owned truth: prices and policy verdict shown from the server, not the model.
- [ ] Human-in-the-loop payment: PayPal **sandbox** approval by a person.
- [ ] Merchant side: AG Grid dashboard (sort/filter/pin/CSV), refund queue.
- [ ] Audit: Cart Mandate (`/api/orders/:id/mandate`) + MCP server with **no pay tool**.
- [ ] Flutter: Coco avatar, "Why these items?" explanation, allergy warning labelled **unverified**.

## Honesty gates (do not ship if any fail)

- [ ] No statement claims an item is **allergen-free** or **safe**.
- [ ] No claim that Flutter allergen preferences are filtered **server-side** (they are stored locally).
- [ ] No live-money PayPal flow shown; sandbox only.
- [ ] Test counts quoted match `docs/EVIDENCE.md` and keep the historical/re-measured distinction.
- [ ] Links in `README.md`, `docs/JUDGING.md`, `docs/DETAILS.md` resolve (no broken demo-checklist/arch links).

## Open items before submitting (carried over from the jury self-review)

- [ ] Warm the Render service shortly before judging starts (free tier needs about a minute) and say so in the testing instructions.
- [ ] Repository: set the About description and topics on GitHub; keep the license visible in the About box.
- [ ] APIMatic: generate an SDK from `openapi.json` and link it. Claim that prize only if you did.
- [ ] Postman (optional): add requests for the three mandate endpoints, then update every quoted newman count together.
- [ ] Render: **redeploy the current source** (the deployed app was found one version behind: order creation answered 200 instead of 201), then check `/api/health` and that order creation answers 201; `MANDATE_SIGNING_KEY` and `PUBLIC_BASE_URL` must be set in production.
- [ ] Local demo: confirm `http://localhost:3000/api/health` returns JSON (another project's server can occupy port 3000); otherwise start the backend on another port and set `BASE`.
- [ ] Real-AI evidence: run `npm run ai:check` with the provider shown in the video and name that provider in the video.
- [ ] If the video shows the Flutter app: `flutter test` was 118/118 on 2026-10-26; re-run it after any change and update `docs/PLATFORM_STATUS.md`.
- [ ] YouTube video link and team name are filled in on the Devpost form.

## Packaging note

This file and `DEMO_VIDEO_SCRIPT.md` live at the repository root and are part of the submission package. They are linked from `docs/JUDGING.md`.

# AI Café — Devpost submission copy (final)

Copy-friendly text for the **PayPal AI Hackathon** form (deadline 12 Nov 2026, 21:00 GMT+1).
Every `PASTE` block is plain text with no table markup, so it can be selected and pasted straight
into Devpost. All text is English. Claims are limited to what the repository and the live deployment
actually do; anything not re-verified on the current build is marked as such below.

**Status re-verified 2026-11-08:** the video at `https://youtu.be/X2y7Iw5WNhE` is now **Public**
(`playabilityStatus: OK`, `isPrivate: false`, `isUnlisted: false`, oEmbed 200) and is 2:52 long, so the
official *"publicly visible"* requirement is met. Its metadata is **still the placeholder set** —
title `AICafe`, a 193-character description, no chapters, and YouTube's auto frame grab instead of the
custom cover. Section 8 lists the exact remaining YouTube Studio edits. The form field `[TEAM NAME]`
and all personal declarations are still yours to fill. See also
[DEVPOST_ANSWER_AUDIT.md](./DEVPOST_ANSWER_AUDIT.md) for the field-by-field audit of the Claude.ai draft.

**Name decision:** use `AI Café — The AI prepares, you approve, PayPal pays` everywhere (form, YouTube
title, thumbnail, README). The Claude.ai alternative `AI Café: Agentic Commerce You Can Trust (PayPal + AI)`
is also valid and measured 53/60 characters, but mixing the two would look careless. If you prefer that
one, change it in the form, in the YouTube title and in section 1 here together.

---

## 1. Project name — PASTE

```
AI Café — The AI prepares, you approve, PayPal pays
```

## 2. One-liner / tagline — PASTE

```
A trust-first agentic commerce platform for cafés: AI prepares the order, the server fixes prices and enforces policy, and only a human can approve the payment with PayPal.
```

## 3. Full description — PASTE

```
AI Café is a working prototype of agentic commerce with a hard boundary: an AI agent can prepare an order, but it can never move money.

THE PROBLEM
Ordering "a lunch for around 12 euros" from a café means juggling a menu, dietary notes, a budget and a checkout. An agent that can talk to you is useful; an agent that can spend your money, or quietly ignore an allergy note, is not something people will trust. We built the boundary into the architecture instead of asking users to trust the model.

HOW IT WORKS
1. Shop by intent. On web or in the Flutter app, the shopper describes a goal and a budget. A tool-calling AI barista (Google Gemini by default, with Groq, OpenRouter, Cerebras and OpenAI in an automatic fallback chain) searches the real catalog and proposes a cart. It only receives catalog and cart tools: no payment tool exists anywhere in the system. If no model is reachable, a clearly labelled rule-based planner takes over instead of pretending to be AI.
2. The server owns the truth. Prices, totals, the per-purchase limit, the approval threshold and the daily budget are computed and enforced on the backend. The client never sets a price and never enforces a limit. The policy verdict (AUTO_ALLOW, REQUIRE_CONFIRMATION or BLOCK) is visible in the UI.
3. Wellbeing stays honest. The shopper saves dietary preferences and allergen notes once, on web and mobile. The wellbeing panel checks the cart against those notes and always labels them unverified. We never claim a dish is safe or allergen-free. Dietary preferences guide catalog discovery; allergen notes are guidance only.
4. The human pays. Checkout creates a PayPal Orders API v2 order in the Sandbox and returns an approval URL. The buyer logs in with a PayPal Sandbox personal test account and approves. No card is typed and no real money moves. Capture is signature-verified by webhook and protected with idempotency keys.
5. Everything is auditable. Each paid order produces an itemised e-invoice with a QR-coded, Ed25519-signed Cart Mandate: a tamper-evident record of what the AI proposed, what the server priced, what policy decided and who held payment authority. Anyone can scan and verify it. The agent discovery manifest, an MCP server at /api/mcp and a Postman collection make the same read-only boundary available to external agents: they can search, prepare a cart and start checkout, never pay.
6. The café stays in control. The "For cafés" page and the merchant dashboard show a live AG Grid order board, policy events and a refund queue. A read-only Ops Copilot built on the PayPal Agent Toolkit can inspect an order and PROPOSE a refund. Only an authenticated merchant clicking "Approve & refund" calls PayPal. Refunds use write-ahead state, crash recovery and capture-total reconciliation.

ONE BACKEND, TWO CLIENTS
A vanilla-JavaScript web storefront and a Flutter Android/iOS app share the same API, the same server-owned prices, the same policy and the same approval flow. The submitted 2:52 video shows both side by side.

WHY THIS IS DEFENSIBLE
The workflow is deliberately split: the AI proposes, the server fixes prices and enforces policy, the human authorises in PayPal, and the merchant approves any refund. No code path lets the model approve a capture or a refund. Helmet CSP without unsafe-inline scripts, single-origin CORS, request-size limits, error redaction, webhook signature checks and a session-token model back that up, with a large automated test suite.

TRY IT
Hosted demo: https://paypal-commerce-agent.onrender.com (free tier, allow about 60 seconds for the first load). Public repository: https://github.com/oemeraydemir/paypal-commerce-agent, MIT licensed, with a two-minute no-keys quick start in the README. Full judging map, evidence and known limitations are in docs/.

HONEST SCOPE
PayPal Sandbox only; live money cannot be configured. One deployment serves one merchant; there is no multi-tenancy. The "e-invoice" is an itemised order record, not a tax invoice, and makes no VAT claims. The Cart Mandate is our own signed audit format, not AP2 or an official PayPal Agent Ready integration.
```

## 4. Tools used — PASTE

Devpost asks which tools, models or AI services were used **and how**. This is the honest inventory.

```
PayPal Orders API v2 and Payments Refunds API (Sandbox only) — creates the order, returns the human approval URL, captures after buyer approval and issues merchant-approved refunds. Webhooks are signature-verified; live money cannot be configured.

PayPal Agent Toolkit — powers the read-only Ops Copilot. It inspects orders and proposes a refund; it can never execute one.

Google Gemini (primary AI model), with Groq, OpenRouter, Cerebras and OpenAI as an automatic fallback chain — the tool-calling AI barista turns a natural-language goal and budget into a proposed cart. It only receives catalog and cart tools; no payment tool exists. Without a key, a labelled rule-based planner runs instead.

Model Context Protocol (MCP) — /api/mcp lets external agents search the menu, prepare a cart, check policy and start checkout, but never pay.

AG Grid Community — merchant order board with sorting, filtering, pinning and CSV export, plus the human-approved refund queue.

Render — hosts the single Node.js web service (API plus static web demo) on the free tier.

PostgreSQL — durable orders, sessions, refunds, reservations and idempotency keys; without it the app runs in memory and says so.

APIMatic — TypeScript and Python SDKs generated locally from openapi.json and committed under sdks/. Nothing is uploaded to the APIMatic cloud portal.

Postman — request collection for the API, including the three mandate verification endpoints.

Channel3 — powers the read-only "Take it home" suggestions on the cart. Fixed category-derived queries return retailer offers that open on the retailer's own page; they are never added to the PayPal cart, never covered by an allowance and cannot be bought through this app.

Flutter — native Android/iOS shopper client using the same server-owned prices, policy and approval flow.

Node.js crypto / Ed25519 — signs the Cart Mandate and the automation event HMACs.

OBS, ffmpeg and ElevenLabs (demo production only) — capture the split-screen walkthrough and produce its English voiceover. Not part of the application runtime.
```

## 5. "Built with" short list — PASTE

```
TypeScript, Node.js, Express, vanilla JavaScript, Flutter and Dart, PostgreSQL, PayPal REST APIs (Sandbox), Google Gemini, AG Grid Community, MCP, OpenAPI 3, Postman, APIMatic, Channel3, Render
```

## 6. Testing instructions — PASTE in the **private** testing-instructions field

```
Live demo: https://paypal-commerce-agent.onrender.com
The Render free tier sleeps; allow about 60 seconds for the first request, then reload.
GET /api/health should report status ok, paypal.environment sandbox, durable PostgreSQL storage and ai.enabled true.

Quick path with no credentials:
1. Open the live URL. Browse the menu, open the AI barista tab, type a request such as "I want a lunch for around 12 euros", and review the proposed cart.
2. Open Profile and save a dietary preference and an allergen note. Watch the wellbeing panel label them unverified.
3. With items in the cart, open "Show take-home ideas" to see read-only Channel3 retailer suggestions. They are clearly labelled as not part of the café order and cannot be bought here.
4. Open "For cafés" for the merchant walkthrough, and /dashboard.html for the AG Grid order board and refund queue.

Full payment path (Sandbox only, no real money):
1. Use a PayPal Developer Sandbox PERSONAL (buyer) account. Credentials belong in this private field only and are never committed to the repository.
2. Add items to the cart, choose Checkout with PayPal, log in at the PayPal Sandbox approval page, approve, return to the store and press "Confirm and pay now".
3. After capture, open the receipt to scan the QR-coded signed Cart Mandate, then verify it at /api/mandates/verify.
4. In /dashboard.html, let the Ops Copilot propose a refund and click "Approve & refund" as the merchant. The AI can only propose.
5. Split Bill recovery (no money moves): add items, click "Split the bill", choose 2 people, open the split room, press "Pay my share with PayPal" and return to /split WITHOUT confirming. The organiser still sees "Cancel split bill and discard the started payment"; confirm it. The server asks PayPal for proof that nothing was captured, then cancels the order, releases its reservation and closes the bill. If a share was actually paid, the room explains that only a café-approved refund can undo it instead of hiding the control.

Run it locally (Node.js 20+, no keys needed for the basic demo):
git clone https://github.com/oemeraydemir/paypal-commerce-agent.git
cd paypal-commerce-agent/source/apps/backend
npm install
npm run demo
Then open http://localhost:3000. For the real Sandbox checkout, copy .env.example to .env and add Sandbox credentials as described in the README; never commit .env.

Repeatable end-to-end Sandbox payment and refund procedure: docs/PAYMENT_E2E.md.
```

## 7. YouTube upload copy — PASTE

Title:

```
AI Café — The AI prepares, you approve, PayPal pays | PayPal AI Hackathon
```

Description:

```
AI Café is a trust-first agentic commerce prototype for the PayPal AI Hackathon.

An AI barista turns a natural-language request and a budget into a proposed cart. The server fixes every price and enforces the spending policy. The AI has no payment tool: only a human can approve the payment in PayPal Sandbox, and only a merchant can approve a refund.

This 2:52 split-screen walkthrough shows the web storefront and the Flutter app on one backend, including the wellbeing guard, split bill, the QR-coded Ed25519-signed Cart Mandate, the read-only Ops Copilot, the human-approved refund queue and the "For cafés" control center.

Rule of the project: the AI proposes, the server prices, the human authorises, PayPal moves the money.

Live demo: https://paypal-commerce-agent.onrender.com
Public source (MIT): https://github.com/oemeraydemir/paypal-commerce-agent

PayPal Sandbox only. No real money, no live credentials. English narration generated with an AI voice (ElevenLabs); no third-party music or footage.

Chapters:
0:00 The problem and the rule
0:16 Who I am: dietary and allergen notes
0:31 Tell the barista what you want
0:45 Cart, wellbeing panel and split bill
1:03 Human approval in PayPal Sandbox
1:23 Paid: e-invoice and signed Cart Mandate
1:43 Ops Copilot proposes, merchant approves
2:07 For cafés: the owner's control center
2:35 One backend, web and Flutter
```

Tags:

```
PayPal, PayPal Sandbox, agentic commerce, AI agent, hackathon, Devpost, Flutter, Gemini, MCP, AG Grid, Channel3, fintech, human in the loop, Ed25519, Render
```

## 8. What still needs a human (blocking)

- [ ] `AICafe_Final.mp4` (2:52.17, under the 3-minute limit) is uploaded at **https://youtu.be/X2y7Iw5WNhE** and is **already Public** (verified signed-out on 2026-11-08: `playabilityStatus: OK`, oEmbed 200, 172 s). **Do not change the visibility.** What remains in YouTube Studio: replace the title `AICafe` with the section 7 title, replace the 193-character placeholder description with the section 7 description **including the chapters**, replace the 20 built-with keywords with the section 7 tag line, and upload `Video_Kit/youtube_thumbnail.jpg` (the live `hqdefault.jpg` is still YouTube's 480×360 auto frame grab). Then set "not made for children", no paid promotion, **AI use = Yes** (realistic AI narration), language English, category Science & Technology, and allow embedding; those six settings cannot be checked from outside Studio. Playback in a **signed-out** browser is already confirmed.
- [ ] Replace `[TEAM NAME]` with the real team name. A solo entry is fine.
- [ ] Paste sections 1–7 into the Devpost form and submit before 12 Nov 2026, 21:00 GMT+1.
- [ ] Warm the Render service shortly before judging (free tier).
- [ ] Re-run `flutter test` and the Postman/newman collection after the latest commits, then update any quoted counts.

## 9. Verified claims and honest caveats

Verified live on **2026-11-07** against `https://paypal-commerce-agent.onrender.com`:

- `GET /api/health` → `status: ok`, `buildCommit: 2261f2f…` (re-checked **2026-11-08**; earlier records saying `987af54` are historical), `paypal.environment: sandbox`, `paypal.enabled: true`, `storage: postgres / durable`, `mandates.keyPersistence: configured`, `ai.enabled: true` with providers `groq` and `gemini`, `channel3.enabled: true`.
- A fresh session followed by `PUT /api/wellbeing/preferences` and `POST /api/orders/create` returned **201 PAYMENT_PENDING** with a real PayPal Sandbox `approvalUrl`.
- **Split Bill owner-abandon path verified live on `2261f2f` (2026-11-08), no money moved:** a 2-person bill, one share's `POST /bills/:id/shares/:shareId/pay` → **201** with a real Sandbox `approvalUrl` (never approved/captured); default `POST /bills/:id/cancel` → **409** (fail closed); `POST .../cancel` with `{"abandonUncaptured":true}` → **200 CANCELLED**; `GET /bills/:id` → CANCELLED with zero shares still bound to an order; a second pay attempt → **409 Bill was cancelled**; a second cancel → idempotent **200**. Log `Video_Kit/live_split_cancel_check.log` (outside the repo).
- **YouTube video verified Public and signed-out playable (2026-11-08):** `https://youtu.be/X2y7Iw5WNhE`, 172 s, `isPrivate: false`, `isUnlisted: false`. Metadata is still the placeholder set.
- Repository is public, MIT licensed, with description, homepage, 18 topics, ten live-deployment screenshots in the README, and a `hackathon-submission` release. Zero open issues.
- Channel3 is live: `GET /api/health` reports `channel3.enabled: true`; a fresh-session `POST /api/discover/take-home` returned real retailer offers.

Current re-measured evidence:

- Backend: **141 suites / 1361 tests pass, re-measured 2026-11-07 on the current source** (289 s), PayPal and AI mocked; `tsc --noEmit` clean. Six stale expectations were updated for the intentional gluten-free catalog labels and the Groq tool-capable model defaults, and ten regression tests were added for the Split Bill owner-abandon path. No assertion was removed.

Other evidence with dates, do not present as current without re-running:
- Flutter: 163 tests pass and `flutter analyze` clean on the owner machine, 2026-10-27; re-run after the later commits.
- Postman: 58 requests / 73 assertions, measured 2026-10-25 before the settlement change; re-run.
- Full buyer-approval, capture and mandate verification end to end on the deployed app is documented in `docs/PAYMENT_E2E.md` (2026-10-27). Webhook replay and partial refund on the current build are not re-evidenced; the procedure is repeatable.
- Voice input uses the device on-device recognizer and produces an editable transcript; it is **not** verified in the submitted video and is not claimed there.

Caveats published with the entry:

- No item is ever described as allergen-free or safe; allergen notes are unverified guidance.
- The UI label "e-invoice" is an itemised order record, not a tax invoice; no VAT claims.
- The Cart Mandate is a custom signed audit record, not AP2 or an official PayPal Agent Ready / Store Sync integration.
- The Cart Mandate QR, product feed and discovery manifests are custom `aicafe.*` formats.
- `/api/orders` is a public read-only demo endpoint; single-instance deployment, no multi-tenancy.
- The two video panels were recorded in separate takes, so their beats are close but not frame-synchronised. See `DEMO_VIDEO_SCRIPT.md`.

## 10. Requirement checklist (hackathon rules)

- [x] Meaningfully integrates PayPal technology — Orders API v2, Refunds, webhooks, Agent Toolkit, all Sandbox.
- [x] Meaningfully incorporates AI — tool-calling barista with a multi-provider fallback chain and a labelled non-AI fallback.
- [x] Working prototype — hosted functional demo, verified creating a real Sandbox order (201) on 2026-11-07.
- [x] Sufficiently documented — README, judging map, evidence, known limitations, video script, screenshots, this submission copy.
- [x] Public code repository with a license (MIT) and clear setup/run instructions.
- [x] Video under 3 minutes — 2:52.17, English narration, no third-party music or footage.
- [x] Video is **Public** on YouTube (verified signed-out 2026-11-08) and linked on the form as https://youtu.be/X2y7Iw5WNhE. Remaining content work is the title/description/chapters/tags/thumbnail — see section 8.
- [x] Text description and tools list — sections 3 and 4 above.
- [ ] Team name filled in on the form.

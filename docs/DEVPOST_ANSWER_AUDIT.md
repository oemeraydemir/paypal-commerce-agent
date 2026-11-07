# Devpost answer audit — AI Café (2026-11-07)

This audits the Claude.ai answer set field by field against the **current** repository, the **live**
Render deployment, the submitted video and the **official** hackathon page
<https://paypalaihackathon.devpost.com/>. Verdicts: **OK** = use as-is, **CHANGE** = must be edited,
**YOU** = your declaration, I cannot answer it.

## 1. Blocking items — fix these first

| # | Problem | Evidence | Action |
|---|---|---|---|
| 1 | **Video is Private.** The upload page says *"Als Privat gespeichert"*. Signed-out playback returns `LOGIN_REQUIRED / "Privates Video"` for `https://youtu.be/X2y7Iw5WNhE`. | Curled the watch page without a session. | Set visibility to **Öffentlich / Public** before submitting. |
| 2 | **"Unlisted is allowed" is not what the rules say.** | Official requirements: *"Must be uploaded to YouTube, publicly visible, with the link on the submission form."* | Use **Public**, not "Nicht gelistet". The form may accept unlisted, but the written rule says publicly visible. |
| 3 | **YouTube title is just `AICafe` and the description is empty.** | Upload page screenshot. | Paste the title, description, tags and chapters in section 6. |
| 4 | **RESOLVED — the backend suite is green again.** The 2026-11-07 run had 5 failed suites / 6 failed tests (1345 of 1351 passing); all six were **stale expectations**, not product bugs. | Six test files updated for the intentional gluten-free catalog labels (35f078f, 95ef131) and the Groq tool-capable model defaults. Fresh full run: **141 suites / 1351 tests pass, 0 failed**, 234 s; log `Video_Kit/test_after_fix.log` (outside the repo). | It is now safe to quote "141 suites / 1351 tests pass" **with the 2026-11-07 date**. No assertion was dropped: the UNKNOWN wellbeing branch, the dietary BLOCK rule and the "no matching breakfast" behaviour are still asserted with explicit fixtures. |
| 5 | **Channel3 contradiction.** `docs/JUDGING.md` said Channel3 was "deliberately not integrated", but the code, a live route, a UI panel, tests and `/api/health` all show a real integration. | `src/channel3/client.ts`, `src/routes/take-home.ts`, `app.js` `#takehome`, `channel3.enabled: true` in health. A fresh-session `POST /api/discover/take-home` returned real retailer offers on 2026-11-07. | **Mark Channel3** on the form (there is a **$1,500 Best Use of Channel3** prize). Docs are now corrected — see section 8. |

Also note: the official deadline is **Nov 12, 2026, 21:00 GMT+1** (shown as Nov 13, 03:00 GMT+7 on the page). Consistent with the earlier note, not a contradiction.

## 2. Project overview — verdicts

- **Project name** `AI Café: Agentic Commerce You Can Trust (PayPal + AI)` — **OK, but pick one**. I measured **53 characters**, so the ≤60 limit is satisfied. **Decision applied:** the Devpost draft, the YouTube title and the thumbnail now consistently use `AI Café — The AI prepares, you approve, PayPal pays`, so use that on the form too. If you prefer Claude's name, change all three places together — do not mix them.
- **Elevator pitch** — **OK**, measured **193 characters** (≤200). Every claim in it is real: server-side policy, scoped AI allowances, human PayPal Sandbox approval, signed mandate, evidence package. I verified each in source.

## 3. "About the project" — verdicts

| Claim | Verdict | Why |
|---|---|---|
| Barista agent with tool calls, no payment tool | OK | `src/ai/fallback-planner.ts`, `routes/ai.ts`; no pay tool in the MCP registry. |
| `"a vegetarian lunch for about €12"` | **CHANGE** | The submitted video and `Video_Kit/run-all.mjs` use exactly **`I want a lunch for around 12 euros`**. The shopper profile in the video is **vegan**, not vegetarian. Use the exact prompt. |
| Server-side policy gate / allowed / needs confirmation / blocked | OK | `AUTO_ALLOW`, `REQUIRE_CONFIRMATION`, `BLOCK` in README and code. |
| Scoped AI allowances, €5-a-day example, fail-closed checkout | OK | `src/policy/allowance-scope.ts`, migration `014_allowance_scopes`, `fallback-planner.ts` fail-closed message, `index.html` scoped allowances panel (new screenshot `07`). |
| "Diet preferences are saved and **enforced**" | **CHANGE** | Dietary preferences (vegan / vegetarian / gluten-free) **guide server-side catalog discovery**; allergen notes are **guidance only**, always labelled unverified, never a safety guarantee. Say "guide" rather than "enforced" so it cannot be read as an allergy safety claim. |
| Signed Cart Mandate, dispute evidence package, order page from server record | OK | `src/evidence/service.ts`, `src/routes/evidence.ts` (`POST /api/evidence/verify` is public), `src/mandate/`. |
| Refunds need authenticated merchant approval | OK | `routes/refunds.ts`, refund queue. |
| AG Grid Agent Control Center | OK | `dashboard.html`; CSV **and JSON** export buttons confirmed. |
| MCP + `/.well-known/agent-commerce.json`, never pay/capture/refund | OK | Live URL returns 200. |
| One design-token file feeds web and Flutter | OK | `source/design/tokens.json` → `tokens.css` + `flutter_app/lib/theme/tokens.g.dart` via `gen-design-tokens.js`. |
| "141 Jest suites / 1351 tests" | **OK, add the date** | Re-measured 2026-11-07 on the current source: 141 / 1351 pass, 0 failed. Quote it as "re-measured 2026-11-07" so it is not read as an old claim. |
| "Sandbox purchase flow run end to end on deployed app" | OK with date | Documented 2026-10-27 in `docs/PAYMENT_E2E.md`; order creation re-verified 2026-11-07 (`201` + real approval URL). Do not imply it was re-run on the newest commit. |
| "What's next: persistent dispute state machine" | **CHANGE** | Already built: `src/disputes/service.ts` has lifecycle stages, terminal states, prepare/submit/refresh/export and durable repositories. Replace with "live webhook replay and real PayPal dispute lifecycle validation". |
| Honesty note (webhook replay / partial refund not verified) | OK | Keep it. `docs/KNOWN_LIMITATIONS.md` says the app never auto-submits and never invents a PayPal outcome. |
| No third-party trademarks / music | OK | Video has no music and no third-party footage. The PayPal Sandbox checkout screen is the required integration, not an advertisement. |

Corrected full description is in section 5.

## 4. Built with, links, gallery — verdicts

- **Built with tags** — **CHANGE**: **remove `docker`** (`git ls-files | grep -i docker` → none; no Dockerfile is tracked). **Add `channel3`**. All other tags are accurate. 21 tags after the edit, under the 25 limit.
- **Try it out links** — OK. Repo URL verified public (`private: false`, MIT, 0 open issues, `pushed_at` current); Render URL verified. YouTube link is `https://youtu.be/X2y7Iw5WNhE` — but see blocker 1.
- **Image gallery** — **CHANGE** to these facts:
  - The **"old screenshots are orange"** warning is **outdated**. All ten current PNGs were captured from the live deployment on 2026-11-07 in the **light blue / white iOS-style theme** (verified by pixel sampling and OCR). No re-capture is needed for theme reasons.
  - All ten are **1440×900 (1.60:1, close to the preferred 3:2)** and **≤0.30 MB**, well under the 5 MB limit. Max 15 images allowed, so use all ten.
  - Coverage now: barista + prepared cart (`08`), policy/spending allowance + wellbeing (`03`), profile diet/budget (`10`) and scoped allowances (`07`), AG Grid control center (`06`), agent manifest (`05`), plus storefront (`01`), For cafés (`04`) and real Channel3 suggestions (`09`).
  - **Still missing**: an order-detail shot with the signed mandate QR and evidence package. It needs a fresh Sandbox payment and cannot be faked; it is **optional**, not blocking.
  - **Cover image**: use `08-barista-cart.png` (shows the AI value immediately) or `01-storefront.png`.

## 5. Corrected paste blocks

### About the project (Markdown)

```markdown
## Inspiration
AI agents are starting to shop for us, but an agent that can *talk* is helpful and an agent that can *spend your money* is scary. We wanted to show that agentic commerce works when the boundary is built into the system: **the AI prepares, the human approves, PayPal pays.**

## What it does
AI Café is a conversational café assistant (web storefront + Flutter app, one backend).
- **Barista agent:** describe what you want ("I want a lunch for around 12 euros"). The agent searches the real menu with tool calls and prepares a cart. It has **no payment tool**.
- **Server-side policy gate:** prices, per-purchase caps, daily limits and confirmation thresholds are enforced on the server and shown as *allowed / needs confirmation / blocked*.
- **Scoped AI allowances:** the shopper can give the agent a small allowance (for example €5 a day). Checkout re-checks it on the server and fails closed if it cannot be verified.
- **Wellbeing guard and honest allergy notes:** dietary preferences guide server-side catalog discovery; allergen notes are always shown as *unverified*, never as "safe".
- **Human approval in PayPal Sandbox:** orders follow create → buyer approval → capture, with idempotency keys and webhook signature verification.
- **Trust layer:** every order carries a signed **Cart Mandate** (who held payment authority), a dispute **evidence package** anyone can verify, and an order page built from the server record. Refunds are requests that need an authenticated merchant approval; nothing is automatic.
- **Merchant Agent Control Center:** an AG Grid dashboard with orders, policy decisions, refund queue, filters and CSV/JSON export.
- **For other agents:** an MCP server and `/.well-known/agent-commerce.json` let external agents search, prepare and track, but never pay, capture or refund.
- **Channel3 "Take it home":** read-only retailer suggestions on the cart that open the retailer's own page. They are never in the PayPal cart, never covered by an allowance and cannot be bought through this app.

## How we built it
TypeScript/Express backend, vanilla-JS storefront (strict CSP) and a Flutter client, PostgreSQL for durable orders, PayPal Orders v2 and refunds in the free Sandbox, a multi-provider LLM layer (Gemini, Groq, Cerebras, OpenRouter, OpenAI) with automatic fallback, and a truthful rule-based planner when no model is reachable. One design-token file feeds both web and Flutter (Apple-style look). The backend has **141 Jest suites / 1351 tests, all passing on 2026-11-07** (PayPal and AI mocked); the Sandbox purchase flow was run end to end on the deployed app on 2026-10-27 and order creation was re-verified there on 2026-11-07.

## Challenges
- Making "the agent cannot pay" a property of the architecture, not a prompt: no AI pathway can approve a capture or a refund.
- Keeping server and client consistent: scope handling, order details and receipts all come from one server record, so the UI can never show a different product than was bought.
- Free-tier AI providers go down; the labelled fallback keeps the flow honest.

## What we learned
Trust features (mandates, evidence, fail-closed scopes) are what make agentic payments believable. Idempotency and signature checks matter more than the model.

## What's next
Live webhook-replay and refund evidence on the Sandbox, validation against a real PayPal dispute lifecycle, and merchant onboarding for businesses beyond one café.
```

Honesty note: webhook replay and partial refund are **not** recorded as verified on the current build; the text above does not claim they are. If you run them, move them from "What's next" into "What it does".

### Built with (one tag at a time)

```
typescript, nodejs, express, paypal, paypal-sandbox, paypal-orders-api, flutter, dart, javascript, postgresql, ag-grid, model-context-protocol, gemini, groq, openrouter, openai-api, render, openapi, postman, apimatic, jest, channel3
```

### Testing instructions (private field)

```
1. Open https://paypal-commerce-agent.onrender.com (free tier: allow up to ~60 s for the first load while the instance wakes).
2. Barista tab: type "I want a lunch for around 12 euros". A cart with server prices and a policy verdict appears.
3. Cart tab → Pay. PayPal Sandbox opens; log in with the sandbox BUYER below (or your own sandbox buyer), approve, return to the store and press "Confirm and pay now".
4. The order page opens (Profile → Recent orders also lists it): items, signed Cart Mandate (Verify), evidence package.
5. Merchant side: /dashboard.html (Agent Control Center, AG Grid). "For cafés" at /merchant.html is a guided walkthrough. If the dashboard asks for a key: [OPS KEY].
6. Run locally with no keys: see README "Quick start" (npm ci && npm run demo). Plain "npm run dev" keeps the dashboard private; "npm run demo" opens it in public view.
Sandbox buyer: [email] / [password]   (test account, no real money; PayPal Sandbox only)
```

Changes vs Claude's version: the exact demo prompt, the real button label **"Confirm and pay now"** (`receipt.confirm` in `i18n.js` — there is no "Confirm payment" button), and **`npm run demo` instead of `npm run dev`**. `npm ci` is fine because `source/apps/backend/package-lock.json` exists. Use a dedicated Sandbox buyer account; never upload a file containing credentials. Note that a buyer email/password is embedded in `Video_Kit/run-all.mjs`, which is **outside the repository and untracked** — keep it that way.

## 6. YouTube upload page — settings to change

The page is in German. Set these before publishing:

| Field (German) | Set to | Why |
|---|---|---|
| `Sichtbarkeit` | **Öffentlich** (Public), not Privat / Nicht gelistet | Blockers 1 and 2. |
| `Titel` | Paste the title below (replace `AICafe`) | A one-word title hurts findability and the "Best Demo Delivery" criterion. |
| `Beschreibung` | Paste the description + chapters below | Currently empty. |
| `Thumbnail` → `Datei hochladen` | Upload `Video_Kit/youtube_thumbnail.jpg` (1280×720, 87 KB) | Custom cover generated from the actual split-screen frame. |
| `Zielgruppe` | **Nein, es ist nicht speziell für Kinder** | Not made for kids. |
| `Bezahlte Werbung` | **Nein, mein Video enthält keine bezahlte Werbung** | A hackathon entry is not a paid sponsorship. |
| `Verwendung von KI` | **Ja** | The narration is a realistic AI-generated voice (ElevenLabs). YouTube requires disclosure of realistic AI-generated/altered content; the label is harmless and does not limit reach. It must be decided honestly by you. |
| `Videolanguage` | **English** | English-only narration. |
| `Kategorie` | **Wissenschaft & Technik** (Science & Technology) | Better fit than the default "Menschen & Blogs". |
| `Tags` | Paste the tag line below | Optional but free. |
| `Einbetten zulassen` | **On** | Devpost embeds the player. |
| `Lizenz` | Standard-YouTube-Lizenz | Fine; no need for Creative Commons. |
| `Aufnahmedatum` | 2026-11-07 | Optional. |
| `Automatische Kapitel` | Add the manual chapter list below (it overrides auto-chapters) | Nine beats, all real. |
| `Verarbeitung bis zu HD` | Wait ~2 minutes for HD processing before the final submit | Cosmetic, not blocking. |

Title:

```
AI Café — The AI prepares, you approve, PayPal pays | PayPal AI Hackathon
```

Description (includes chapters; the first timestamp must be 0:00):

```
AI Café is a trust-first agentic commerce prototype for the PayPal AI Hackathon.

An AI barista turns a natural-language request and a budget into a proposed cart. The server fixes every price and enforces the spending policy. The AI has no payment tool: only a human can approve the payment in PayPal Sandbox, and only a merchant can approve a refund.

This 2:52 split-screen walkthrough shows the web storefront and the Flutter app on one backend, including the wellbeing guard, split bill, the QR-coded Ed25519-signed Cart Mandate, the read-only Ops Copilot, the human-approved refund queue and the "For cafés" control center.

Rule of the project: the AI proposes, the server prices, the human authorises, PayPal moves the money.

Live demo: https://paypal-commerce-agent.onrender.com
Public source (MIT): https://github.com/oemeraydemir/paypal-commerce-agent

PayPal Sandbox only. No real money, no live credentials. English narration generated with an AI voice; no third-party music or footage.

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

## 7. Additional info — verdicts

- **Submitter Type / Country / consents / team name / PayPal rating / feedback / learning level / AI-value-for-career** — **YOU**. I will not tick declarations on your behalf.
- **"Compact Labs"** — appears only in the **untracked** local `_owner/SUBMISSION_HELPER.md`, nowhere in the public repo. If it is not a registered company, `N/A` is correct.
- **New or existing** — first commit is **2026-11-05** (`git log --reverse`), so after 1 Oct 2026 → **New**. Honesty note: the history is a clean re-upload ("Temiz yukleme") and the docs contain evidence dated 2026-10-20/25/27 — all still inside the hackathon window, so "New" is defensible. If you consider work began before the hackathon, choose Existing and use Claude's prepared paragraph.
- **"Explain how your project meets the main technology requirement"** — **OK**. `PayPal-Request-Id`, `PAYMENT.CAPTURE.COMPLETED`, `verify-webhook-signature`, the PayPal Agent Toolkit and the multi-provider tool-calling agent all exist in source. Add Channel3 to the sponsor-tool answer, not this field.
- **Additional sponsor tools** — Mark **AG Grid**, **Render**, **Postman**, **APIMatic**, **Channel3**. Do **not** mark Bryntum, Elastic, Astropods, KERNEL or Zapier. The Zapier-shaped automation events are explicitly untested and best-effort (`docs/JUDGING.md`), so claiming Zapier would be dishonest. Re-run the Postman/newman collection before quoting "58 requests / 73 assertions".
- **Repository / working demo URLs** — OK, both verified 200 and public/MIT.
- **"Which AI tools have you leveraged"** — **YOU**. Claude's draft names Claude and ChatGPT; keep only what you actually used, and note that the product itself uses the Gemini/Groq/… chain.
- **AG Grid experience** — OK. CSV **and JSON** export, quick filter, sorting, pinned columns, refund queue and `tokens.css` theming are all present. Add one concrete positive and one limitation as Claude suggests; keep "Community only, no Enterprise grouping/status bar".

## 8. What I already corrected in the repository

- `docs/JUDGING.md`: removed the false "Channel3 deliberately not integrated" line, added a precise Channel3 entry and an honest "not used" list.
- `README.md`: added an explicit **"How AI and PayPal are used"** section (the form's final check asks for it, and the official requirements ask for instructions a judge can follow), added scoped allowances, dispute evidence and Channel3 to "What it does", added Channel3 to the Tools-used table, and embedded the four new screenshots.
- `SPONSOR_INTEGRATION.md`: fixed an internal contradiction (header said no SDK was generated, body said they were).
- `docs/screenshots/README.md`: inventory now lists ten real shots and explains which planned shots are intentionally not faked.
- Gallery: added `07-profile-allowances.png`, `08-barista-cart.png`, `09-take-home-channel3.png`, `10-profile-diet-budget.png`, captured from the live deployment with `Video_Kit/capture_shots_extra.mjs`.
- `Video_Kit/youtube_thumbnail.jpg`: ready-to-upload 1280×720 cover.
- **Six stale test expectations repaired** in `tests/unit/ai-client.test.ts`, `tests/unit/policy.test.ts`, `tests/integration/wellbeing.test.ts`, `tests/integration/web-wellbeing.test.ts` and `tests/unit/fallback-planner-intent.test.ts`. They now match the intentional catalog/model changes while still asserting the old behaviours with explicit fixtures. Full suite: **141 / 141 suites, 1351 / 1351 tests pass**.
- `docs/EVIDENCE.md`, `docs/DEVPOST_DRAFT.md`, `DEMO_CHECKLIST.md`, `docs/SUBMISSION_CHECKLIST.md`: test counts re-measured and dated 2026-11-07; the YouTube link and the "Public, not Unlisted" rule are now stated correctly; Channel3 added to the tools, built-with list, testing instructions and tags; chapters added to the YouTube description; the project-name inconsistency resolved.

## 9. Final pre-submit check

- [ ] Video plays in a **signed-out** browser — currently **fails** (private).
- [ ] Title, description, tags, chapters, thumbnail, audience and AI-use settings filled in.
- [ ] Repository public, MIT in About, README has "How AI and PayPal are used" and sponsor integrations — **done**.
- [ ] Render awake, PostgreSQL durable, `/`, `/dashboard.html`, `/merchant.html`, `/api/health` and the agent manifest all **200** — **verified 2026-11-07**.
- [ ] Channel3 decision made and docs/form say the same thing — **done, mark it on the form**.
- [x] Test counts match reality — **141 suites / 1351 tests pass**, re-measured 2026-11-07 after the six stale expectations were updated. `docs/EVIDENCE.md`, `docs/DEVPOST_DRAFT.md`, `DEMO_CHECKLIST.md` and `docs/SUBMISSION_CHECKLIST.md` now agree.

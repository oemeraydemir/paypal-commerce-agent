# Devpost form — final field-by-field answers (AI Café, PayPal AI Hackathon)

**This is the single source of truth for the form.** `docs/DEVPOST_DRAFT.md` and
`docs/DEVPOST_ANSWER_AUDIT.md` contain earlier variants and the audit trail; this file contains the
text to paste, in form order.

State used, re-verified **2026-11-08 00:50 GMT+1**: repository clean at `14772b3`, `HEAD == origin/main`;
Render `/api/health` `buildCommit: 2261f2f`, `paypal.environment: sandbox`, `storage: postgres`,
`channel3.enabled: true`; backend **141 suites / 1361 tests pass**; video
`https://youtu.be/X2y7Iw5WNhE` is **Public** and 172 s; ten screenshots in `docs/screenshots/`.

Rules for this file: every `PASTE` block is plain text with **no table markup** inside, so it can be
selected and pasted directly. All pasted text is **English**. Lines labelled **NOTE** or **YOU** are
instructions for the submitter, never paste them. Do not paste a field's answer into a different field.

---

## A. Changes vs the Claude.ai draft — check these first

1. **Project name — CHANGE for consistency.** Claude used
   `AI Café: Agentic Commerce You Can Trust (PayPal + AI)`. All repository docs, the YouTube title and
   the thumbnail now use `AI Café — The AI prepares, you approve, PayPal pays`. Pick ONE name and use it
   in the form, the YouTube title and the thumbnail together.
2. **Elevator pitch — OK as-is.** 193/200 characters, every claim verified.
3. **About the project — SEVEN fixes.** See section C. Most important: the exact demo prompt is
   `I want a lunch for around 12 euros` (not "a vegetarian lunch for about €12"); say dietary
   preferences **guide** discovery, not "are enforced"; the test count is **1361**, not 1351; add the
   Channel3 bullet; remove "persistent dispute state machine" from What's next (it already exists);
   date the end-to-end Sandbox claim.
4. **Built with — REMOVE `docker`** (no Dockerfile is tracked in the repo), **ADD `channel3`**. 22 tags,
   under the 25 limit.
5. **Try it out links — the YouTube link is no longer a placeholder:** `https://youtu.be/X2y7Iw5WNhE`.
6. **Image gallery — Claude's "capture 6 screens, the old ones are orange" is outdated.** Ten real
   1440×900 PNGs already exist, captured from the live deployment in the current light blue / white
   theme. Use all ten.
7. **Video — already Public.** The form accepts "public or unlisted with no password"; the written rules
   say publicly visible. Public satisfies both. Keep it Public; do not switch to Unlisted.
8. **New or existing — resolved: New.** First commit is 2026-11-05, after 1 Oct 2026 09:15 PT. The
   "if it existed before" field is **required**, so type `N/A`.
9. **Channel3 — resolved, TICK IT.** Claude flagged a documentation contradiction. The code
   (`src/channel3/client.ts`), a live route (`POST /api/discover/take-home`), the cart UI, a screenshot
   and `channel3.enabled: true` in `/api/health` all confirm a real integration. `docs/JUDGING.md` has
   been corrected. There is a **$1,500 Best Use of Channel3** prize.
10. **Testing instructions — FIVE fixes.** Exact prompt, real button label, `npm run demo`, add the
    Split Bill recovery step, add Channel3. **Web** checkout button reads `Review & pay with PayPal`;
    **Flutter** reads `Checkout with PayPal`. There is no "Confirm payment" button — it is
    `Confirm and pay now`.
11. **APIMatic Context Plugin — leave BLANK.** The repo used the APIMatic **CLI** to generate SDKs from
    `openapi.json`; there is no evidence the Context Plugin was used. Do not invent an experience.
12. **Test count — 141 suites / 1361 tests everywhere.** Claude's 1351 is the pre-fix baseline.
13. **AI providers — be precise.** The deployed instance reports `groq` + `gemini`. OpenRouter, Cerebras
    and OpenAI are code-supported fallbacks, not live-configured providers. Say "available in the
    fallback chain", not "used live".

---

## B. Project overview

### \* Project name

PASTE (51/60 characters):

```
AI Café — The AI prepares, you approve, PayPal pays
```

### \* Elevator pitch

PASTE (193/200 characters):

```
A café agent that prepares your order but can never pay. Server-side spending policy, scoped AI allowances, human approval in PayPal Sandbox, plus a signed mandate and evidence for every order.
```

---

## C. Project details

### \* About the project (Markdown)

PASTE the whole block, including the `##` headings:

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
- **Split Bill:** the server computes every share. An organiser can always see why a bill can or cannot be closed; a checkout that was started but never captured is discarded only after the server asks PayPal for proof that no capture exists. A share that was actually paid is never erased — it needs a café-approved refund.
- **Channel3 "Take it home":** read-only retailer suggestions on the cart that open the retailer's own page. They are never in the PayPal cart, never covered by an allowance and cannot be bought through this app.

## How we built it
TypeScript/Express backend, vanilla-JS storefront (strict CSP) and a Flutter client, PostgreSQL for durable orders, PayPal Orders v2 and refunds in the free Sandbox, a multi-provider LLM layer (Gemini and Groq live, with OpenRouter, Cerebras and OpenAI in the code fallback chain), and a truthful rule-based planner when no model is reachable. One design-token file feeds both web and Flutter. The backend has **141 Jest suites / 1361 tests, all passing on 2026-11-07** (PayPal and AI mocked); the Sandbox purchase flow was run end to end on the deployed app on 2026-10-27, and order creation plus the no-money Split Bill cancellation path were re-verified there on 2026-11-07/08.

## Challenges
- Making "the agent cannot pay" a property of the architecture, not a prompt: no AI pathway can approve a capture or a refund.
- Keeping server and client consistent: scope handling, order details and receipts all come from one server record, so the UI can never show a different product than was bought.
- Free-tier AI providers go down; the labelled fallback keeps the flow honest.
- Giving an organiser a safe way out of a Split Bill: a PayPal checkout can be started and abandoned, so we had to prove with PayPal that no capture happened before cancelling anything.

## What we learned
Trust features (mandates, evidence, fail-closed scopes) are what make agentic payments believable. Idempotency and signature checks matter more than the model.

## What's next
Live webhook-replay and refund evidence on the Sandbox, validation against a real PayPal dispute lifecycle, and merchant onboarding for businesses beyond one café.

## Honest scope
PayPal Sandbox only; live money cannot be configured. One deployment serves one merchant. The "e-invoice" is an itemised order record, not a tax invoice. The Cart Mandate is our own Ed25519-signed audit format, not AP2 or an official PayPal Agent Ready integration. Webhook replay and partial refunds are not recorded as verified on this build.
```

**NOTE:** webhook replay and partial refund are deliberately in "What's next". If you actually run them,
move them into "What it does" and date the claim.

### \* Built with

Add **one tag at a time** (22 tags, limit 25). PASTE one line per tag, or copy the comma-separated
list into a scratch pad — Devpost's field expects individual tags:

```
typescript
nodejs
express
paypal
paypal-sandbox
paypal-orders-api
flutter
dart
javascript
postgresql
ag-grid
model-context-protocol
gemini
groq
openrouter
openai-api
render
openapi
postman
apimatic
jest
channel3
```

### "Try it out" links

Add three links, in this order:

```
https://paypal-commerce-agent.onrender.com
https://github.com/oemeraydemir/paypal-commerce-agent
https://youtu.be/X2y7Iw5WNhE
```

Suggested labels: `Live demo (PayPal Sandbox)`, `Public source code (MIT)`, `Demo video (YouTube)`.
All three were verified reachable on 2026-11-08; the repository is public with MIT in the About box.

### Image gallery

Upload **all ten** files from `docs/screenshots/`. All are 1440×900 (1.60:1, close to the preferred
3:2) and ≤0.30 MB, well under the 5 MB / 15 image limits. They were captured from the **live Render
deployment**, not mocks, in the current light blue / white theme. No credentials or merchant keys
appear in any shot.

```
01-storefront.png
02-barista.png
03-cart-wellbeing.png
04-for-cafes.png
05-agent-manifest.png
06-dashboard.png
07-profile-allowances.png
08-barista-cart.png
09-take-home-channel3.png
10-profile-diet-budget.png
```

Make `08-barista-cart.png` the cover: it shows the AI value immediately. `09-take-home-channel3.png`
is the Channel3 evidence for the sponsor prize.

**NOTE:** the only gap is an order-detail shot with the signed mandate QR and evidence package. It
needs a fresh Sandbox payment and cannot be faked. It is optional, not blocking. No "orange theme"
re-capture is needed.

**Caption fix (live metrics, re-verified 2026-11-08):** the live dashboard reports **87 orders**
(40 paid, 36 cancelled), **226 policy events** (214 allowed, **12 blocked**), net **€382.15**
captured (€31.20 refunded), with mandate defaults max €20/order and €100/day. Replace any gallery
caption with these real numbers — they are the current truth. In particular:
- Image 12 (7-day pickup / agent activity) currently says "100 carts checked, 5 blocked, €xx captured" —
  that is placeholder. Use: *"Agent activity summary: 87 orders (40 paid, 36 cancelled), 226 policy
  events with 12 blocked, net €382.15 captured. Wellbeing Guard allergen decisions logged."*
- Image 10 says "max €20/order, €100/day" — this is correct as-is (matches the live mandate defaults);
  keep it.

### \* Demonstration video

PASTE:

```
https://youtu.be/X2y7Iw5WNhE
```

**NOTE:** 2:52 (172 s), under 3 minutes. Already **Public** and signed-out playable
(`playabilityStatus: OK`, oEmbed 200). Keep it Public. The title, description, chapters, tags and
custom thumbnail still need setting in YouTube Studio — see `docs/DEVPOST_DRAFT.md` §7. Do not leave
the visibility on Unlisted.

---

## D. Additional info (judges and organizers only)

### Upload a File

Leave **empty**. It is optional. Never upload a file containing Sandbox credentials or an ops key.

### \* Submitter Type — **YOU**

Select `Individual`, `Team` or `Organization`. A solo entry is `Individual`.

### \* Submitter Country of Residence — **YOU**

Select your actual country of residence from the dropdown. It appears in the project gallery.

### \* Canada province

PASTE (unless you reside in Canada):

```
N/A
```

### \* Organization Name (if applicable)

PASTE (unless you represent a registered organization):

```
N/A
```

**NOTE:** "Compact Labs" appears only in an untracked local file, nowhere in the public repository.
Use `N/A` unless it is a registered company.

### \* Is your project new, or did it exist before Oct 1, 2026 (9:15 am PT)?

Select **New**. First commit is 2026-11-05. **NOTE:** the docs contain evidence dated
2026-10-20 / 25 / 27, all inside the hackathon window, so "New" is defensible. If you consider that
work began before the start date, choose `Existing` and use the prepared explanation from the audit.

### \* If it existed before, explain what already existed and what you built or changed

This field is **required even when you select New**. PASTE:

```
N/A
```

### \* Explain how your project meets the main technology requirement

PASTE:

```
PayPal developer platform, all on the free Sandbox (no real money):
- PayPal Orders API v2 creates the order with server-computed prices and returns the approval URL; the backend captures only AFTER a human buyer approves at PayPal. Every capture sends a PayPal-Request-Id idempotency key.
- PayPal Payments Refunds API issues refunds, but only after an authenticated merchant clicks "Approve & refund" in the dashboard.
- PayPal Webhooks and the verify-webhook-signature API verify PAYMENT.CAPTURE.COMPLETED before an order is marked paid.
- PayPal Agent Toolkit powers the read-only merchant Ops Copilot: it can inspect an order and PROPOSE a refund, but has no tool to execute one.
- PayPal Sandbox personal buyer accounts provide the human approval step in the demo and in the submitted video.
PayPal is central: no order exists without the Orders API and no money moves without human approval in PayPal.

AI tools, models and services:
- Google Gemini (primary) and Groq are configured on the deployed instance; OpenRouter, Cerebras and OpenAI are available in the same automatic fallback chain. The tool-calling barista turns a natural-language goal and budget into a PROPOSED cart using only catalog and cart tools.
- A clearly labelled rule-based planner (not AI) takes over when no model is reachable, so the app never pretends a model answered.
- A Model Context Protocol (MCP) server at /api/mcp plus /.well-known/agent-commerce.json lets external agents search the menu, prepare a cart and check policy, but never pay, capture or refund.
- The "Why these items?" explanation is built from the server response, not from the model.

The AI has no payment tool anywhere in the system. Prices, per-purchase limits, daily budgets, confirmation thresholds and scoped allowances are computed and re-checked on the server; the human authorises in PayPal and the merchant approves any refund. No code path lets a model move money.
```

**NOTE:** Channel3 belongs in the sponsor-tools question, not here.

### \* Which additional sponsor tool(s) did you use?

Tick exactly these five:

```
AG Grid
APIMatic
Channel3
Postman
Render
```

Do **NOT** tick: `Bryntum`, `Elastic`, `Astropods`, `KERNEL`, `Zapier`. The Zapier-shaped automation
events are explicitly untested and best-effort, so claiming Zapier would be dishonest.

**NOTE:** APIMatic is legitimate — TypeScript and Python SDKs were generated locally from
`openapi.json` and are committed under `sdks/`. Postman is legitimate — a collection is committed.
Do **not** quote the "58 requests / 73 assertions" newman count: that measurement is dated
2026-10-25 and has not been re-run on the current build.

### \* Public code repository URL

PASTE:

```
https://github.com/oemeraydemir/paypal-commerce-agent
```

**NOTE:** verified public, MIT license visible in About, README has an explicit "How AI and PayPal are
used" section, setup instructions and the sponsor integrations. This is exactly what the form requires.

### \* Working demo / hosted application URL

PASTE:

```
https://paypal-commerce-agent.onrender.com
```

### Testing instructions or credentials the judges need

PASTE the whole block, after replacing the three bracketed placeholders:

```
Live demo: https://paypal-commerce-agent.onrender.com
The Render free tier sleeps; allow about 60 seconds for the first request, then reload. GET /api/health should report status ok, paypal.environment sandbox, durable PostgreSQL storage, ai.enabled true and channel3.enabled true.

Quick path (no credentials):
1. Open the live URL, browse the menu, open the AI barista tab and type "I want a lunch for around 12 euros". A cart with server prices and a policy verdict appears.
2. Open Profile and save a dietary preference and an allergen note. The wellbeing panel labels them unverified.
3. With items in the cart, press "Show take-home ideas" for read-only Channel3 retailer suggestions. They are labelled as not part of your café order and cannot be bought here.
4. Open "For cafés" at /merchant.html for the merchant walkthrough, and /dashboard.html for the AG Grid order board and refund queue. The dashboard runs in public demo view, so no key is needed to see orders, policy decisions and the read-only Ops Copilot; the refund queue and refund approval require the merchant key (see step 4 of the full path).

Full payment path (PayPal Sandbox only, no real money):
1. Use a PayPal Developer Sandbox PERSONAL (buyer) account: [email] / [password]. Credentials belong in this private field only and are never committed to the repository.
2. Add items to the cart, choose "Review & pay with PayPal" (web) or "Checkout with PayPal" (Flutter), log in at the PayPal Sandbox approval page, approve, return to the store and press "Confirm and pay now".
3. The receipt opens: items, the QR-coded Ed25519-signed Cart Mandate (Verify), and the dispute evidence package.
4. Merchant refund step: the refund queue and the Ops Copilot need the merchant key, so the hosted demo is view-only for judges (the full approve/refund flow is shown in the demo video). To try it yourself, run `npm ci && npm run demo` in source/apps/backend: it prints a throw-away ops key, then open the dashboard on localhost.
5. Split Bill recovery (no money moves): add items, click "Split the bill", choose 2 people, open the split room, press "Pay my share with PayPal" and return to /split WITHOUT confirming. The organiser still sees "Cancel split bill and discard the started payment"; confirm it. The server asks PayPal for proof that nothing was captured, then cancels the order, releases its reservation and closes the bill. If a share was actually paid, the room explains that only a café-approved refund can undo it.

Run locally with no keys: npm ci && npm run demo in source/apps/backend, then open http://localhost:3000. Plain "npm run dev" keeps the dashboard private; "npm run demo" opens it in public view.
```

**NOTE:** replace `[OPS KEY]`, `[email]` and `[password]` before submitting. Use a dedicated Sandbox
buyer account created for this purpose. Buyer credentials already exist in
`Video_Kit/run-all.mjs`, which is **outside the repository and untracked** — keep it that way. Never
put real credentials in the repo or in an uploaded file.

### \* How would you rate your overall experience integrating PayPal? — **YOU**

Choose 1–10. A realistic 8 or 9 is defensible; pick your own honest rating.

### \* Overall experience rating: please share why or provide additional feedback

PASTE a draft — replace the bracketed part with your own experience:

```
Orders API v2 create, approval and capture were straightforward, and the Sandbox made a full end-to-end test possible without real money. PayPal-Request-Id idempotency and the verify-webhook-signature call were clear once we had a public HTTPS endpoint for webhooks; we hosted the service on Render. What cost time: Sandbox buyer login friction across repeated demo takes, webhook verification needing a publicly reachable URL during local development, and [your own pain point]. We would welcome a buyer-side dispute and evidence flow in the Sandbox so signed agent-commerce evidence packages can be validated against a real dispute lifecycle.
```

### \* Are you open to us contacting you for additional feedback? — **YOU**

`Yes` is harmless and helps the organizers. Choose what you prefer.

### If you used the APIMatic Context Plugin during your integration…

Leave **BLANK**. We used the APIMatic CLI to generate SDKs from `openapi.json`; the Context Plugin was
not used. This field is optional. Do not invent an experience.

### If you used AG Grid, what was your experience building with AG Grid / AG Charts / AG Studio?

Optional but recommended for the AG Grid prize. PASTE:

```
We used AG Grid Community for the merchant Agent Control Center: an orders grid, a policy-events grid and a pickup grid, each with sorting, column filters, a quick-filter box, pinned columns, pagination (15/50/100) and CSV plus JSON export, plus the human-approved refund queue. Colours come from one shared design-token file that also drives the Flutter app, so the grid matched the rest of the UI without a second stylesheet. A concrete positive: the column-definition API and setGridOption('quickFilterText', ...) needed almost no glue code to keep three grids in sync with one server record. The main limitation was staying on Community: row grouping, aggregation and the status bar are Enterprise-only, so we built the summary KPI cards as separate UI elements instead. For a larger merchant we would want server-side row grouping and aggregation.
```

### Three required consent checkboxes — **YOU**

Tick all three only if true: age of majority, eligible jurisdiction, and not an employee /
representative / agent of the Promotion Entities. I will not tick declarations on your behalf.

### \* Which AI tools have you leveraged while working on this project? — **YOU**

PASTE a template; keep only what you actually used:

```
Claude (Anthropic) for drafting and reviewing submission copy and for code review; [add any other assistant you actually used]. All code was reviewed, run and tested by me: 141 Jest suites / 1361 tests pass, plus a live Sandbox order-creation check and a no-money Split Bill cancellation check on the deployed build. Inside the product itself, the tool-calling barista uses Google Gemini and Groq on the deployed instance, with OpenRouter, Cerebras and OpenAI in the code fallback chain.
```

### \* Describe the level of learning you/your team derived from the project — **YOU**

Suggested: `Significant`. Choose your own honest assessment.

### \* Did you gain AI value that you can use in your career? — **YOU**

Suggested: `Yes`. Choose your own honest answer.

---

## E. Submit project

The Official Rules and Terms of Service checkbox is **yours** — read both documents, then tick it.
You can still edit the submission until the deadline, **12 Nov 2026, 21:00 GMT+1**.

Before clicking Submit:

```
1. Confirm the video still plays in a signed-out browser at https://youtu.be/X2y7Iw5WNhE.
2. Paste the YouTube title, description, chapters and tags from docs/DEVPOST_DRAFT.md section 7, upload Video_Kit/youtube_thumbnail.jpg, and set audience, paid promotion, AI-use = Yes, language English, category Science & Technology and embedding.
3. Replace [TEAM NAME], [OPS KEY], [email], [password] and [your own pain point].
4. Tick Channel3 alongside AG Grid, APIMatic, Postman and Render.
5. Upload all ten screenshots and set 08-barista-cart.png as the cover.
6. Warm the Render service (free tier) shortly before judging.
```

---

## F. Only the account owner can answer

Do not let any tool or assistant fill these on your behalf: Submitter Type, Country of Residence,
New vs Existing decision, PayPal rating, contact consent, which AI assistants you used, learning
level, AI career value, the three eligibility checkboxes, and the Terms checkbox. Everything else in
this file is verified and paste-ready.

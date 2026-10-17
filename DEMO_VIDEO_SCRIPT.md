# Demo video script — AI Café (target: 2:52, hard cap 3:00)

**Style.** Screen-capture of the live demo in a desktop browser (and the AG Grid
dashboard + Ops Copilot in a second window). Calm voiceover, no music, no
third-party logo overlays. PayPal's own checkout screens are fine to show — they're
the point.

**Goal of the video.** In under 3 minutes a judge should understand: (1) the problem,
(2) the agent prepares a cart but **the server owns prices and the human pays**,
(3) the policy guardrails are real, (4) the payment is human-approved in PayPal, (5) a
live **AG Grid** dashboard proves every decision, and (6) the merchant copilot is
**read-only**.

---

## Before you record (2 min of setup saves a reshoot)

1. Warm up the live demo: open `https://paypal-commerce-agent.onrender.com` and let
   it boot (~60 s on free tier). Better: run locally so nothing depends on Render's
   cold start.
2. Log into the PayPal sandbox with a sandbox **buyer** account ready.
3. Have the Ops Copilot key (from the testing-instructions field) pasted into the
   dashboard's **Ops access key** box so the read-only refusal is live on camera.
4. Open `/dashboard` in a second window, sized so both are visible for the final
   beats.

---

## Scene table

| # | Time | Shot / On-screen | Voiceover | Why it scores |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:14 | Storefront home, AI chat box, profile chips ("Gluten-free · Vegetarian · Budget ≤ €34"). | "Shopping apps make you translate what you want into filters. AI Café lets you just say it — and it never gets control of your money." | Immediate hook + the core thesis (human stays in control). |
| 2 | 0:14–0:42 | Click **scenario** buttons: Everyday (€13) → "needs approval"; Quick coffee (€3) → auto-allowed; Over-limit (€55) and Alcohol → server **blocks before PayPal**. | "Every cart is judged by the server-side policy engine using the backend's own prices. €13 needs my approval; €3 is automatic; over-limit or alcohol is blocked — even a forged request is refused." | Shows the **server-owned pricing + authoritative policy** (security/creativity criteria). |
| 3 | 0:42–1:20 | "Vegetarian breakfast for two under €20" → AI prepares cart; review; **Review & pay with PayPal**; PayPal sandbox approve (sandbox buyer); return; **Confirm payment**; receipt card (items, total, masked capture ID, 4-step timeline). | "The agent has no PayPal credential — only I can approve. Capture happens only after my explicit confirmation, and the receipt proves a single capture." | The **human-in-the-loop PayPal** moment (PayPal + AI prize). |
| 4 | 1:20–1:52 | `/dashboard`: KPI cards (orders, AI-assisted share, blocked, revenue); **Orders** grid; click **Group by → Origin** to show AI vs Human groups with summed totals; show the **status bar** count/sum; open a row's side panel (reason + violated rules); note 5 s live refresh. | "Every order and policy decision is audited live in an **AG Grid** dashboard — grouping, aggregation, and a status bar — showing who prepared the cart, AI or human, and what the policy said." | Showcases **meaningful AG Grid** use (the AG Grid prize): grouping, sum aggregation, status bar, live refresh. |
| 5 | 1:52–2:12 | Dashboard Ops Copilot: ask "Which payments were blocked today and why?" → answer from audit trail. Then "Refund my last order." → copilot **refuses** (read-only; zero write-tool calls). | "A merchant Ops Copilot can explain what happened, but it's read-only — it can't issue a refund, even when asked." | Demonstrates the **read-only PayPal Agent Toolkit** copilot (PayPal + AI, security). |
| 5b | 2:12–2:37 | Terminal beside the browser: `npm run mcp:demo`. An **external agent** initializes, lists **5 tools (there is no pay tool)**, gets a policy **BLOCK**, shrinks its cart, then receives a PayPal approval link it cannot use. | "AI Café is also agent-ready. Any MCP agent can shop here — but it can only start a checkout. A human still approves the payment." | Shows **agentic commerce** beyond one app (Best Use of Agentic Commerce / PayPal + AI). |
| 6 | 2:37–2:52 | Title card over the storefront; quick flashes of the API/Postman/OpenAPI badges. | "AI Café: agentic commerce where the human stays in control of every payment. Try the live demo, the Postman collection, and the OpenAPI spec." | Closing impact + pointers to **tryability** (Postman / APIMatic / Render). |

---

## Shot list (what to actually click)

- **Beat 2:** the scenario buttons are on the storefront; if unavailable, type the
  requests in the chat box. Show the policy meter + the server's decision text.
- **Beat 3:** pause briefly on the PayPal approval screen so the judge sees it's the
  real sandbox, not a fake.
- **Beat 4:** the **Group by** dropdown is the new AG Grid feature — use it on camera;
  the status bar at the bottom updates with count + sum as you select a numeric cell.
- **Beat 5:** the refusal is the punchline — let it sit for a beat.
- **Beat 5b:** run `npm run mcp:demo` in `source/apps/backend` (against the live URL: `npm run mcp:demo -- https://paypal-commerce-agent.onrender.com`). Pause on the "no capture / pay / refund tool exists" line and on the printed approval link.
- **Fallback:** if the AI answers with `rule-based` (free-tier quota), say so — it is labelled in the UI; re-record in a minute or use a warm provider key.

---

## Hard rules

- **Under 3 minutes.** If you're at 3:00, cut Beat 2's alcohol example or shorten
  Beat 4's side-panel detail.
- **No music, no sponsor logo overlays.** PayPal screens are allowed (they're
  PayPal's own UI).
- **Sandbox only** — never real funds; say "sandbox" once so it's unambiguous.
- **Upload to YouTube (unlisted is fine),** then paste the link into `SUBMISSION.md`
  → "YouTube demo video (required)" and into the Devpost entry.

# AI Café — Devpost Project Description (draft)

> Copy-friendly draft for the Devpost form. Every claim matches a feature that exists in this repository;
> where something was not verified live it says so (see `docs/PLATFORM_STATUS.md`). No invented metrics.
> Replace the three marked placeholders before publishing: **[YOUTUBE LINK]**, **https://github.com/oemeraydemir/paypal-commerce-agent**, **[TEAM NAME]**.

## One-liner

AI Café is a conversational coffee-shop assistant: you chat in natural language,  
it proposes a basket within your budget and dietary preferences, shows you why it  
picked each item, and hands the approved basket to PayPal — while an AI agent can  
**never** move money on its own.

## The problem

Buying a "vegetarian breakfast for two under €20" from a cafe means juggling a  
menu, dietary rules, a budget, and a checkout. An AI agent that can *talk* to you  
is helpful, but an AI agent that can *spend your money* is scary. We built a  
commerce agent with a hard boundary: the agent prepares carts; a human always  
approves payment.

## How it works

1. **Agent, not a search box.** The backend routes a prompt through a multi-provider  
   LLM layer (Gemini, Groq, Cerebras, OpenRouter, OpenAI with automatic fallback)  
   with three structured tools: search products, get product details, prepare a  
   cart. If every AI provider is unavailable it degrades to a truthful,  
   rule-based planner — it never pretends to be an AI.
2. **Policy gate.** Every proposed cart is checked server-side against the  
   merchant's policy (per-purchase cap, confirmation threshold, daily budget,  
   alcohol rules). A visible meter shows the verdict: auto-allow, require  
   confirmation, or block.
3. **Explainability.** The "Why these items?" panel explains the basket from the  
   shopper's real preferences and the policy decision, in English or Turkish.
4. **Durable checkout.** Orders go through a PayPal sandbox lifecycle  
   (create → approve → capture) with webhook signature verification and  
   idempotency keys, plus a signed Cart Mandate that records who held payment  
   authority. A merchant-facing control center (AG Grid dashboard) shows every  
   order, policy event, and a refund queue with merchant approval.
5. **Two clients, one backend.** A vanilla-JS storefront (CSP-safe, no unsafe  
   inline script) and a Flutter app (Android/Web) share the same API, the same  
   policy, and the same honest fallbacks.

## What makes it defensible

- **The agent cannot pay.** The AI layer only ever produces a *proposed* cart;  
  payment authorization lives in human-in-the-loop flows. No AI pathway can  
  approve a capture or a refund.
  - **Server-side trust.** Prices, policy, and order totals are enforced on the  
    backend; the client never enforces limits. Tenancy is a server-side fact —  
    client-supplied tenant/business overrides are refused.
- **Security defaults.** Helmet CSP (no `unsafe-inline` for scripts), a CORS  
  single-origin policy, request-size limits, error redaction, and webhook  
  signature checks are all in place and tested.

## Built with

TypeScript/Express backend, vanilla JS + Flutter storefronts, AG Grid dashboard,  
PayPal Commerce (sandbox), OpenAI-compatible multi-provider routing, PostgreSQL  
(optional; in-memory fallback for demos).

## Tools and how they were used (Devpost "Tools" field)

| Tool | How it is used |
|---|---|
| PayPal Developer platform, **Sandbox only** | Orders v2 (create and capture, with idempotency keys), Payments refund, signed webhook verification (`PAYMENT.CAPTURE.COMPLETED`), and the PayPal Agent Toolkit for the read-only merchant Ops Copilot |
| AI models (Gemini, Groq, Cerebras, OpenRouter, OpenAI, chosen by a fallback chain) | Tool-calling shopping agent: search products, read details, prepare a cart. It has **no payment tool**. A rule-based planner answers when no model is reachable and is labelled as such |
| MCP server | Lets an external agent search and prepare a cart; it can never pay |
| AG Grid Community | Merchant dashboard: orders grid, policy-event grid, sorting, filtering, pinning, CSV export, refund queue |
| Render + PostgreSQL | Hosting and durable orders, sessions, webhook ids and refunds |
| Postman / OpenAPI | `postman/` collection and `openapi.json` describe the API; the collection runs green with newman |

Not used on purpose: Bryntum, Channel3, Elastic (no meaningful fit for a 25-item cafe menu).

## What is verified (be exact on the form)

- Backend: TypeScript build clean; **928 Jest tests / 83 suites pass** on commit 364824d (PayPal and AI mocked; measured 2026-10-27, plus six regression tests added afterwards); Postman collection 58 requests / 73 assertions, 0 failed in both dashboard modes (measured 2026-10-25, before the settlement change; re-run it).
- **Real PayPal Sandbox payment, run end to end on the deployed app (2026-10-27):** AI-prepared cart, server policy decision, buyer approval at PayPal, capture, status PAID, signed Cart Mandate verified, dashboard updated. Webhook replay and partial refund are documented in `docs/PAYMENT_E2E.md` and are listed as not yet evidenced until that table says otherwise.
- Flutter app: **150 tests pass** (owner machine, 2026-10-27); one style-level lint was fixed after that run; web and debug APK builds succeed; an Android emulator run matched the web run for language, cart, policy and checkout messaging. Real microphone speech recognition is **not** verified. Details and limits: `docs/PLATFORM_STATUS.md`.
- Automated total: **1084 tests** (934 backend Jest + 150 Flutter).

## Requirement checklist (hackathon rules)

- [ ] Public repository with all source, assets and run instructions: **https://github.com/oemeraydemir/paypal-commerce-agent**. License (MIT) visible in the About box.
- [ ] Working demo: hosted URL (free tier, first load can take about a minute) and local run instructions in the README.
- [ ] Demo video under 3 minutes, public on YouTube: **[YOUTUBE LINK]**. Shows the project running on the device it was built for; no third-party trademarks or copyrighted music.
- [ ] Text description, tools list (above) and the built-with list.
- [ ] Team: **[TEAM NAME]** (use the real name; a solo entry is fine).

## Honest caveats (published with the entry)

- The PayPal lifecycle is covered by the mocked unit/integration suite; the live Sandbox sequence (buyer approval,
  capture, webhook replay, refund) is a repeatable procedure in `docs/PAYMENT_E2E.md` and needs a Sandbox buyer login.
- Invoicing/e-invoicing was deliberately **not** built: a correct invoice is a  
  tax document, and shipping a half-correct one would add risk (see  
  `docs/INVOICING_ASSESSMENT.md`).
- Voice shopping uses the device's on-device recognizer; the transcript is always  
  editable and nothing is sent until the user presses Send.

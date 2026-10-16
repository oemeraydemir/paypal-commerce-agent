# AI Café — Hackathon README (judge-facing)

> **One paragraph.** AI Café is an agentic-commerce prototype for the PayPal AI
> Hackathon. A shopper describes what they want in natural language; an AI agent
> prepares a cart using **server-owned prices**; the shopper **approves the PayPal
> sandbox payment**; only then does the server capture and reconcile. The agent never
> sees a PayPal credential and can never move money. A live **AG Grid** "Agent
> Control Center" shows every order, who prepared it (AI or human), and what the
> policy decided.

---

## TL;DR for judges

- **Try it live:** `https://paypal-commerce-agent.onrender.com` (free tier; first load can take ~60 s).
  - `/` → web storefront (chat with the agent, build a cart, approve in PayPal).
  - `/dashboard` → AG Grid Agent Control Center (orders + policy-events, live 5 s refresh).
- **Run it locally:** see [Quick start](#quick-start).
- **Poke the API:** import `postman/paypal-commerce-agent.postman_collection.json` + `postman/...environment.json`.
- **Read the contract:** `openapi.json` (OpenAPI 3.0, 22 paths).
- **Why it's safe:** [Security model](#security-model).
- **Per-judge reasoning:** [`JUDGES_ANALYSIS.md`](./JUDGES_ANALYSIS.md).
- **Submission notes & evidence:** [`SUBMISSION.md`](./SUBMISSION.md).

---

## Quick start

**Prerequisites:** Node 18+, and (for the full flow) one AI provider key (a free
Groq or Gemini key is enough; OpenAI optional) + PayPal sandbox credentials.

```bash
# 1. Backend
cd source/apps/backend
cp .env.example .env        # fill AI_*/PAYPAL_* if you want the live flows
npm install
npm run build
npm start                   # http://localhost:3000

# 2. (Optional) Mobile app
cd ../flutter_app
flutter pub get && flutter run        # or: flutter build web

# 3. Try the API
#    Import the Postman collection; run "0 · Authentication > Start session" first.
```

The backend serves **both** the REST API (`/api/*`) and the static web demo
(`/` storefront + `/dashboard` control center), so a single process is the whole demo.

---

## Architecture (one minute)

```
Shopper (web / Flutter)  ──natural language──▶  AI agent (provider-agnostic chain)
                                                       │ restricted tools only:
                                                       │   search catalog, get product, prep cart
                                                       ▼
                                            Backend (Node/TS/Express)  ◀── owns ALL prices
                                                       │  /api/orders/create  → re-prices, enforces policy
                                                       │  BLOCK before PayPal  (authoritative)
                                                       ▼
                                            PayPal Orders API (sandbox)  ◀── human approves
                                                       │  /capture  (idempotent) + webhook (sig-verified)
                                                       ▼
                                            AG Grid dashboard + policy-events audit trail
```

- **AI provider chain (resilient):** Gemini → Groq → Cerebras → OpenRouter → OpenAI,
  with automatic fallback on 429/5xx and retired models; designed graceful
  degradation (HTTP 503 `AI_UNAVAILABLE`) under free-tier rate limits.
- **Ops Copilot (merchant):** powered by the **PayPal Agent Toolkit**, configured
  **read-only** (8 read tools, 0 write tools, enforced by a test + by-name
  allow-list). Answers "what was blocked today and why?" but **refuses** any refund
  or payment write.

---

## Security model

This is the project's core idea: *the agent is useful but never dangerous with money.*

| Threat | Control |
| --- | --- |
| Agent sets its own prices | Server re-derives every price from the catalog at `/orders/create`; client numbers are never trusted. |
| Agent pays without approval | The AI has **no PayPal credential**. Capture requires an explicit human approval at PayPal, then `/capture`. |
| Client lies about origin | `Origin` (`AI_AGENT`/`HUMAN`) is attributed **server-side** from a prepared-cart marker, never from the body. |
| Policy bypass | An authoritative policy evaluation runs **before** any PayPal call; `BLOCK` returns 403 and creates no order. |
| Webhook spoofing | Every webhook is verified against PayPal's signature API; bad signatures → 401. |
| Double capture | Dual-layer idempotency (client `Idempotency-Key` → `PayPal-Request-Id`) + a per-order capture lock. |
| Ops Copilot abuse | Read-only by construction; a by-name allow-list refuses any write tool the model requests. |
| Prompt injection | Model refused a "place the order / refund" injection with **zero tool calls** in live testing. |

Every allow/confirm/block decision is written to an **immutable audit trail**
(`GET /api/policy-events`) with amount, origin, and violated rules — the backbone of
the dashboard and the observability story.

---

## Prize mapping

| Prize | Where it lives in this repo |
| --- | --- |
| **Agentic Commerce** (grand) | Agent builds cart → human authorizes PayPal → server captures. Core flow. |
| **PayPal + AI** | PayPal Orders API (create/capture) + PayPal Agent Toolkit (read-only Ops Copilot) + provider-agnostic AI. |
| **AG Grid** | `public/dashboard.js` + `public/dashboard.html`: grouping, sum aggregation, status bar, custom cell renderers, CSV export, live 5 s refresh, theming. |
| **APIMatic** | `openapi.json` (OpenAPI 3.0, 22 paths) — SDK-ready. |
| **Render** | `source/apps/backend/render.yaml` hosts a complete live demo. |
| **Postman** | `postman/*.json` — full collection, auth flow, examples, tests. |
| **Channel3** | OpenAPI + Postman + this runbook = developer can integrate in minutes. |
| **Elastic** | `policy-events` audit stream is structured and ready to ship to Elastic (`policySnapshot` captured). |
| **Creativity** | "Agent can never touch money" — server-owned pricing + human-gated payments + read-only copilot. |
| **Impact** | Accessible conversational commerce for people who struggle with search/filter UIs. |
| **Demo Delivery** | `<3 min` video (see `DEMO_VIDEO_SCRIPT.md`) + live demo + docs + Postman. |
| **Bryntum** | Not used — scheduling/Gantt is not core to this commerce flow; documented honestly (no forced integration). |

---

## Judging criteria → where to look

| Criterion | Evidence in the repo |
| --- | --- |
| **Technological Implementation** | Provider-agnostic AI chain, PayPal Orders API + webhook signature verification, idempotent capture, `render.yaml`, `openapi.json`, 347 Jest tests + stress harness (`reports/stress/`). |
| **Design** | `/dashboard` AG Grid control center, accessible storefront, clear human-approval UX, light/dark theming. |
| **Potential Impact** | Conversational commerce for non-experts; reusable "safe agentic payments" pattern. |
| **Innovation / Idea** | Server-owned pricing + human-gated capture + read-only copilot = a safer mental model for agentic commerce. |
| **Presentation** | `DEMO_VIDEO_SCRIPT.md`, live demo, `HACKATHON.md`, `JUDGES_ANALYSIS.md`, `SUBMISSION.md`. |

---

## Demo video

See [`DEMO_VIDEO_SCRIPT.md`](./DEMO_VIDEO_SCRIPT.md) for the shot-by-shot, <3-minute
storyboard (voiceover + on-screen actions + timing). The narrative: problem → agent
prepares cart → server enforces price + policy → human approves PayPal → dashboard
proves it → Ops Copilot shows read-only audit.

---

## Repository layout

```
source/apps/backend/      Node/TS/Express API + web demo (serves / and /dashboard)
source/apps/flutter_app/ Flutter Android/iOS (and web) shopper app
postman/                 Full Postman collection + environment
openapi.json             OpenAPI 3.0 spec (22 paths)
render.yaml              Render deploy (hosts the live demo)
SUBMISSION.md            Submission notes + proven-live evidence
JUDGES_ANALYSIS.md       Per-judge empathy analysis + gap closures
DEMO_VIDEO_SCRIPT.md     <3 min demo storyboard
reports/stress/          Sustained + spike load test results
```

---

## Notes for the testing judge

- The hosted demo may show `503 AI_UNAVAILABLE` on rapid back-to-back chats on the
  **free** AI tiers; this is designed graceful degradation and recovers after the
  provider cooldown (~60 s). Catalog, policy preview, orders (when PayPal is set),
  dashboard, and Ops status all work without an AI key.
- Ops Copilot requires the `OPS_COPILOT_KEY` (shared via the private
  testing-instructions field); without it the dashboard shows "Ops Copilot is
  disabled" and `/api/ops/ask` returns `503`.
- The repo is public with the MIT license in the GitHub About section.

# AI Café

**Shop by intent. Review every item. Approve every payment.**

AI Café is a mobile agentic-commerce prototype for the PayPal + AI hackathon.
Tell the café assistant what you need and what you can spend. Its AI searches
the live product catalog, prepares a cart using server-owned prices, and hands
off to PayPal sandbox only after you choose to check out.

## Live demo

- **URL:** https://paypal-commerce-agent.onrender.com
- The backend runs on a free-tier instance that sleeps when idle, so the
  **first load may take up to 60 seconds**.

## Quick start (3 steps, run locally)

```bash
git clone https://github.com/oemeraydemir/paypal-commerce-agent.git
cd paypal-commerce-agent/apps/backend && npm install
npm run dev            # then open http://localhost:3000
```

(For a production-style run use `npm run build && npm start`.)

## Explore without keys

You can browse the 25-item menu, build a cart, watch the **server-side policy
meter**, and open the **Agent Control Center** (`/dashboard.html`) with no
AI or PayPal credentials — only a live PayPal sandbox payment needs keys.
See [Try it in your browser](#try-it-in-your-browser--no-emulator-needed)
below for the scenario table.

## License & architecture

- **MIT License** — see [LICENSE](./LICENSE).
- **Architecture** — see [apps/backend/ARCHITECTURE.md](./apps/backend/ARCHITECTURE.md).
- **Older reports** — see [_ARCHIVE_OLD_REPORTS](./_ARCHIVE_OLD_REPORTS).

## Why this matters

Shoppers should be able to describe an outcome instead of navigating filters
and building every cart by hand. AI Café demonstrates that experience without
giving an AI agent authority over money:

1. An OpenAI-compatible model interprets a natural-language shopping request
   and calls catalog-search and cart-preparation tools. The provider chain is
   **Gemini → Groq → Cerebras → OpenRouter → OpenAI** — a free Groq or Gemini
   key is enough, and OpenAI is optional (see
   [AI provider setup](#ai-provider-setup)).
2. The backend—not the model or the app—selects prices and validates quantities.
3. The shopper reviews the cart and approves the order on PayPal sandbox.
4. Only then can the backend capture payment and reconcile the order.

The AI has no PayPal tool, credential, or payment endpoint access.

## Try it in your browser (no emulator needed)

The backend serves a responsive web storefront, so the full flow runs with only Node.js:

```bash
git clone https://github.com/oemeraydemir/paypal-commerce-agent.git
cd paypal-commerce-agent/apps/backend
npm install
cp .env.example .env    # then add ONE free AI key (Groq or Gemini); PayPal keys optional
npm run dev             # open http://localhost:3000
```

For local browser runs set `PAYPAL_RETURN_URL=http://localhost:3000/api/checkout/return` and
`PAYPAL_CANCEL_URL=http://localhost:3000/api/checkout/cancel`. Desktop browsers return from PayPal
to the web app, where you press **Confirm payment**; phones offer the Flutter deep link plus a
visible "Continue in the browser" fallback. The AG Grid dashboard is at `/dashboard.html`.

### Policy transparency and one-click scenarios

Every cart change calls `POST /api/policy/preview`, which runs the **same** validation and
`PolicyService` as `POST /api/orders/create` (side-effect free: no order, reservation, PayPal call
or audit event). The page shows a meter against the EUR 20 maximum with the EUR 10 approval
threshold marked, plus a per-rule checklist (per-purchase limit, approval threshold, daily budget,
blocked attributes, approved merchant). The UI only mirrors the server's answer; `/orders/create`
re-evaluates and remains the sole authority. The "Try a scenario" buttons work without AI or
PayPal credentials:

| Scenario | Cart | Server decision |
|---|---|---|
| Everyday order | Vegetarian Breakfast + Coffee, EUR 13 | `REQUIRE_CONFIRMATION` |
| Quick coffee | Coffee, EUR 3 | `AUTO_ALLOW` |
| Over the limit | Breakfast + Premium Cake, EUR 55 | `BLOCK` (per-purchase limit) |
| Team order | Office Pastry Box, EUR 38 | `BLOCK` (per-purchase limit) |
| Alcohol request | Winter Mulled Wine, EUR 5.50 | `BLOCK` (blocked attribute) |

The catalog now has 25 products in 7 categories (breakfast, lunch, drinks, desserts, snacks, gifts,
catering) with dietary labels; the web menu renders `GET /api/catalog` directly.

## AI provider setup

The agent talks to any **OpenAI-compatible** provider. You only need **one** key — a free
Groq or Gemini key is enough — and OpenAI is optional and last in the chain.

| Order | Provider | Key env var | Model env var (comma-separated, first = preferred) | Where to get a free key |
|---|---|---|---|---|
| 1 | Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` (default `gemini-3.6-flash,gemini-3.5-flash`) | https://aistudio.google.com/apikey |
| 2 | Groq | `GROQ_API_KEY` | `GROQ_MODEL` (default `openai/gpt-oss-120b,llama-3.3-70b-versatile`) | https://console.groq.com/keys |
| 3 | Cerebras | `CEREBRAS_API_KEY` | `CEREBRAS_MODEL` | https://cloud.cerebras.ai |
| 4 | OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | https://openrouter.ai/keys |
| 5 | OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` (default `gpt-4o-mini`) | https://platform.openai.com/api-keys |

- A provider is **active only when its key is set**; the attempt order is controlled by
  `AI_PROVIDER_ORDER` (default `gemini,groq,cerebras,openrouter,openai`).
- Each `*_MODEL` accepts a **comma-separated list**. If a model has been retired (HTTP 404) the
  next model of the same provider is tried first; a model that 404s is skipped for the life of the
  process, and a provider is disabled only once all of its models are gone.
- A provider that returns 429/5xx/timeout is cooled down and the next provider is tried. When every
  provider is exhausted the API returns **503 `AI_UNAVAILABLE`** ("AI is temporarily at capacity…")
  instead of a generic 500.
- `npm run ai:check` prints a PASS/FAIL table per provider (with the `/models` ids and which
  configured model was actually used) and **never prints keys**.

**Never commit keys.** Put them in `apps/backend/.env` locally (git-ignored) and in the host's
environment-variable panel in production (e.g. Render). `.env.example` and `render.yaml` list the
variable **names** only.

## Ops Copilot: a second, read-only PayPal + AI integration

The merchant dashboard (`/dashboard.html`) includes an **Ops Copilot**, built on the official
[`@paypal/agent-toolkit`](https://github.com/paypal/agent-toolkit) (OpenAI adapter). It answers
questions such as "which payments were blocked today and why?" by combining live PayPal sandbox data
(`list_transactions`, `get_order`, `list_disputes`, `get_dispute`, `list_invoices`, `get_invoice`,
`get_refund`, `get_shipment_tracking`) with AI Café's policy audit trail.

It is deliberately **read-only**, with two independent layers:

1. The toolkit is configured with read permissions only. Verified offline by a test: of the toolkit's
   47 tools, exactly these 8 are exposed.
2. Every tool call the model requests is checked by name before it reaches PayPal. A hallucinated or
   prompt-injected `pay_order`, `create_refund` or `send_invoice` is refused and shown as such.

The shopper-facing agent still has **no** PayPal tool at all, and payments are approved only by the
shopper. Because the copilot reads merchant data and spends OpenAI credits, it is **off by default**
and requires `OPS_COPILOT_ENABLED=true` plus `OPS_COPILOT_KEY` (16+ characters, sent as the
`X-Ops-Key` header, compared in constant time, rate limited per IP). The PayPal environment stays
sandbox-only.

## What is in the prototype

- Flutter Android/iOS app with an AI chat, guided example requests, searchable
  product chips, editable combined AI/manual cart, service readiness, and
  PayPal approval/return flow. Shoppers can save dietary preferences and a
  cart budget on-device; the backend applies these as constraints to AI
  discovery and validates every AI-prepared cart against them.
- Node.js, TypeScript, and Express API using OpenAI-compatible function
  calling and the PayPal Orders API in **sandbox only**.
- Authoritative catalog pricing, order idempotency, webhook verification, and
  clear separation between AI cart preparation and human-authorized payment.
- Public, read-only operations dashboard built with AG Grid.

The order store is in-memory and clears on server restart. This is a hackathon
prototype, not a production payment service.

The optional shopper profile is stored locally on the device. Its dietary
preferences and budget are sent to the backend with AI shopping requests.
Catalog dietary labels are informational and are not an allergen or
cross-contamination guarantee.

## Requirements

- Flutter SDK and Android Studio with an Android emulator (or an iOS Simulator
  on macOS).
- Node.js 20 or newer.
- At least one AI provider key for live AI requests — a free Groq or Gemini key
  is enough, and OpenAI is optional (see [AI provider setup](#ai-provider-setup)).
- PayPal Developer account sandbox REST app credentials and a sandbox buyer
  account for the complete payment demo. No live credentials are supported.

## Configure and run on Android emulator

Open PowerShell in the repository root.

1. Configure the backend:

   ```powershell
   cd apps/backend
   npm install
   Copy-Item .env.example .env
   ```

2. Open `apps/backend/.env` locally and set:

   ```dotenv
   # ONE free AI key is enough (Gemini or Groq); OpenAI is optional.
   GEMINI_API_KEY=your-gemini-key        # or: GROQ_API_KEY=your-groq-key
   PAYPAL_ENABLED=true
   PAYPAL_ENV=sandbox
   PAYPAL_CLIENT_ID=your-paypal-sandbox-client-id
   PAYPAL_CLIENT_SECRET=your-paypal-sandbox-secret
   PAYPAL_RETURN_URL=http://10.0.2.2:3000/api/checkout/return
   PAYPAL_CANCEL_URL=http://10.0.2.2:3000/api/checkout/cancel
   ```

   Get PayPal credentials and a buyer account from the PayPal Developer
   Dashboard, and a free AI key from
   [AI provider setup](#ai-provider-setup). Never put API keys in the Flutter
   app or commit `.env`.

3. Start the API in this terminal:

   ```powershell
   npm run dev
   ```

   Confirm `http://localhost:3000/api/health` reports both `ai.enabled` and
   `paypal.enabled` as `true`.

4. In a second terminal, build and launch the app:

   ```powershell
   cd apps/flutter_app
   flutter pub get
   flutter run
   ```

   The default API address `10.0.2.2:3000` connects the Android emulator to the
   backend running on your computer.

5. Ask for “a vegetarian breakfast for two under €20,” review and adjust the
   AI-prepared cart, then choose **Review & pay**. Approve with a PayPal
   sandbox buyer account. The browser returns through the backend to AI Café;
   confirm capture in the app.

If using a physical device, desktop, web, or a hosted API, set
`--dart-define=API_BASE_URL=http://<reachable-backend-host>:3000` when running
Flutter. For a hosted PayPal demo, configure the PayPal return and cancel URLs
to the backend's public HTTPS `/api/checkout/return` and `/api/checkout/cancel`
routes.

## Run the dashboard

With the backend running, open `http://localhost:3000/dashboard.html`. It
provides public, read-only order and payment metrics for the demo.

## Validate

```powershell
cd apps/backend
npm test -- --runInBand
npm run build

cd ../flutter_app
flutter test
flutter analyze
```

`npm run e2e:smoke` is an optional real PayPal sandbox smoke test and requires
valid sandbox credentials. Unit and integration tests mock external payment
and AI services and do not charge or call those providers.

## Tools used

| Tool | How it is used |
| ---- | -------------- |
| OpenAI-compatible LLM chain (Gemini → Groq → Cerebras → OpenRouter → OpenAI; automatic fallback, a free key is enough) | Interprets shopping intent and invokes restricted catalog/cart tools |
| PayPal Orders API | Creates and captures buyer-approved sandbox payments |
| AG Grid | Displays live order and payment metrics in the read-only dashboard |
| Flutter | Builds the shopper's Android/iOS application |
| Node.js, TypeScript, Express | Hosts the catalog, AI orchestration, PayPal API, and webhook service |

No other hackathon sponsor tools are claimed.

## Hackathon submission checklist

- Source code and run instructions: included in this repository.
- Open-source license: see [LICENSE](./LICENSE).
- Public repository: publish this project to a public GitHub, GitLab, or
  Bitbucket repository before submitting; add its URL to
  [the submission notes](./apps/backend/SUBMISSION.md).
- Functional demo: run locally with sandbox credentials using the steps above,
  or deploy the backend and record its public URL in the submission notes.
- Demo video: record the app running on the emulator, keep it under three
  minutes, upload it publicly to YouTube, and add the URL to the submission
  notes.
- Project description and tool usage: summarized above and in the submission
  notes.

See [the demo checklist](./apps/backend/DEMO_CHECKLIST.md) and
[the architecture](./apps/backend/ARCHITECTURE.md) for more detail.

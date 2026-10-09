# AI Café

**Shop by intent. Review every item. Approve every payment.**

AI Café is a mobile agentic-commerce prototype for the PayPal + AI hackathon.
Tell the café assistant what you need and what you can spend. Its AI searches
the live product catalog, prepares a cart using server-owned prices, and hands
off to PayPal sandbox only after you choose to check out.

## Why this matters

Shoppers should be able to describe an outcome instead of navigating filters
and building every cart by hand. AI Café demonstrates that experience without
giving an AI agent authority over money:

1. OpenAI interprets a natural-language shopping request and calls
   catalog-search and cart-preparation tools.
2. The backend—not the model or the app—selects prices and validates quantities.
3. The shopper reviews the cart and approves the order on PayPal sandbox.
4. Only then can the backend capture payment and reconcile the order.

The AI has no PayPal tool, credential, or payment endpoint access.

## What is in the prototype

- Flutter Android/iOS app with an AI chat, guided example requests, searchable
  product chips, editable combined AI/manual cart, service readiness, and
  PayPal approval/return flow. Shoppers can save dietary preferences and a
  cart budget on-device; the backend applies these as constraints to AI
  discovery and validates every AI-prepared cart against them.
- Node.js, TypeScript, and Express API using OpenAI function calling and the
  PayPal Orders API in **sandbox only**.
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
- An OpenAI API key for live AI requests.
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
   OPENAI_API_KEY=your-openai-api-key
   PAYPAL_ENABLED=true
   PAYPAL_ENV=sandbox
   PAYPAL_CLIENT_ID=your-paypal-sandbox-client-id
   PAYPAL_CLIENT_SECRET=your-paypal-sandbox-secret
   PAYPAL_RETURN_URL=http://10.0.2.2:3000/api/checkout/return
   PAYPAL_CANCEL_URL=http://10.0.2.2:3000/api/checkout/cancel
   ```

   Get PayPal credentials and a buyer account from the PayPal Developer
   Dashboard. Never put API keys in the Flutter app or commit `.env`.

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
| OpenAI GPT-4o-mini | Interprets shopping intent and invokes restricted catalog/cart tools |
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

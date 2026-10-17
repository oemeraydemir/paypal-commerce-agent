# Contributing to AI Café

Thanks for looking! The project is MIT-licensed and small enough to read in an afternoon.

## Run it (no keys needed to explore)

```bash
cd source/apps/backend
npm install
npm run dev            # http://localhost:3000  (storefront)  /dashboard.html  (AG Grid dashboard)
npm test               # unit + integration; PayPal and AI are mocked, nothing is charged
npm run mcp:demo       # scripted external agent talking to /api/mcp
```

Optional: copy `.env.example` to `.env` and add one free AI key (Gemini or Groq) and PayPal **sandbox**
credentials for the live flows. Never commit `.env`; live PayPal is intentionally unsupported.

## Ground rules that keep the project safe

1. **The model never touches money.** No AI tool, MCP tool or Ops Copilot tool may capture, pay or refund.
   `tests/integration/mcp.test.ts` and `tests/unit/tool-executor.test.ts` guard this — keep them green.
2. **The server owns prices and policy.** Clients, agents and models send product ids and quantities only.
3. **Rule-based answers are labelled.** Anything that is not AI must not be attributed to `AI_AGENT`.
4. Add a test with every behaviour change; run `npx tsc --noEmit` and `npm test` before opening a PR.

## Where things live

`src/ai` agent + rule-based fallback · `src/routes/mcp.ts` MCP adapter · `src/policy` spending policy ·
`src/orders` order lifecycle · `src/paypal` PayPal client/webhooks · `public/` web storefront + dashboard.

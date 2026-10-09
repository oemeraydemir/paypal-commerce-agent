# Sprint 1 — Exit Report (Backend Foundation + Catalog)

**Status:** ✅ Complete — all 10 critical fixes implemented, all acceptance criteria met.

## Verification evidence

### 1. `npm install` succeeds
```
added 426 packages in 58s
```
### 2. `npm run dev` starts WITHOUT PayPal credentials
```
🚀 Server running on port 3000
📡 Environment: development
💳 PayPal: disabled (S1 mode)
🌐 CORS: http://localhost:3001
```
(PayPal block is optional in S1; validated only when `PAYPAL_ENABLED=true` or `NODE_ENV=production`.)

### 3. `GET /api/health` → 200 JSON
```json
{
  "status": "ok",
  "timestamp": "2026-10-07T18:47:52.478Z",
  "service": "paypal-commerce-agent-backend",
  "version": "1.0.0",
  "environment": "development",
  "uptime": 15.11,
  "paypal": { "enabled": false }
}
```

### 4. `GET /api/catalog` → 8 products with `priceMinor` + `dietary` + `occasion`
count = 8. Sample (first 3):
| id | priceMinor | dietary | occasion |
|----|-----------|---------|----------|
| veg_breakfast | 1000 | ["vegetarian"] | ["breakfast","workday"] |
| coffee | 300 | ["vegan"] | ["breakfast","workday","meeting"] |
| orange_juice | 350 | ["vegan","gluten-free"] | ["breakfast","refreshment"] |

### 5. `npm test` — all pass, no hanging
```
Test Suites: 2 passed, 2 total
Tests:       11 passed, 11 total
```
(unit: 8 catalog tests incl. maxPriceMinor fix; integration: 3 health/catalog tests via `createApp()` + supertest).

### 6. CORS respects environment origin (no regex/array)
`src/app.ts`: `origin: env.CORS_ORIGIN` → `Access-Control-Allow-Origin: http://localhost:3001`.

### 7. Request logging + secret redaction
`morgan('combined')` stream redacts `Authorization`, `PayPal-*`, `PAYPAL_CLIENT_SECRET`,
`OPENAI_API_KEY`, passwords, and token query values before console output.

### 8. JSON body size limit enforced (100kb)
`express.json({ limit: '100kb' })`; a 288,917-byte POST returns `413 Payload Too Large`.

### 9. No secrets in git
Only `.env.example` is committed; `.env` is git-ignored. `OPENAI_API_KEY` literal absent
from `.env.example` (AI provider key deferred to S4).

### 10. Postman collection + environment import successfully
`postman/paypal-commerce-agent.postman_collection.json` + `..._environment.json`
(environment defines `baseUrl`, `idempotencyKey`, `orderId`).

## Critical-fix confirmations
1. ✅ **app.ts / server.ts separation** — `createApp()` (no listen) + `server.ts` (listen).
2. ✅ **error-handler.ts + AppError** — implemented; also propagates framework `statusCode` (e.g. 413).
3. ✅ **`setInterval().unref()`** — idempotency cleanup timer unref'd (no process hang).
4. ✅ **`createRequestFingerprint`** — uses `fast-json-stable-stringify` (key-order stable).
5. ✅ **BusinessConfig policy fields** — `maxOrderValueMinor`, `minOrderValueMinor`, `aiPurchaseRequiresConfirmation`, `allowAutonomousPurchase`.
6. ✅ **OrderOrigin enum** — `HUMAN | AI_ASSISTED | AI_AGENT` replaces `aiGenerated: boolean`.
7. ✅ **Secret redaction policy** — documented in README + enforced in logger.
8. ✅ **JSON body size limit** — `express.json({ limit: '100kb' })`.
9. ✅ **OPENAI_API_KEY removed from S1** — absent; added in S4.
10. ✅ **PAYPAL_ENV sandbox-first** — defaults to `sandbox`; PayPal optional in S1.

## MaxPriceMinor bug fix (CRITICAL FIX #15)
`catalog/search` uses `query.maxPriceMinor !== undefined` (not a truthy check) so a
`maxPriceMinor: 0` ceiling is honored. Regression-guarded by a unit test.

## Not in scope (deferred per HARD NOT-LIST)
PayPal API (S2), OpenAI (S4), Flutter (S5), webhooks (S6), AG Grid (S7), demo video (S8).

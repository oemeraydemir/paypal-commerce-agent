# Sprint 3 — Exit Report (AI Agent + Function Calling)

**Status:** ✅ Complete — OpenAI function calling implemented with a hard safety boundary;
**37 tests pass** across 6 suites.

## Installed versions
- `openai`: **4.104.0** (acceptance #1 ✅)
- Model: `gpt-4o-mini`, `temperature: 0.3`, `tool_choice: 'auto'`

## Tool definitions (allowed allowlist — acceptance #3)
| Tool | Purpose | Payment? |
|------|---------|----------|
| `search_products` | Catalog search (category/tags/dietary/occasion/price) | ❌ |
| `get_product_details` | Single product detail | ❌ |
| `prepare_cart` | Build cart w/ authoritative catalog pricing | ❌ |

`ALLOWED_TOOLS` is a hardcoded const tuple; anything else (e.g. `capture_payment`,
`create_paypal_order`, `refund_payment`) is rejected — at both the executor (`Unknown tool`)
and the service (`Unauthorized tool`) layers.

## Test results
```
Test Suites: 6 passed, 6 total
Tests:       37 passed, 37 total
```
- `tests/unit/tool-executor.test.ts` (5) — search / details / prepare_cart pricing / duplicate
  rejection / unknown-tool rejection
- `tests/integration/ai.test.ts` (4) — chat reply, rate-limit 429, multi-round loop,
  safety-boundary rejection
- (plus S1/S2 suites: catalog unit, health integration, orders unit + integration)

## Acceptance-criteria evidence
1. ✅ `openai` installed (4.104.0)
2. ✅ AI client **lazy-loaded** — `OpenAI` constructed on first `chat()` call, never at import;
   app boots without `OPENAI_API_KEY` and `/api/ai/chat` returns `503 OpenAI not configured`.
3. ✅ 3 tools defined (`AI_TOOLS`), payment tools absent
4. ✅ Tool executor validates inputs, returns structured results (with `priceFormatted`)
5. ✅ Multi-round loop, `MAX_TOOL_ROUNDS = 5` (test drives search → prepare_cart → reply,
   `toolRounds >= 2`, `checkoutReady: true`)
6. ✅ Rate limiting: 10 req/min/session → 11th returns `429` (retryAfter included)
7. ✅ Safety boundary: AI never calls PayPal tools — `unknown tool rejected` (unit) +
   disallowed-tool → `500` (integration). Structurally, `src/ai/**` has **zero** imports of
   `paypal` (verified by grep).
8. ✅ `prepare_cart` uses backend-authoritative pricing (`totalMinor 1600` for coffee×2 +
   veg_breakfast×1; `600` for coffee×2) — never trusts client-supplied prices
9. ✅ Duplicate products in cart rejected (`Duplicate product in cart`)
10. ✅ Integration tests pass (OpenAI fully mocked — no real network calls)
11. ✅ Unit tests pass
12. ✅ AI routes mounted in `app.ts` (`app.use('/api', aiRoutes)`)
13. ✅ Conversation history bounded (max 20 messages kept; 30-min TTL cleanup, `unref()`'d timer)
14. ✅ TypeScript clean (`tsc --noEmit` exit 0)

## Critical-safety-boundary architecture
```
User → /api/ai/chat → AIService (multi-round) → executeTool (catalog only)
                                        │
                                        └─ prepare_cart → { items, totalMinor, currency }  (NO PayPal)
                                            │
                                            ▼
                                  USER CONFIRMATION (client side)
                                            │
                                            ▼
                          /api/orders/create → PayPal  (never called by the AI)
```
The AI module (`client/tools/tool-executor/service`) imports only `openai`, `env`,
`catalog`, and `business-config`. It has no reference to `PayPalClient` or the PayPal SDK.
The ONLY bridge to payment is the existing `/api/orders/create` endpoint, invoked by the
client/app after the user confirms.

## Corrections / notes beyond the spec
- Added `unref()` to the AI rate-limit cleanup timer (consistent with the S1 idempotency fix)
  so it never keeps the test process alive.
- `tool_choice: 'auto'` only when tools are present (avoids SDK validation errors on no-tools calls).
- `OPENAI_API_KEY` is now enabled in `.env.example` (previously deferred); it is gated behind
  presence in `environment.ts` (`aiEnv` / `isAIEnabled()`).

## Example conversation flow (mocked in tests)
```
User:        "breakfast for 2"
AI round 1:  search_products({ query: "breakfast" })            → catalog hits
AI round 2:  prepare_cart({ items: [{ coffee x2 }] })            → totalMinor 600, EUR
AI round 3:  "Here is your cart. Proceed to checkout?"          → checkoutReady: true
```
The client then calls `POST /api/orders/create` (with the same items) for the real PayPal flow.

## Local validation commands
```bash
cd apps/backend
npm install
npm test                 # 37 passing
npm run dev              # boots; /api/ai/chat → 503 until OPENAI_API_KEY set
```

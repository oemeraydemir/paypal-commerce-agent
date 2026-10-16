# Sprint 2 — Exit Report (PayPal Orders API + Idempotency)

**Status:** ✅ Complete — all 10 critical PayPal fixes implemented, 28 tests passing.

## Installed versions
- `@paypal/paypal-server-sdk`: **2.5.0** (acceptance #1 ✅, `>=2.5.0`)
- `uuid`: 9.0.1 (order IDs)
- Correct SDK API confirmed: `OrdersController.createOrder(req)` / `captureOrder(req)` with
  `paypalRequestId` as a top-level request field (NOT the old `ordersCreate`/`OrdersCreateRequest`).

## Test results
```
Test Suites: 4 passed, 4 total
Tests:       28 passed, 28 total
```
- `tests/unit/catalog.test.ts` (8) — unchanged from S1
- `tests/integration/health.test.ts` (3) — unchanged from S1
- `tests/integration/orders.test.ts` (9) — mock-based, **no real PayPal calls**
- `tests/unit/orders.test.ts` (8) — state machine + currency/quantity invariants

Smoke test (`tests/smoke/paypal-smoke.test.ts`) is **excluded** from `npm test`
(`testPathIgnorePatterns`) and runs only via `npm run test:smoke` with real credentials.

## Critical-fix confirmations
1. ✅ **PayPal-Request-Id (dual-layer)** — `client.ts` passes `paypalRequestId` on both
   `createOrder` and `captureOrder`; route reuses the same `Idempotency-Key` for it.
2. ✅ **@paypal/paypal-server-sdk API** — uses `Client`/`OrdersController`/`createOrder`/`captureOrder`.
3. ✅ **5xx not cached** — idempotency caches only `200–499`; 5xx (`>=500`) is never stored, so a
   PayPal outage doesn't poison the cache. Covered by the "5xx is NOT cached" test (retry → 200).
4. ✅ **Lock leak fixed** — caching moved to `res.on('finish')`; the lock (`pendingRequests`) is
   always released on finish, even if `res.json` is never called.
5. ✅ **State machine validated** — `TRANSITIONS` table + `updateStatus` throws on invalid
   transitions; terminal states are closed. Covered by unit tests.
6. ✅ **PayPal error mapping** — `ORDER_ALREADY_CAPTURED→409`, `INSTRUMENT_DECLINED→402`,
   `ORDER_NOT_APPROVED→400`, else `502`. Covered by two tests.
7. ✅ **aiGenerated server-side** — `OrderOrigin.HUMAN` set in the route (never read from client);
   `AI_AGENT` reserved for S4. Response includes `origin: "HUMAN"`.
8. ✅ **Concurrent idempotency race** — `pendingRequests` map; a second concurrent request with the
   same key waits and returns the first result. Covered by "concurrent same key" test.
9. ✅ **Currency invariant** — `validateOrderItems` throws 400 on product/business currency mismatch.
   Covered by unit test (USD product rejected against EUR business).
10. ✅ **Item-total invariant** — route recomputes the line sum and asserts `=== order.totalMinor`.

## Acceptance-criteria evidence
- Quantity validation (FIX #12): integer, `>0`, `<=100` — `validateOrderItems` + `OrderService.create`.
- Authoritative pricing: test asserts `totalMinor === 1600` for `coffee×2 + veg_breakfast×1`.
- Capture flow: `create` → `PAYMENT_PENDING` → `capture` → `PAID` with `paypalStatus: COMPLETED`.
- Mock tests: **all pass, zero real PayPal network calls** (client fully mocked).
- Runtime check: server boots in PayPal-disabled mode (lazy client → no crash) and `/orders/create`
  returns `503 PayPal not configured`, while `/api/catalog` still serves 8 products.

## Engineering corrections made beyond the spec (documented)
- **Lazy PayPal Client construction** — the SDK `Client` is built on first use, not at module load.
  Building it eagerly (as in the prompt's literal snippet) would read `env.paypal!.*` and crash the
  whole app whenever PayPal is disabled (S1 mode). Routes already return 503 before calling the client.
- **Extracted `validateOrderItems`** (`src/orders/validation.ts`) so the currency (FIX #9) and
  quantity (FIX #12) invariants are pure, testable functions — gives them real passing tests instead
  of only inline checks.
- **`app.ts` mounts order routes** (per the S1 app/server split) rather than `server.ts`; `server.ts`
  only calls `listen()`.

## AI agent tool boundary (for S4)
- `OrderOrigin.HUMAN` is the only origin set today. S4's AI endpoint must set `OrderOrigin.AI_AGENT`
  server-side and must route payment actions through the same `/orders/create` + `/orders/:id/capture`
  endpoints — it must NOT call PayPal directly. `getStats()` already segments revenue by
  `origin === AI_AGENT`.
- No OpenAI/Flutter/webhook code added (HARD NOT-LIST honored).

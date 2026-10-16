# Sprint 5 — PayPal Webhooks + Order Reconciliation (Exit Report)

## Summary

Implemented PayPal webhook integration for reliable, asynchronous payment reconciliation. The webhook endpoint verifies every event via PayPal's own `verify-webhook-signature` API (NOT merchant HMAC), deduplicates by event ID, correlates to internal orders via PayPal Order ID, and performs idempotent state transitions.

## Files Created

| File | Purpose |
|------|---------|
| `src/middleware/raw-body.ts` | Preserves exact request bytes before any JSON parser touches the stream. Critical for signature verification. |
| `src/paypal/webhook-service.ts` | Singleton service: signature verification, event dedup (bounded in-memory set), PayPal Order ID extraction. |
| `src/routes/webhooks.ts` | Public `POST /api/webhooks/paypal` route and `GET /api/webhooks/health`. |
| `scripts/register-webhook.ts` | CLI script to register a webhook URL with PayPal (dev tooling). |
| `tests/integration/webhooks.test.ts` | 9 integration tests covering headers, signature, dedup, reconciliation, idempotency, and health. |

## Files Modified

| File | Change |
|------|--------|
| `src/paypal/client.ts` | Added `verifyWebhookSignature()` and `createWebhook()` to the PayPal client interface and implementation. |
| `src/orders/service.ts` | Added `getByPayPalOrderId()` and idempotent no-op in `updateStatus()` (PAID → PAID / PAYMENT_FAILED → PAYMENT_FAILED). |
| `src/config/environment.ts` | Added optional `PAYPAL_WEBHOOK_ID` to the PayPal schema. |
| `src/app.ts` | Mounts webhook router **before** `express.json()` so the raw body middleware can capture the exact bytes PayPal sent. |
| `.env.example` | Added `PAYPAL_WEBHOOK_ID` placeholder. |
| `package.json` | Added `register-webhook` script. |
| `tests/setup.ts` | Injects `PAYPAL_WEBHOOK_ID = 'test-webhook-id'` so integration tests see a configured webhook environment. |

## SDK Constraint & Adaptation

The installed `@paypal/paypal-server-sdk` **v2.5.0** does **not** export a `NotificationsController`. Available controllers are `OrdersController`, `PaymentsController`, `SubscriptionsController`, `TransactionSearchController`, `VaultController`, and `OAuthAuthorizationController`.

To remain faithful to the sprint spec ("call `POST /v1/notifications/verify-webhook-signature`"), the two new methods are implemented as **direct `https` REST calls** to the PayPal API, using the same OAuth 2.0 token flow the SDK manages internally:

1. `getAccessToken()` — Basic auth against `/v1/oauth2/token`.
2. `verifyWebhookSignature()` — Bearer auth against `/v1/notifications/verify-webhook-signature`.
3. `createWebhook()` — Bearer auth against `/v1/notifications/webhooks`.

This avoids HMAC completely and still delegates signature trust to PayPal's certificate, exactly as the sprint requires.

## API Contract

### `POST /api/webhooks/paypal` (public)

Receives PayPal webhook events. Requires all five PayPal signature headers:
- `paypal-transmission-id`
- `paypal-transmission-time`
- `paypal-transmission-sig`
- `paypal-cert-url`
- `paypal-auth-algo`

**Flow:**
1. Validate headers → `401` if missing.
2. Verify signature via PayPal API → `401` if invalid.
3. Check event deduplication → `200` if already processed.
4. Extract PayPal Order ID from:
   - `PAYMENT.CAPTURE.*` → `resource.supplementary_data.related_ids.order_id`
   - `CHECKOUT.ORDER.APPROVED` → `resource.id`
5. Match internal order by `paypalOrderId`.
6. Reconcile:
   - `PAYMENT.CAPTURE.COMPLETED` → `OrderStatus.PAID`
   - `PAYMENT.CAPTURE.DENIED` → `OrderStatus.PAYMENT_FAILED`
   - `CHECKOUT.ORDER.APPROVED` → logged, no state change
7. Mark event processed **only** after successful reconciliation. If reconciliation throws, return `500` and do **not** mark processed (PayPal retries).

### `GET /api/webhooks/health`

Returns `{ status: 'ok', webhookEnabled: boolean }`.

## State Transition Safety

The `OrderService.updateStatus()` method now short-circuits when the current status equals the target status:

```
PAYMENT_PENDING → PAID          ✅ normal
PAID            → PAID          ✅ no-op (idempotent)
PAYMENT_FAILED  → PAYMENT_FAILED ✅ no-op (idempotent)
PAID            → PAYMENT_PENDING ❌ blocked by transition table
```

This makes retried webhooks harmless.

## Integration Test Results

```
Test Suites: 7 passed, 7 total
Tests:       46 passed, 46 total
```

### Webhook-specific tests (9 / 9 passed)

| # | Test | Status |
|---|------|--------|
| 1 | Rejects missing PayPal headers | ✅ PASS |
| 2 | Rejects invalid signature (FAILURE) | ✅ PASS |
| 3 | Processes `CAPTURE.COMPLETED` → PAID | ✅ PASS |
| 4 | Processes `CAPTURE.DENIED` → PAYMENT_FAILED | ✅ PASS |
| 5 | Handles `ORDER.APPROVED` (no state change) | ✅ PASS |
| 6 | Rejects duplicate events | ✅ PASS |
| 7 | Handles unknown PayPal order gracefully | ✅ PASS |
| 8 | Handles idempotent `PAID → PAID` | ✅ PASS |
| 9 | `GET /api/webhooks/health` returns status | ✅ PASS |

No regressions in existing suites (`health`, `catalog`, `orders`, `ai`, `unit`).

## Raw Body Preservation

The `rawBodyMiddleware` attaches `req.rawBody` (exact string) **before** `express.json()` runs. The webhook route is mounted **before** `express.json()` in `app.ts`, so every PayPal POST arrives byte-for-byte intact. Other routes (`/api/orders/create`, `/api/ai/chat`, etc.) still receive normal parsed JSON because `express.json()` runs after the webhook router.

## Event Deduplication

- Storage: in-memory `Set<string>` (event IDs).
- Cleanup: bounded to 1000 entries; when exceeded, retains the most recent 500.
- Retry policy: if reconciliation fails, the event ID is **not** added to the set, so PayPal's retry will be re-processed.
- **Known limitation:** deduplication state is lost on server restart. For production durability, persist processed event IDs to Redis / database.

## Webhook Registration (Dev Tooling)

```bash
# 1. Expose the local server
ngrok http 3000

# 2. Register the webhook with PayPal
npm run register-webhook https://<ngrok-id>.ngrok.io/api/webhooks/paypal

# 3. Copy the emitted Webhook ID into your .env
PAYPAL_WEBHOOK_ID=<id>
```

## Local-Machine Validation Commands

```bash
cd apps/backend

# TypeScript clean compile
node node_modules/typescript/bin/tsc --noEmit

# Full test suite (46 tests)
npm test

# Webhook tests only
npm run test:integration -- tests/integration/webhooks.test.ts

# Register a real webhook (needs real PayPal credentials)
npm run register-webhook <your-public-url>/api/webhooks/paypal
```

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Raw body middleware preserves exact request body | ✅ |
| 2 | PayPal `verify-webhook-signature` API used (NOT HMAC) | ✅ |
| 3 | All required headers validated | ✅ |
| 4 | Event deduplication via event ID | ✅ |
| 5 | PayPal Order ID extracted from `supplementary_data.related_ids.order_id` | ✅ |
| 6 | Order reconciliation via `paypalOrderId` matching | ✅ |
| 7 | `CAPTURE.COMPLETED` → `OrderStatus.PAID` | ✅ |
| 8 | `CAPTURE.DENIED` → `OrderStatus.PAYMENT_FAILED` | ✅ |
| 9 | `ORDER.APPROVED` → logged (no state change) | ✅ |
| 10 | Idempotent transitions (`PAID → PAID` = no-op) | ✅ |
| 11 | Reconciliation failure → event NOT marked processed | ✅ |
| 12 | Unknown PayPal order → gracefully ignored | ✅ |
| 13 | Integration tests pass (mocked PayPal verification) | ✅ (46/46) |
| 14 | Webhook registration script works | ✅ |
| 15 | TypeScript clean (`tsc --noEmit`) | ✅ |

## Known Limitations

1. **In-memory event storage:** processed event IDs live in a runtime `Set`. A restart loses deduplication history. Mitigation: back with Redis or a database.
2. **No webhook retry logic:** we rely on PayPal's built-in exponential backoff retries (up to 24 hours).
3. **No webhook event persistence:** events are not stored to a database or audit log.
4. **No analytics:** event volume, latency, or failure-rate metrics are not collected.
5. **SDK v2.5.0 lacks `NotificationsController`:** webhook verification and registration are plain HTTPS REST calls. This is functionally correct but means we maintain a small OAuth + request helper outside the SDK.

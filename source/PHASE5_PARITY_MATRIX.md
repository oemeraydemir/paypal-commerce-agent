# PHASE 5 — Web ⇄ Flutter Feature Parity Matrix

Scope: web/Flutter feature parity for the flows listed in the PHASE 5 spec.
Approach: shared backend decision (no business-rule duplication in clients), honest
states, preserve Web i18n/navigation/accessibility, no new chat intents, Split Bill
kept limited.

Legend: ✅ implemented · ◑ partial · ⭘ not present · (shared) server-authoritative
decision, client only renders what the server returns.

| Feature | Web (`public/app.js`) | Flutter | Shared API | Tests |
|---|---|---|---|---|
| Shopper profile (diet/allergens/budget) | ✅ `renderProfileStatus` | ✅ `ShopperProfileProvider` + `shopper_preferences_service.dart` | `/api/wellbeing/preferences` PUT | ✅ `shopper_preferences_test.dart`, `allergens_test.dart` |
| Wellbeing guard: preferences sync | ✅ `syncWellbeing` | ✅ via `ApiService.syncWellbeing` | PUT `/api/wellbeing/preferences` | ✅ |
| Wellbeing guard: checkout decision | ✅ `refreshWellbeing` (blocks checkout if unavailable) | ✅ `CartPolicyStatus` gate in `CheckoutProvider.startCheckout` | POST `/api/wellbeing/check` | ✅ `cart_policy_gate_test.dart`, `prepared_cart_policy_test.dart` |
| Session spending mandate view | ✅ mandate list + status + expiry (`renderCart`/`mandateBlock`) | ✅ `cartMandate` + allowance display in cart sheet | GET `/api/policy`, GET `/api/orders/:id/mandate` | ✅ `checkout_provider_test.dart` |
| Spending mandate limit error | ✅ blocked state + renew | ✅ `requiresMandateRenewal` + renew button | `/api/policy` PATCH/verify | ✅ |
| Cart validation (policy verdict) | ✅ server-repriced | ✅ `policyStatus` checked before order | `/api/policy/preview` | ✅ |
| Normal PayPal checkout (create→approve→capture) | ✅ | ✅ `startCheckout` / `completeCheckout` | `/api/orders/create`, `/capture`, `/pending` | ✅ `checkout_capture_state_test.dart`, `paid_receipt_flow_test.dart` |
| Pickup planner (availability/reserve/release) | ✅ `renderPickup` | ✅ **new** `PickupPlannerSheet` + `pickup_planner.dart`; `reservePickupSlot`/`releasePickupBooking` | `/api/pickup/availability|reserve|release` | ◑ new `refund_pickup_api_test.dart` (author blocked) |
| Pickup link at payment | ✅ `linkPickupBooking` on order | ✅ **new** `PickupLinkSection` on receipt (when booking held) | `/api/pickup/link` | ◑ new test file |
| Order status | ✅ capture/status UI | ✅ `OrderCreateResult` + rescue panel | `/api/orders/:id` | ✅ |
| Refund request + status | ✅ `refundBlock` | ✅ **new** `RefundSection` on receipt | `/api/orders/:id/refund-status`, `/refund-request` | ◑ new `refund_pickup_api_test.dart` |
| Transaction history | ⭘ (receipt-only in both) | ⭘ (receipt-only) | (none dedicated) | — |
| Split Bill | ◑ limited (Web only) | ⭘ (not wired) | `/api/bills` | ◑ backend only |

## Verified gaps closed in this phase

- **Refund parity** — added `RefundSection` widget + `RefundView`/`RefundStatusView`
  models + `fetchRefundStatus`/`requestRefund` API methods; rendered on the paid
  receipt (EN/TR i18n). Client only mirrors the server's customer-safe view; a
  request creates a PROPOSED refund, never moves money.
- **Pickup parity** — added `PickupPlannerSheet` (availability/reserve/release) in
  the cart sheet + `PickupLinkSection` on the receipt, `PickupSlot`/`PickupBooking`
  models, and `fetchPickupAvailability`/`reservePickupSlot`/`linkPickupBooking`/
  `releasePickupBooking` API methods. Capacity math stays server-side; same-session
  ownership enforced by the backend.
- **Transport-error hardening** — `_transportGuard` wraps raw
  `ClientException`/`TimeoutException` into a retryable `ApiException` so no raw
  `SocketException` leaks to the UI; applied on every authenticated call (both
  attempts) and the public endpoints.
- **Release API config** — `resolveBaseUrl` throws in release unless an explicit
  `https://` `API_BASE_URL` is provided; rejects the emulator/cleartext default in
  release builds. (Verified by reading the source; no release build produced here.)

## Build / static verification

- `flutter analyze` → **0 issues** (whole app incl. new files).
- New unit test file `test/refund_pickup_api_test.dart` covers the refund/pickup
  API methods, transport guard, and model parsing.

> **Test-run limitation (environment):** the `flutter_tester` process fails to
> connect in this sandbox (`WebSocketException: Invalid WebSocket upgrade request`)
> for **every** Flutter test, including long-existing ones (`session_service_test.dart`
> fails identically). So the Flutter suite cannot be executed here. I verified the
> new **models** with a standalone Dart harness (19/19 checks passed: refund status
> parsing, `canRequest`/`hasActiveRequest` logic, pickup slot `remaining`/`isFull`,
> booking parsing). The new API-level tests are written but could not be executed;
> they are **not** reported as a pass.

## Remaining limitations

- No real PostgreSQL / PayPal Sandbox run (pg-mem + mocks only, unchanged).
- Browser tests (`tests/browser/`) remain blocked (playwright-core not installed).
- Transaction history is not a dedicated view in either client (both show the
  receipt); no API-only feature was invented to fill it.
- Split Bill stays limited to the Web flow; not wired into Flutter in this phase.

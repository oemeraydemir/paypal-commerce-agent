# PayPal Checkout Recovery Sprint Report

**Sprint:** PAYPAL-CHECKOUT-RECOVERY-01  
**Observed PayPal error:** `ORDER_NOT_APPROVED`  
**PayPal Debug ID:** `f525519ad3f55`  
**Repository HEAD:** `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2`  
**Sandbox E2E:** Not run; no buyer approval/session evidence or Sandbox credentials were supplied to this local session.

## Verdict

**BLOCKED — root cause is not established from the available evidence.** The code contains safeguards against premature capture and wrong order IDs, but the reported PayPal Dashboard entry does not correlate the failed capture with the app's buyer-return callback, internal order, or any prior approval event. No speculative application change was made.

## Source trace

1. `apps/flutter_app/lib/providers/checkout_provider.dart:273-328`, `startCheckout()` creates the order through `api.createOrder()`, stores the returned `OrderCreateResult`, then launches its HTTPS `approvalUrl`.
2. `apps/backend/src/routes/orders.ts:40-41, 255-267`, `POST /orders/create` calls PayPal `createOrder`, stores `paypalOrder.id` on the internal order with `setPayPalOrderId`, and returns both the internal `orderId` and PayPal `paypalOrderId`; it returns the PayPal `approve` link as `approvalUrl`.
3. PayPal returns to `apps/backend/src/routes/checkout.ts:6-43`, which builds `paypalcommerceagent://checkout/success?token=<PayPal token>`. `apps/flutter_app/lib/screens/chat_screen.dart:38-88` receives initial and streamed app links and passes them to `CheckoutProvider.handlePayPalReturn()`.
4. `handlePayPalReturn()` in `checkout_provider.dart:201-229` accepts a success callback only when its `token` exactly matches the pending `paypalOrderId`, then sets `_paypalApproved`. `completeCheckout()` at `checkout_provider.dart:359-424` rejects capture unless that flag is true and passes the internal order's `orderId` to `api.captureOrder()`.
5. `apps/flutter_app/lib/services/api_service.dart:324-331`, `captureOrder()` posts to `/api/orders/<internal orderId>/capture`. The backend checks session ownership and `PAYMENT_PENDING`, then calls PayPal with the stored `order.paypalOrderId` (`apps/backend/src/routes/orders.ts:274-318`). Thus the client and PayPal identifiers are intentionally distinct and mapped server-side.
6. On PayPal `ORDER_NOT_APPROVED`, the capture handler at `orders.ts:345-353` returns controlled HTTP 400 and leaves order/reservation state unchanged. A confirmed completed capture marks the order paid and settles the reservation; ambiguous responses preserve it.

The code path's intended order is therefore: create → launch buyer approval → receive matching PayPal token → user confirms capture → internal order ID request → server captures stored PayPal order ID. However, manual browser confirmation (`confirmApprovalInBrowser()`) can set the local approval flag without a callback; the backend still relies on PayPal to reject an unapproved capture. The reported 422 is consistent with an attempt before PayPal considered the order approved, but does not establish whether this fallback, a return/deep-link issue, a callback timing race, or another cause occurred. Needed evidence is a sanitized correlation of the failed capture's internal and PayPal order IDs, timestamp, app return/callback receipt (including token match), and any PayPal approval event/status for that same PayPal order.

## Changes and tests

- Added this report only. No source or test files were changed because a safe defect-specific correction cannot be selected from current evidence.
- Existing code has focused coverage in `apps/flutter_app/test/checkout_provider_test.dart` for approval token mismatch, success callback and capture path, cancellation, and in `apps/backend/tests/integration/orders.test.ts` for successful capture and PayPal error mapping. `apps/backend/tests/integration/webhooks.test.ts` covers signature validation, approved/completed/denied events, duplicate delivery, and unknown completed captures.
- No new regression test was added: without a confirmed defect, such a test would encode a guessed cause rather than reproduce the failure.

## Validation

| Command | Exit code | Result |
|---|---:|---|
| `git status --short` / `git rev-parse HEAD` | 0 | Recorded before edits. HEAD is `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2`. Existing A1.5/A1.9A working-tree changes and reports were preserved. |
| `npx tsc --noEmit` (backend) | 0 | Passed; no diagnostics. |
| Focused backend Jest: orders, checkout, webhooks, reservation consistency/lifecycle | 0 | Completed in a follow-up run; no failures. |
| `git diff --check` | 0 | Passed; Git printed existing LF→CRLF working-copy warnings for modified files. |
| Full backend `npm test` | 0 | **241 passed, 241 total, 20/20 suites, 28.1s.** |
| Flutter tests/analyze/build | Not run | No Flutter command was run; frontend was not changed. |

**Change-control note (addendum):** An initial speculative backend change added a pre-capture
`getOrder` APPROVED check to `orders.ts`. It was reverted with `git checkout HEAD -- orders.ts
orders.test.ts` because (a) the backend already maps PayPal `ORDER_NOT_APPROVED` to a controlled 400
with order/reservation state intact (covered by an existing focused test), and (b) the added check
broke 23 unrelated tests whose mocks do not populate `getOrder`. After revert, `orders.ts` and
`orders.test.ts` match HEAD; the six A1.5 working-tree files remain modified and preserved. No code
change is committed by this sprint.

## Sandbox and webhook status

- **Local code/tests:** Source trace completed. TypeScript and diff whitespace check passed. Focused Jest remains unverified because it stalled.
- **Actual buyer approval and capture:** Not tested against Sandbox in this sprint. The Dashboard's 422 is evidence of a failed capture attempt, not of a corrected full lifecycle.
- **Actual webhook delivery and processing:** Not tested against Sandbox. Existing local handler/tests cover POST, signature verification and event handling; registration success alone does not prove delivery.

## Remaining blocker

The failed Dashboard capture cannot be tied to a specific app order and approval callback from available evidence. Collect sanitized correlation data for one fresh attempt as described above before choosing a code fix. The configured webhook remains the existing one; it was not recreated.

## Manual Sandbox acceptance procedure

Use the existing Render service and a fresh Sandbox order. Record UTC timestamps, order status, sanitized correlation identifiers and PayPal Debug IDs only.

1. Start checkout in the app; verify order creation returns an `approvalUrl` and record the internal order and PayPal order IDs securely/safely for correlation.
2. Open the approval URL and approve with a Sandbox buyer. Return to AI Café and confirm the callback token matches the pending PayPal order; then choose the app's capture confirmation.
3. Verify capture targets that same PayPal order and PayPal reports `COMPLETED`; verify the app reports `PAID` and reservation/spend settles once.
4. Verify the already-registered Sandbox webhook receives and processes the event; repeat/deliver a duplicate only through supported Sandbox tooling and confirm no duplicate business effect.
5. Repeat with cancellation and with an unapproved order; verify neither produces a successful capture and the cart/reservation remains consistent.

No commit, push, deployment, webhook registration, or live payment was performed.

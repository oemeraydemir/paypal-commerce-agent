# Sprint PAYPAL-CHECKOUT-RECOVERY-02 Report

**Verdict: PARTIAL**  
**Starting HEAD:** `c8c5a4085100f75f05e4dca2d20f2087f8b17ef2`  
**Sandbox checkout:** Not performed from this local run.

## Root cause status

The manual-click return page was the leading hypothesis, but it is not proven to be the cause of the observed PayPal failure. The Flutter approval bypass is confirmed: `CheckoutProvider.confirmApprovalInBrowser()` previously set `_paypalApproved = true` from a user assertion without validating a PayPal return token. This could enable a premature capture request and aligns with `ORDER_NOT_APPROVED`, but there is no evidence that this specific path caused the earlier Sandbox attempt.

## Changed files

- `apps/backend/src/routes/checkout.ts` — safely constructs the status-specific custom-scheme URL, attempts automatic navigation, and retains a visible fallback link with a delayed fallback message. The success page states it does not capture payment. The cancel route remains a cancel-only deep link.
- `apps/backend/tests/integration/checkout.test.ts` — covers encoded success navigation, fallback presence, no capture claim, cancel-only navigation, and missing/blank/repeated token rejection.
- `apps/flutter_app/lib/providers/checkout_provider.dart` — removes approval authorization from `confirmApprovalInBrowser()`; it now explains that the matching PayPal return is required.
- `apps/flutter_app/lib/screens/chat_screen.dart` — changes the button label to “Approval return not received?” so it no longer implies a user assertion will authorize capture.
- `apps/flutter_app/test/checkout_provider_test.dart` — verifies the manual fallback leaves approval false and makes zero capture requests while preserving the pending order and cart.
- `SPRINT_PAYPAL_CHECKOUT_RECOVERY_02_REPORT.md` — this report.

No unrelated source files were changed by this sprint. Pre-existing A1.5/A1.9A edits and reports remain in the working tree.

## Validation

| Command | Exit code | Result |
|---|---:|---|
| `git status --short` and `git rev-parse HEAD` | 0 | Recorded before editing; starting HEAD as above. |
| Backend `tsc --noEmit` | 0 | Passed. |
| Focused backend Jest: checkout, orders, webhooks, reservation consistency/lifecycle | 0 | 5 suites, 69 tests passed. |
| Backend `npm test -- --silent` | 0 | 20 suites, 242 tests passed. |
| Flutter `test/checkout_provider_test.dart` | 1 (interrupted) | Produced no output and did not complete. |
| Flutter `test` | 1 (interrupted) | Produced no output and did not complete. |
| Flutter `analyze` | 1 (interrupted) | Produced no output and did not complete. |
| `flutter --version` | 1 (interrupted) | Also produced no output; Flutter validation could not be established in this environment. |
| `git diff --check` | 0 | Passed; Git emitted only working-copy LF→CRLF warnings, including on an unrelated pre-existing file. |

The backend suite validates the generated response markup and routing behavior, not actual browser/OS handling of custom-scheme redirects. Flutter source changes and their regression test remain unverified until the Flutter SDK commands run successfully.

## Remaining limitations

- No real Sandbox buyer approval → automatic app return → capture was observed after these changes.
- No real Sandbox webhook delivery was verified.
- Flutter focused/full tests and analysis did not complete.
- Automatic custom-scheme navigation may be blocked by browser/platform policy; the page keeps a visible manual deep-link fallback. Neither the HTTP return request nor fallback click authorizes capture; only the app’s matching PayPal token callback does.
- No commit, push, deployment, webhook registration, or live payment was performed.

## Exact next action

Run `flutter test test/checkout_provider_test.dart`, `flutter test`, and `flutter analyze` in an environment where the Flutter CLI completes; after local validation is reviewed, perform one fresh Sandbox order to verify automatic app return and matching-token capture.

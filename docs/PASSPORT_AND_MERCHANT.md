# AI Transaction Passport + Merchant walkthrough (added 2026-11-03)

**Pitch line:** AI Café is a trust-first agentic commerce platform for cafés. AI prepares the order, users control spending, and PayPal securely completes the payment.

## AI Transaction Passport
- Code: `source/apps/backend/src/passport/builder.ts` (pure function), returned as `passport` by `POST /api/policy/preview`.
- Web: `renderPassport()` in `public/app.js` (EN/TR strings in `public/i18n.js`).
- What it shows: server-verified lines, limit usage, "AI cannot change your limit", "payment authority: you", and the six-step flow (AI prepares → server prices → server limit → you approve → PayPal pays → server verifies).
- What it is not: a payment record, a stored object, a signature, or an allergy-safety statement. The signed record of a real order stays the Cart Mandate.
- Tests: `tests/unit/passport.test.ts`, `tests/integration/passport-preview.test.ts`.

## Merchant walkthrough (`/merchant.html`)
- Explains the setup path for a café owner and reads a live readiness checklist from `/api/health`.
- States on the page that it does not connect a real PayPal merchant account (Sandbox only, one merchant per deployment).
- Calculator uses only the owner's own inputs; fee fields are placeholders, not PayPal's price list.
- Tests: `tests/integration/merchant-page.test.ts`.

## Flutter parity (same feature, same wording)
- Passport: `lib/models/transaction_passport.dart`, `lib/widgets/transaction_passport_card.dart`, wired into the cart sheet in `chat_screen.dart`; `PolicyPreview.passport` is null for older servers. The merged model keeps the canonical per-line `productId` and adds the enriched `PassportMandate` (`thresholdPercent`, `approvalThresholdMinor`), actor chips on each step, and the approval-threshold marker on the limit bar.
- Take it home (Channel3): `lib/models/take_home.dart`, `lib/widgets/take_home_card.dart`, `ApiService.fetchTakeHome`, `CheckoutProvider.loadTakeHome`. Loads only on tap.
- EN/TR strings added to `app_strings.dart` and `public/i18n.js` with identical keys.
- Tests: `test/transaction_passport_test.dart`, `test/take_home_test.dart`.

## Verification (author sandbox, 2026-11-03)
Backend: `npx tsc --noEmit` clean; `npx jest --runInBand` → 130 suites / 1253 tests passed (PayPal, AI and Channel3 mocked, pg-mem). `openapi.json` validates as OpenAPI 3.0.3 with unique operationIds.
Also fixed: `product-art-parity` test expected `.png`, assets are `.jpg`.
Flutter: `flutter analyze` clean (one pre-existing `always_use_package_imports` info). `flutter test` could not execute in this sandbox (the `flutter_tester` WebSocket runner was unavailable); the model was verified with a runtime parse check (13/13 assertions passed). SDKs (TypeScript + Python) were generated locally from `openapi.json` and committed under `sdks/`; nothing was uploaded to the APIMatic cloud portal. Not run here: a real browser, live PayPal Sandbox, live Channel3.

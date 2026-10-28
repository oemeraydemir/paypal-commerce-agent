# Platform status: Web and Flutter (kept separate on purpose)

Each row says **who ran what and when**. Two kinds of evidence appear here:

- **Audit session (2026-10-25):** commands run by Claude in a Linux sandbox (backend only; no Flutter SDK, Chrome or PayPal there).
- **Owner machine (2026-10-26):** an AI coding session on the owner's Windows machine (`C:\Projects\AiCafe`) wrote a release-gate
  report and the owner supplied the raw `flutter test` log. Claude did **not** reproduce these runs; they are reported as supplied.

Nothing here is claimed beyond its evidence.

## Web storefront + AG Grid dashboard + API (Node.js backend)

| Check | Result | Evidence (command, date, where) | Limits |
|---|---|---|---|
| TypeScript build check | PASS | `npx tsc --noEmit`, 2026-10-25, audit session | |
| Unit + integration tests | PASS, 928 tests / 83 suites on commit 364824d (+6 new tests: 934 / 85) | `npm test`, 2026-10-27, run on the owner machine and reproduced independently in the audit sandbox | PayPal and AI are **mocked**, PostgreSQL is emulated (pg-mem) |
| API contract, no PayPal/AI keys | PASS, 58 requests / 73 assertions / 0 failed, public and private dashboard mode | `newman` against a local keyless server, 2026-10-25, audit session | Proves contract and rejections, not PayPal behaviour |
| Real-Chrome AG Grid test | PASS 5/5 **only when** `playwright-core` and `CHROME_PATH` are set | owner machine, 2026-10-26 | Plain `npm run test:browser` reports **5 skipped, which is not a pass** |
| Real PostgreSQL smoke tests | Not re-run | `npm run test:smoke` (needs `DATABASE_URL`) | |
| PayPal Sandbox order creation (live) | PASS | owner machine, 2026-10-26, against the deployed app and a local current-source backend: session 201, catalog 25 products, a client-sent `priceMinor:1` was recomputed by the server (2 items = EUR 20.00), real `paypalOrderId` with approval host `www.sandbox.paypal.com`, replay with the same `Idempotency-Key` returned the same order | **No capture was made, no money moved** |
| Deployed Render instance | **Live, current** | Render deploy of commit `364824d` on 2026-10-27 (clean build cache): boot log shows production, PayPal enabled, PostgreSQL storage with migrations up to date | Free tier: first request after idle can take about 50 s |
| Buyer approval → capture | **PASS (live Sandbox)** | 2026-10-27, deployed app: AI cart (2x Fluffy Pancakes, EUR 18.00) → server policy `REQUIRE_CONFIRMATION` → Sandbox approval → Confirm payment → status PAID, capture id `5AU4••••990S`, signed Cart Mandate verified ("Agent may authorize payment: no"), dashboard row turned PAID | Screenshots held by the owner |
| Webhook delivery, replay, partial refund | **Not yet evidenced** | not part of the 2026-10-27 run | Procedure: `docs/PAYMENT_E2E.md`, steps 3 and 4 |

## Flutter shopper app (Android / iOS)

| Check | Result | Evidence | Limits |
|---|---|---|---|
| `flutter test` | **PASS, 160 / 160** | owner machine, 2026-10-27, raw log ("All tests passed!") | Earlier snapshots (79, 118) are superseded |
| `flutter analyze` | **No issues found** | owner machine, 2026-10-27, commit f4d2d38 | |
| `flutter build web --debug` | PASS | same report | |
| `flutter build apk --debug` | PASS (155 MB debug APK) | same report | Debug build, not a release build |
| Android emulator run (against a current-source backend) | PASS for the scenarios below | same report | |
| ... language switch TR to EN | PASS | whole UI relabelled | |
| ... cart and policy feedback | PASS | quantity 1 to 2: EUR 10.00 to EUR 20.00, "Within your limits." changed to "Needs your approval on PayPal."; backend log shows the matching `/api/policy/preview` calls | |
| ... real AI reply | PASS, honest | the reply came from the OpenRouter backup and said it could not build a cart | **"Why these items?" was not observed live on Android** (the AI returned no cart); the web run showed it |
| Web storefront (headless Chromium) | PASS | live AI cart, "Why these items?" visible, Markdown rendered, allergen note reads unverified, policy shows "Needs your approval", 0 JavaScript errors | |
| Voice input with a real microphone | **UNVERIFIED** | microphone hardware exists on the owner machine, but real speech was not fed in | unit/widget tests only; never cite recognition as proven |
| Allergy preference | Stored on the device, **not** filtered server-side, labelled unverified in the UI | `DEMO_CHECKLIST.md` honesty gates | never claim an item is allergen-free |

## Before submitting

1. Push the final commit; Render redeploys automatically. Check `/api/health`.
2. Run webhook replay and a partial refund once (`docs/PAYMENT_E2E.md`, steps 3 and 4) and record the result there.
3. Local demo: port 3000 can be taken by another project's server (one was found on the owner machine). Check that
   `http://localhost:3000/api/health` returns JSON, or run the backend on another port and set `BASE`.

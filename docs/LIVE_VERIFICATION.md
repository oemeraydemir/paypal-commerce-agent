# Final live-verification checklist (do this once, after the code is final)

Prerequisites: a PayPal Sandbox business app and a personal (buyer) Sandbox account; Render access; Flutter SDK.
Never paste credentials into chat or reports; use environment variables and the PayPal login page.

## 1. Local, before anything else
1. `cd source/apps/backend && npm test` (expect 79 suites / 883 tests — measured 2026-10-26; the count moves as tests are added, so treat the number as a smoke signal, not a contract)
2. `DATABASE_URL=postgres://... npm run test:smoke` against any PostgreSQL 14+ (`pg-*` suites; `paypal-smoke` needs Sandbox credentials)
3. `cd source/apps/flutter_app && flutter pub get && flutter analyze && flutter test` (owner machine, 2026-10-26: analyze clean, **118 tests passed**; the 79 recorded on 10-23 was an older count — not re-run in the 2026-10-25 audit; if `flutter test` fails with "Unable to connect to flutter_tester process", an `HTTP_PROXY` in your shell is being used for the local test host — run it with the proxy unset or `NO_PROXY=localhost,127.0.0.1`)

## 2. Deploy (Render)
3a. Before pushing: revoke and re-issue every API key that ever appeared in an agent checkpoint commit (`refs/agents/...`, commits `024f433` / `3ebeacc` contain key-shaped values in `.env.example`). Back up, then delete those local refs. Push only `main` (`git push origin main`, never `--all` or `--mirror`)
4. Commit without `.env` and `audit-results/`, push, let Render redeploy; attach the PostgreSQL from `render.yaml`
5. Delete the `GEMINI_MODEL` variable on Render. Decide `DASHBOARD_PUBLIC` (default true for the demo)
6. `GET /api/health`: `buildCommit` equals `git rev-parse HEAD` of the pushed commit (and `git status` was clean when you pushed; an earlier deploy matched HEAD while the fixes were still uncommitted), `storage.mode: postgres`, `storage.durable: true`

## 3. PayPal Sandbox (local server, then Render)
7. `npm run e2e:sandbox -- <url>`: open the printed link, approve with the buyer account, wait for `PAID`
8. Capture before approval on a fresh order: expect 400 `ORDER_NOT_APPROVED`, order still `PAYMENT_PENDING`
9. Capture the approved order twice: first 200 `PAID`, second 409 and still one capture id
9a. Retry path: on a fresh order capture before approval (400 `ORDER_NOT_APPROVED`), approve in PayPal, then capture the SAME order again: 200 `PAID`
9b. Lost-response recovery (`ORDER_ALREADY_CAPTURED` -> 409 with `settled: true`) is covered by mocked tests only; a live test is optional and would need a client killed between PayPal's capture and the response. `INSTRUMENT_DECLINED` has no live test planned (assumption: handled like the mocked case)
10. Partial refund (about half), then the rest; compare the app's refund rows and the dashboard gross / refunded / net with the PayPal Sandbox dashboard
11. Fetch the real responses (remove secrets) and compare with the code's assumptions: `GET /v2/payments/captures/<id>` (status after refunds) and `GET /v2/checkout/orders/<id>` (is `payments.refunds[]` present with `status` and `amount`?) -> `src/refunds/refunded-total.ts`
12. Crash-recovery check: with a refund in PROCESSING, restart and approve again; it must ask PayPal and not re-send
13. Webhook: PayPal developer dashboard shows the delivery of `PAYMENT.CAPTURE.COMPLETED` with 2xx; resend it, expect no second state change; an unsigned POST gets 401. The Webhooks simulator is NOT proof (mock events cannot be verified): use the event from a real Sandbox capture. Confirm the webhook registered in PayPal points to `https://<render-url>/api/webhooks/paypal` and that its ID equals `PAYPAL_WEBHOOK_ID` on Render

## 4. Restart persistence on Render
14. Create a Sandbox order, restart the service from the Render dashboard, then confirm `/api/orders` and the session still work (do not delete data)

## 5. AI
15. One chat per configured provider (`X-AI-Provider` header and `provider` field must match what actually answered); then break the primary key and confirm `fallback: true`, and with no keys `mode: rule-based`
16. "gluten-free vegetarian breakfast": the answer must say nothing matches, and must not prepare a drink-only cart

## 6. Postman
17. `newman run postman/... -e postman/... --env-var baseUrl=<render url>` then repeat with `dashboardPrivate=true` against a server started with `DASHBOARD_PUBLIC=false`

## 7. Android
18. Emulator: full purchase on the local backend; deep link return; the app must show paid only after the server says `PAID`
19. Repeat against Render: `flutter run --dart-define=API_BASE_URL=https://<render-url>` (return/cancel URLs derive from `RENDER_EXTERNAL_URL`, not `10.0.2.2`); also the cancel path (no `PAID`, cart kept), a BLOCK cart (pay buttons stay disabled) and, with no AI keys, the "rule-based" label

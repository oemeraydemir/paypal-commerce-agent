# Prioritized development plan — implementation notes (2026-10-28)

This file records the changes made in this ZIP, what was already present, and what remains a deployment/architecture constraint. No credentials or customer data belong here.

| # | Plan item | Status in this revision |
|---|---|---|
| 1 | Prevent a paid cart from being charged again when cleanup fails | Local manual and AI carts are consumed before the best-effort server cleanup. A verified `already captured` cancellation conflict now uses the same paid-cart cleanup path. Regression coverage simulates a failed cleanup response. |
| 2 | Reuse checkout idempotency on ambiguous retries | The Flutter key is retained after an ambiguous create failure only while the sorted cart fingerprint is unchanged. A changed cart or a terminal cancel/paid/clear event starts a new logical attempt. Existing 401 retry coverage remains; new coverage exercises ambiguous failure and cart change. |
| 3 | Recover PayPal return after app cold start | Added `GET /api/orders/pending?token=...`, requiring the shopper session and matching session ID, PayPal token, and `PAYMENT_PENDING` status. The Flutter return handler loads the order before approving/capturing; another session receives 404. |
| 4 | Make merchant dashboard private by default | `DASHBOARD_PUBLIC=true` is now an explicit opt-in. Unset or false requires the merchant key; the public demo remains available only by deliberate configuration. |
| 5 | Make daily-limit scope honest | The current limits follow the server-issued anonymous session/user identity, not a verified merchant/shopper account. A durable account-level limit requires an identity and migration design that is not present in this source tree. |
| 6 | Fail closed on missing production persistence and verify PostgreSQL TLS | Production without `DATABASE_URL` now refuses startup, even if `REQUIRE_PERSISTENCE=false` is explicitly set. Production TLS defaults to certificate verification; `DATABASE_SSL_CA` supports a private CA. The Render Blueprint explicitly disables TLS for its same-region private database URL. |
| 7 | State the single-instance limitation | **Still a deployment constraint:** process-local queues/maps and other volatile coordination are not a multi-instance guarantee. Run one backend instance until all such state is moved to shared, atomic storage/coordination. PostgreSQL persistence alone does not make every in-memory subsystem horizontally safe. |
| 8 | Keep the regression matrix in CI | New backend and Flutter tests live in the existing test suites, which the repository CI already runs alongside typecheck/build and Flutter analysis. CI was not expanded with duplicate jobs. |
| 9 | Webhook/refund reconciliation and auditability | **Still requires operational follow-up:** the existing automation webhook is best-effort and has no transactional outbox/exactly-once guarantee. Keep refund reconciliation/manual review enabled; do not infer payment settlement from a webhook or automation delivery alone. |
| 10 | Budget and live-device demo readiness | The manual smoke checklist below covers the current demo paths and limitations. |

## Manual smoke checklist before a demo

- [ ] Confirm production starts only with a reachable PostgreSQL database; verify startup fails when `DATABASE_URL` is missing or unavailable.
- [ ] Confirm TLS verification against the selected external database CA. For the Render Blueprint's private same-region DB URL, keep its explicit `DATABASE_SSL=false`; do not copy that opt-out to a public database URL.
- [ ] With `DASHBOARD_PUBLIC` unset, verify dashboard routes reject unauthenticated requests. Set `DASHBOARD_PUBLIC=true` only for a sanitized demo dataset; otherwise configure the merchant key and verify the private route.
- [ ] Test the policy boundaries: per-purchase cap, daily spend cap, over-budget suggestion, and currency display using the configured business profile.
- [ ] Force a timeout/502 after order creation, retry the same cart and verify the same idempotency key; change the cart and verify a new key is sent.
- [ ] Start PayPal approval, terminate the Flutter app while the browser is open, and return via the deep link. Verify only the matching pending order in the same session is recovered and captured; verify a token from another session cannot recover it.
- [ ] Simulate a cleanup outage after a confirmed payment and verify the local cart is gone and cannot be submitted again.
- [ ] Exercise PayPal sandbox success, cancellation, pending capture, and verified already-captured recovery on a physical device, including the browser-to-app return.
- [ ] Review webhook duplicates, refund queue items, and automation delivery failures manually; verify capture/refund state against the provider before recording resolution.
- [ ] Keep the deployment at one backend instance until the in-memory coordination items are replaced or independently proven safe under concurrent instances.

## Test provenance

The uploader reported **87 suites / 941 tests passing** before this revision. That is user-provided status, not a run performed by this editing environment. The ZIP adds regression tests, but the full Jest and Flutter suites must be rerun in the project environment before release.

# AI Café: Verification Status, Trade-offs and Scope

**Status date:** 2 November 2026
**Scope:** a PayPal **Sandbox** prototype built for the PayPal AI Hackathon. This page separates what was *run for real*, what is *proven only with mocks*, and what is *not evidenced*. It is not a production-readiness claim.

## 1. Verification matrix (kept deliberately separate)

| Layer | What it proves | Result | Where it runs |
|---|---|---|---|
| Backend unit + integration | Business logic, policy, state machines. **PayPal and AI are mocked, PostgreSQL is emulated (pg-mem).** | **114 suites / 1158 tests passed** (re-verified 2 Nov 2026 in pg-mem/memory mode) | `npm test` |
| Real PostgreSQL smoke | Migrations, atomic claims, mandate / bills / pickup atomicity, durability on a **real server** | 6 suites / 39 tests passed on a disposable local database (not Render) | CI job `smoke-real-pg`, or locally with `DATABASE_URL` |
| Real browser (AG Grid) | Dashboard renders in headless Chrome | 5 tests passed locally; skipped (= not verified) unless `CHROME_PATH` is set | `npm run test:browser`, CI job `dashboard-browser` (informational) |
| Flutter | Widget / unit logic of the mobile app | `flutter analyze`: **no issues (re-verified)**; Android debug APK **builds** and the app **launches on an Android emulator**. `flutter test` could not run in the sandbox: `flutter_tester` WebSocket is blocked there (environment, not code); 218-test claim remains author-machine-verified only. | `flutter analyze && flutter test` |
| **PayPal Sandbox, live** | The real integration | One full payment run on 27 Oct 2026 (`docs/PAYMENT_E2E.md`). Refund, partial refund, webhook replay and Split Bill settlement against live PayPal are **not yet evidenced**. | `npm run e2e:sandbox -- <url>` (needs sandbox credentials) |

A skipped suite is reported as **BLOCKED — not verified**, never as a pass.

## 2. Identity and "demo" data: what is real

- **Sessions are real and isolated.** Every browser or app run gets a server-issued session with its **own opaque `userId`**, its own spending policy and its own wellbeing guard. One shopper cannot see or spend another shopper's policy. Split Bill joiners are authenticated by their own session.
- **There are no user accounts or logins.** A session is anonymous and expires. This is a deliberate prototype scope, not a bug; real accounts would be a separate design.
- `demo-user-001` is only a last-resort fallback id inside two internal code paths when no session is supplied. The dashboard no longer reads it: the *Spending Mandate* panel shows the **template** new sessions start from plus real counts of active sessions and customised policies. Reading the dashboard never creates a policy.
- The 25-item menu, its prices and its dietary/allergen labels are **sample data authored by the project**. The UI marks the labels "sample data · not verified" and a missing label is never treated as "allergen-free". This is not an allergy-safety feature.
- Pickup slots are generated as a rolling 7-day schedule (`PICKUP_AUTOSEED=false` turns this off). It is not a real shop calendar, and the dashboard says so.
- Without an AI key the chat uses a rule-based planner and labels itself "Rule-based planner (no AI)". Without PayPal credentials checkout answers `503 PayPal not configured`; no success screen is ever fabricated.

## 3. Engineering trade-offs

1. **Storage.** Local development can run in memory. The Render deployment uses PostgreSQL with forward-only migrations (`REQUIRE_PERSISTENCE=true` refuses to start without it).
   - **Repro note (verified 2 Nov 2026):** `src/config/environment.ts` loads `.env` automatically. If a local `.env` contains a `DATABASE_URL` pointing at a *not-reachable* server, `npm test` switches persistence to Postgres and one browser-UI integration test (`web-refund-request.test.ts`) times out (`error=db down`) — 1157/1158. With `DATABASE_URL` unset (or reachable), the full suite is green (**114 suites / 1158 tests**).
2. **Dependency advisories.** `npm audit` reports advisories in transitive production dependencies (mainly `@paypal/agent-toolkit`, `openai`). No non-breaking fix exists today. They are availability concerns, not payment-integrity concerns: bodies are capped at 100 kB and prices, totals and payment authority are decided on the server. CI prints the audit (informational). See `docs/security-note-ai-sdk-vulns.md`.
3. **Hosting.** The free Render tier sleeps when idle; the first request can take about 50 seconds. Wake it with `GET /api/health` before recording or judging.
4. **Single-instance design.** Rate limits, sessions and the event queue are per process. Horizontal scaling would need a shared store.
5. **Disputes.** PayPal does not let a merchant open disputes in production; the app prepares a signed evidence package and records the merchant's own submission. It never auto-submits and never invents a PayPal outcome.

## 4. Not yet evidenced

- Live-PayPal refund, partial refund, webhook delivery/replay and Split Bill settlement (run `npm run e2e:sandbox`; results belong in `docs/PAYMENT_E2E.md`).
- Voice input with a real microphone (unit/widget tests exist; recognition quality is unverified).
- Behaviour on Render with real PostgreSQL beyond the smoke suites above.

## 5. Not built, on purpose

- User accounts / login; multi-tenant isolation (one deployment = one merchant profile).
- E-invoicing, PayPal Vault / Pay Later.
- Production (live-money) PayPal: the environment is hard-wired to Sandbox.

## How to reproduce

```
cd source/apps/backend && npm ci && npm run build && npm test
cd source/apps/flutter_app && flutter pub get && flutter analyze && flutter test
```

Payment walk-through: `docs/PAYMENT_E2E.md`. Demo script: `DEMO_CHECKLIST.md`.

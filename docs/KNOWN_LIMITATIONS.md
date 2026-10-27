# AI Café: Engineering Trade-offs and Scope

**Status date:** 27 October 2026
**Scope:** a PayPal Sandbox prototype built for the PayPal AI Hackathon. This page states what is verified, what is deliberately limited, and what is not built. It is not a production-readiness claim.

## Verified

| Area | Result | Evidence |
|---|---|---|
| Backend | 928 Jest tests / 83 suites pass on commit `364824d` (PayPal and AI mocked, PostgreSQL emulated); one storefront regression test was added afterwards (934 / 85) | `npm test`, 2026-10-27 |
| Flutter app | 150 tests pass | `flutter test`, 2026-10-27 |
| Automated total | 1084 tests (934 backend Jest + 150 Flutter) | see above |
| Live Sandbox payment | AI-prepared cart → server policy decision → buyer approval at PayPal → capture → PAID → signed Cart Mandate verified → dashboard shows PAID | deployed app, 2026-10-27; `docs/PAYMENT_E2E.md` |
| Payment authority | The AI has no payment tool. The mandate states "Agent may authorize payment: no" and the server enforces the policy decision | `docs/EVIDENCE.md` |

## Engineering trade-offs

1. **Storage.** Local development can use in-memory storage for fast iteration. The Render deployment runs PostgreSQL with migrations (set `REQUIRE_PERSISTENCE=true` to refuse to start without it).
2. **Dependency advisories.** `npm audit` reports advisories in transitive production dependencies, mainly through `@paypal/agent-toolkit` and `openai` (`zod` memory exhaustion on oversized collections, `uuid` buffer bounds for a call form this code does not use, `langsmith`/`@langchain/core`). None has a non-breaking fix today. They are availability concerns, not payment-integrity concerns: request bodies are capped at 100 kB, and prices, totals and payment authority are decided on the server. They will be addressed with the next major upgrades after the hackathon; see `docs/DEPENDENCY_ADVISORIES.md` and `docs/EVIDENCE.md` row E16.
3. **Allergens.** The 25-item catalog has no verified allergen metadata. Allergen choices are stored on the device only, the UI labels them as unverified, and a missing label is never treated as "allergen-free". This is not an allergy-safety feature.
4. **Hosting.** The free Render tier sleeps when idle; the first request can take about 50 seconds.
5. **Single-instance design.** Rate limits and the event queue are per process. Horizontal scaling would need a shared store.

## Not yet evidenced

- Webhook delivery, replay and the unsigned-request rejection against live PayPal (`docs/PAYMENT_E2E.md`, step 3).
- Merchant refund approval and partial refund against live PayPal (step 4).
- Voice input with a real microphone; unit and widget tests exist, recognition quality is unverified.
- Real-browser AG Grid test is skipped unless `playwright-core` and `CHROME_PATH` are set.

## Not built, on purpose

- E-invoicing (a jurisdiction-specific tax document; see `docs/INVOICING_ASSESSMENT.md`).
- PayPal Vault / Pay Later: no eligibility or implementation yet.
- Multi-tenant isolation: the prototype serves one merchant profile.
- Production PayPal (live) mode: Sandbox only.

## How to reproduce

```
cd source/apps/backend && npm ci && npm run build && npm test
cd source/apps/flutter_app && flutter pub get && flutter analyze && flutter test
```

Payment walk-through: `docs/PAYMENT_E2E.md`. Demo script: `DEMO_CHECKLIST.md`.

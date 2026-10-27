# Multi-tenant readiness

**Status: this is a single-business deployment. Multi-tenancy is NOT implemented.**

One deployment of AI Café serves exactly one business, with that business's own PayPal credentials,
webhook, database and spending policy. Running a second business means a second deployment of the same
code with a different profile (`docs/MERCHANTS.md`).

This page does two things: it records the tenant boundary that **does** exist and is tested today, and it
lists — concretely — what a real multi-tenant SaaS still needs. Nothing below is presented as finished.

---

## 1. The boundary that exists today

| Concern | Where it lives | State |
|---|---|---|
| Business identity | `src/config/business-config.ts` (`currentBusiness`), from the profile at boot | Server-owned, immutable per process |
| Trusted tenant read | `src/config/tenant.ts` → `getTenantContext()` | Added this sprint |
| Client tenant claims | `rejectClientTenantOverride` middleware in `src/app.ts` | Added this sprint — refuses `businessId`, `business_id`, `tenantId`, `tenant_id`, `merchantId`, `merchant_id` in any JSON body |
| Who the user is | `src/middleware/session-auth.ts` — server-issued session id + bearer token; `userId` derived server-side from the session | Server-owned |
| Catalog & prices | `src/catalog/service.ts` — prices are read from the profile, never from the request | Server-owned |
| Order authority | `POST /api/orders/create` re-validates items and totals (`src/orders/validation.ts`) | Server-owned |
| Payment authority | Only `src/routes/orders.ts` and `src/refunds/*` reach PayPal; no AI tool can | Server-owned |
| Webhook authenticity | `src/paypal/webhook-service.ts` → PayPal `verify-webhook-signature` with **our** `PAYPAL_WEBHOOK_ID` | Verified |

Evidence: `tests/integration/tenant-boundary.test.ts` (10 tests) asserts that a client-supplied
business id is refused on AI chat and order creation, that the same value is refused too (the field
itself is the problem), that nested catalog objects are not mistaken for a claim, and that the PayPal
webhook path is unaffected by the guard.

### Why a client-supplied `tenant_id`, price or merchant id is not trustworthy

- **`tenant_id`** — the request has no way to prove which business it is talking to. If the server
  honoured it, anyone could shop in another business's catalog and — with a per-tenant PayPal account —
  pay into the wrong account. The business must come from the deployment's own configuration.
- **price** — a client-supplied price turns the checkout into an "any price you like" endpoint. Every
  total is recomputed from the catalog on the server (`validateOrderItems`), and the PayPal order is
  built from that total.
- **merchant id** — the merchant id is a *policy input* (`allowedMerchantIds` in
  `src/policy/service.ts`). Accepting it from the client would let a caller satisfy their own policy
  check.

---

## 2. What is still missing (honest gaps)

### G1. Orders carry no tenant id
`Order` (`src/orders/domain.ts`) has `sessionId` but **no** `businessId`, and the `orders` table
(`src/persistence/migrations.ts`, migration 001) has no tenant column. Consequences:

- `OrderService.getByPayPalOrderId()` is a **global** lookup. In a multi-tenant database the same
  PayPal order id could belong to two businesses; today the first match wins.
- A webhook is correlated to an order **without** checking that the order belongs to the business the
  webhook was registered for.

**Why this is not exploitable today:** a deployment has exactly one business, one PayPal app and one
`PAYPAL_WEBHOOK_ID`, and PayPal validates the signature against that id. An event minted for another
merchant's account does not verify. The gap is a *correctness* gap for the future, not a live
vulnerability in this single-merchant build.

**What it needs:** a `business_id` column on `orders`, `refund_requests`, `policy_events`,
`webhook_events` and `spend_reservations`; a migration that backfills the current business; every
repository query scoped by tenant; and `getByPayPalOrderId(paypalOrderId, businessId)`.

### G2. No row-level security
There is no PostgreSQL RLS. The only isolation is "one database per merchant". A real multi-tenant
build needs RLS policies keyed on a session variable (`SET LOCAL app.business_id`) so a query bug
cannot cross tenants, plus a separate migration path per tenant.

### G3. No membership or role model
`userId` is derived from an anonymous session (`src/session/index.ts`). There is no user table, no
membership table and no role (owner / staff / viewer). Merchant-side access is a single shared
`X-Ops-Key` (`src/middleware/merchant-key.ts`) — adequate for a demo, not for staff accounts.

### G4. One PayPal account per deployment
Per-business PayPal onboarding is not implemented. It is not just a code change: it needs a PayPal
partner/platform integration (PayPal Commerce Platform partner account, seller onboarding, and the
partner permissions that go with it). This has **not** been verified with PayPal and must not be
described as ready. See `docs/INVOICING_ASSESSMENT.md` §4 for the related billing split.

### G5. No tenant lifecycle
There is no "create / suspend / delete business" flow, and therefore no defined behaviour for a
suspended business (what should keep working: read-only catalog? nothing?). See §3 for the decision a
real implementation has to make.

### G6. Dashboard is single-tenant
The dashboard reads global tables (`src/routes/dashboard.ts`). With several tenants it would show
everybody's orders.

---

## 3. Required behaviour once tenants exist

Decisions a real implementation must take, written down now so the security work is not improvised
later:

1. **Tenant context source** — from the authenticated principal (session → membership → business),
   never from the body, query string or a header the client controls.
2. **Membership + role check** — at the route boundary, before any handler; deny by default.
3. **Ownership on write** — `business_id` is set by the server on insert and is immutable; no update
   path may change it.
4. **AI catalog search** — the tool layer receives the tenant from the request context and filters the
   catalog by it; the model never chooses a tenant.
5. **Webhook ownership** — the webhook id is mapped to a business at registration time; the handler
   resolves `business_id` from the webhook id and then looks up the order **within** that business.
6. **Disabled business** — all authenticated API calls answer `403`; catalog, checkout and AI chat
   stop; existing orders remain readable to that business's staff for refunds; no new PayPal order may
   be created.
7. **RLS** — a second, database-level defence on top of the application checks.

---

## 4. Test coverage that exists vs. what is missing

| Requirement | Test today | Verdict |
|---|---|---|
| Missing tenant context is refused | `tenant-boundary.test.ts` (client claim refused); `session-auth` tests (no session → 401) | Covered for this deployment |
| Another business's data is unreachable | — | **Not testable yet**: there is only one business. Blocked by G1 |
| Payment link bound to the wrong order is refused | `tests/integration/orders.test.ts`, capture tests | Covered |
| Webhook for the wrong tenant is refused | — | **Missing**: blocked by G1 (no tenant on orders) |
| Duplicate webhook does not double-process | `webhook-durable-idempotency.test.ts`, `webhooks.test.ts` | Covered |
| Unauthorized capture/refund is refused | `refunds.test.ts`, `capture-concurrency.test.ts` | Covered |

The two "missing" rows are deliberately not faked. They cannot pass before G1 lands, and a test that
pretends otherwise would be worse than no test.

---

## 5. Suggested order for the next sprint

1. `business_id` on orders + refunds + policy events + webhook events, backfilled (G1).
2. Tenant-scoped repositories and `getByPayPalOrderId(paypalOrderId, businessId)` (G1).
3. Webhook id → business mapping (G1).
4. The two missing tests from §4, which become possible after step 1.
5. Membership/roles (G3) — the largest piece; do not start before 1–4 are green.

# Durable storage (PostgreSQL)

AI Café keeps an in-memory read model (fast, synchronous) and **writes every change through to
PostgreSQL**. At boot the state is loaded back *before* the server listens. Without
`DATABASE_URL` the app runs purely in memory (unit tests, catalog-only local runs) and logs a
loud warning in production.

> Render web services have an **ephemeral filesystem**: a SQLite/JSON file there would be wiped
> on every deploy or restart. That is why the store is a managed PostgreSQL, not a file.

## What is stored where

| Data | Table | Why it must survive a restart |
|---|---|---|
| Orders, PayPal order/capture ids, status, `captureStartedAt` | `orders` | match webhooks, reconcile payments, show the buyer their order |
| Daily-spend reservations (PENDING/CONFIRMED/CANCELLED/EXPIRED) | `spend_reservations` | the per-user daily limit must not reset on restart |
| Sessions (SHA-256 of the token only, never the token) | `sessions` | clients keep their session, so they keep access to their orders and idempotency scope |
| Idempotency responses (24 h) | `idempotency_records` | a retried request is answered from storage, never executed twice |
| Refund queue (proposals, approvals, PayPal refund ids) | `refund_requests` | the refundable amount and "already refunded" must not reset on restart |
| Policy events (last 2000 loaded at boot) | `policy_events` | dashboard history and the AI-share statistics |
| Live capture claims (expire after 120 s) | `capture_claims` | at most one capture per order across application instances |
| Processed webhook event ids (14 days) | `webhook_events` | a PayPal redelivery after a restart or deploy is recognised and skipped |
| Webhook events held for review (amount mismatch, incomplete capture evidence) | `webhook_reviews` | the hold is durable before PayPal gets a 2xx (migration 006) |
| Applied migrations | `schema_migrations` | forward-only schema versioning |

Still in memory on purpose: AI chat history and rate-limit counters.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | unset | PostgreSQL connection string. Unset = in-memory mode. Never commit it. |
| `DATABASE_SSL` | `false` | `true` for external connections that require TLS (certificate not verified, `rejectUnauthorized:false`). Render's internal URL needs no SSL. |
| `DATABASE_POOL_MAX` | `5` | pool size (1–20) |
| `REQUIRE_PERSISTENCE` | `false` | `true` with `NODE_ENV=production`: refuse to start without `DATABASE_URL` |

If `DATABASE_URL` is set but the database is unreachable or a migration fails, the process **exits**
(it never silently degrades to memory). `GET /api/health` reports `storage: { mode, durable }`.

## Migrations

Forward-only, embedded in `src/persistence/migrations.ts` (so they ship in `dist/` with no copy
step). They run automatically on every boot inside one transaction guarded by a
`pg_advisory_xact_lock`, so two instances booting together cannot race. Never edit a released
migration; append a new one with the next id.

```bash
cd source/apps/backend
DATABASE_URL=postgres://... npm run db:migrate     # optional: prepare/inspect ahead of a deploy
```

### Schema (migrations `001_init`, `002_refunds_and_policy_events`)

```sql
orders(id PK, session_id, status, origin, items jsonb, total_minor int, currency,
       paypal_order_id UNIQUE, paypal_capture_id, paypal_status, idempotency_key,
       request_fingerprint, reservation_id, capture_started_at, agent_context jsonb,
       created_at, updated_at)                       -- idx: idempotency_key, status
spend_reservations(id PK, user_id, amount_minor int, state, created_at, settled_at) -- idx: state
sessions(session_id PK, user_id, token_hash, created_at, last_seen_at)
idempotency_records(key PK, status int, body jsonb, fingerprint, created_at)        -- idx: created_at
refund_requests(id PK, order_id, amount_minor int, currency, reason, proposed_by, status,
                paypal_refund_id, paypal_refund_status, last_error, created_at, updated_at, decided_at)
policy_events(id PK, user_id, occurred_at, event jsonb)
schema_migrations(id PK, applied_at)
```

Money is always an integer in minor units (cents).

## Setup

### Local (Docker)

```bash
docker run --name aicafe-pg -e POSTGRES_USER=aicafe -e POSTGRES_PASSWORD=aicafe \
  -e POSTGRES_DB=aicafe -p 5432:5432 -d postgres:16
# source/apps/backend/.env
DATABASE_URL=postgres://aicafe:aicafe@localhost:5432/aicafe
npm run dev          # logs: "Storage: postgres (orders=0, reservations=0, migrations=001_init)"
```

### Render

`render.yaml` declares a `aicafe-db` database and wires `DATABASE_URL` to the web service with
`fromDatabase` (internal connection string, no SSL flag needed) plus `REQUIRE_PERSISTENCE=true`.
If you create the database by hand, copy its **Internal** URL into the service's `DATABASE_URL`.

**Free-tier caveat (Render docs):** a Free Postgres **expires 30 days after creation**
(14 days grace, then deleted) and has **no backups**; only one Free database per workspace. Create
it close to the judging period or use a paid instance / another managed PostgreSQL for anything
that must outlive that.

## How the failure windows are closed

| Situation | Behaviour |
|---|---|
| Server restarts | orders, PayPal refs, reservations, sessions and idempotency answers are reloaded before `listen()` |
| Same request sent again (timeout / double click) | answered from `idempotency_records`; if that record is missing, the order is found again by its session-scoped key and **reused** (no second order, no second PayPal order) |
| Crash after the order row was written but before PayPal was called | retry **resumes the same order** and reservation |
| Crash after PayPal captured but before we saved | the capture attempt was marked first (`capture_started_at`); on boot `reconcileAfterRestart()` asks PayPal about every pending order and settles it (PAID + spend confirmed). Webhooks also find the order (its PayPal id is stored) |
| Database down at order creation / capture | `503` **before** PayPal is contacted; reservation released |
| Database fails *after* a capture succeeded | the buyer still gets success (PayPal is the truth); the row is retried by the sweeper and corrected on the next boot reconciliation |
| Webhook while the database is down | `500`, so PayPal redelivers (it stops retrying on any 2xx) |
| Crash while PayPal was being asked to refund | `PROCESSING` was stored first; after restart the request is re-opened as `PROPOSED` with a warning and still blocks a second proposal. Before another refund request, the service checks the PayPal refund ID when known, or compares the capture's refunded total when the ID was not saved. If PayPal cannot establish the outcome, nothing is re-sent; check the PayPal dashboard. |
| Client or AI sends `status`/capture fields | ignored: only PayPal's response, a signature-verified webhook, or a PayPal lookup can set `PAID` |

Writes go through **one serialized queue** (`persistence/write-queue.ts`), so they reach the
database in the order the state changed (a reservation row always precedes the order that
references it) and each job upserts the *current* snapshot, so a retried write heals itself.

## Verify locally

```bash
cd source/apps/backend
npm install
npx tsc --noEmit
npm test                                   # includes tests/integration/persistence.test.ts (pg-mem, no real DB)
# against a real PostgreSQL (the smoke suite reports BLOCKED/skipped without DATABASE_URL):
DATABASE_URL=postgres://aicafe:aicafe@localhost:5432/aicafe npm run test:smoke
DATABASE_URL=postgres://aicafe:aicafe@localhost:5432/aicafe npm run db:migrate
```

Manual restart check (PayPal sandbox configured): create an order, stop the server (Ctrl+C),
start it again: the log shows `orders=1`, `GET /api/orders` still lists it, and re-sending the
same `Idempotency-Key` returns the same `orderId`.

## Known limits

- **One instance only.** The capture lock and the sweeper are process-local; the database does not
  make horizontal scaling safe.
- Orders are loaded entirely into memory at boot and never pruned (fine for a demo, not for volume).
- Processed webhook ids are durable (`webhook_events`, migration 004; the newest 5000 are cached in
  memory). The handlers stay idempotent as a second line of defence.
- A webhook `COMPLETED` whose amount or currency differs from the order, or that carries no amount, currency or COMPLETED status, is held for review and not applied; the hold is stored in `webhook_reviews` before the 2xx.
- PayPal's idempotency window for `PayPal-Request-Id` is not verified here. Refund safety does not rely on that window alone: the refund ID or the refunded total at PayPal (capture status, else the order's refund list) is checked before retrying, and an indeterminate result stays blocked until PayPal can be checked.
- `DATABASE_SSL=true` does not verify the server certificate.
- A partial unique index (`refund_requests_open_uq`, migration 003) enforces at most one open
  (`PROPOSED`/`PROCESSING`) refund per order at the database level, so two instances cannot both
  create one.
- The default automated suite uses an in-memory PostgreSQL emulator (pg-mem) and mocked PayPal.
  A real-PostgreSQL migration smoke suite (`tests/smoke/pg-migrate.test.ts`) exists and runs only
  when `DATABASE_URL` is set; without it, it reports BLOCKED (skipped, not passed). It was not
  executed in the environment that produced this report (no PostgreSQL server was available).

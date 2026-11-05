# AI Café — Order & Pickup Planner: Implementation Report

Date: 2026-10-29 · Backend: Express/TypeScript + PostgreSQL · Dashboard: AG Grid Community v33 (CDN)

## 1. Files created / modified

**Created (new)**
- `source/apps/backend/src/pickup/domain.ts` — booking status set, state machine, types.
- `source/apps/backend/src/pickup/service.ts` — reserve/release/link/reconcile orchestration; capacity logic; merchant plan read.
- `source/apps/backend/src/routes/pickup.ts` — customer `GET /api/pickup/availability`, `POST /api/pickup/reserve`, `POST /api/pickup/link`, `POST /api/pickup/release`; merchant `GET /api/pickup/plan`, `POST /api/pickup/slots`.
- `source/apps/backend/tests/unit/pickup.test.ts`
- `source/apps/backend/tests/integration/pickup.test.ts`
- `source/apps/backend/tests/smoke/pg-pickup-atomicity.test.ts` (real-PostgreSQL proof)

**Modified**
- `src/persistence/types.ts` — `PickupSlotRow`, `PickupBookingRow`, `PickupBookingStatus`, `PickupRepository` interface.
- `src/persistence/pg-repositories.ts` — `PgPickupRepository`; **atomic `reserve`** (SELECT…FOR UPDATE + counter increment + INSERT catching 23505 → `ALREADY_HELD`); `release`/`link`/`reconcile`; merchant plan.
- `src/persistence/migrations.ts` — migration **009** partial unique index `pickup_bookings_one_held_per_session_uq ON pickup_bookings (session_id) WHERE status='HELD'` (migration 008 already created the tables + `pickup_bookings_order_uq`).
- `src/persistence/init.ts` — wire `pickup` repo; `src/app.ts` / `src/server.ts` — mount pickup routes, run pickup reconcile at restart; `src/orders/payment-lifecycle.ts` — pickup reconcile in the sweeper.
- `public/index.html`, `public/app.js`, `public/i18n.js` — customer pickup UI.
- `public/dashboard.html`, `public/dashboard.js` — merchant Pickup plan grid (isolated section).

## 2. Customer UI behavior (checkout flow)

- Displays available slots for the next 3 days from `GET /api/pickup/availability`, each showing the time window and the server-computed `remaining` capacity.
- One-slot selection only; reserve via `POST /api/pickup/reserve` (server enforces one-active-HELD per session).
- Preserves the booking id (`BKEY='aicafe.pickupBooking'`); when an order id becomes available, links via `POST /api/pickup/link` (best-effort before the PayPal redirect; reconciliation is authoritative).
- Renders clear HELD / CONFIRMED / RELEASED / unresolved status with colored boxes; safe release on cancel via `POST /api/pickup/release`.
- Handles full / expired / network errors without losing the cart; disables buttons while a request is in flight (prevents duplicate clicks).
- **Never exposes session ids, internal ids, or credentials** — only server-owned slot/booking data.
- Concurrency protection does **not** rely on frontend controls; the DB partial unique index is the guarantee.

## 3. Merchant UI behavior (dashboard)

- New isolated **“Pickup plan”** section reusing the existing AG Grid Community setup (same `agGrid.createGrid`, Quartz light/dark themes, `applyDiff`, pagination, quick filter, CSV/JSON export, aria-label renderers). Existing Orders/Policy-events grids are untouched (verified via diff).
- Columns: Day · Window · Capacity · Reserved · Remaining · Status (color chip) · Order Ref · Booking ID.
- Distinct status chips: HELD (amber), CONFIRMED (green), RELEASED (grey); empty slots also appear so unused capacity is visible.
- Date/text filtering and sorting supported (Day, Window, Status); CSV/JSON export via toolbar buttons.
- **Does not expose customer session ids/tokens** — a `sessionId` is never copied into a grid row, CSV, or JSON export.
- Refreshes on the same 5s loop as the existing grids; auth uses the same merchant key (`opsHeaders()`).

## 4. DB-level concurrency protection + real-PostgreSQL evidence

- **Invariant:** at most one active HELD booking per session.
- **Mechanism:** partial unique index `pickup_bookings_one_held_per_session_uq` (migration 009) + atomic `reserve()` transaction:
  `BEGIN → SELECT … FOR UPDATE ON slot → capacity check → UPDATE reserved_count+1 → INSERT (HELD) [catch pg 23505 → ROLLBACK → ALREADY_HELD] → COMMIT`.
- **Real-PostgreSQL smoke (`pg-pickup-atomicity.test.ts`) — 10/10 PASS** on local PostgreSQL 16 via `DATABASE_URL=postgres://postgres@localhost:5432/postgres`:
  - migrations 008+009 create both partial unique indexes;
  - capacity N + k concurrent reserves → exactly N OK and k FULL, `reserved_count = N`, exactly N booking rows;
  - **same-session concurrent reserves → exactly one HELD booking** (unique-index enforcement), loser rolled back (capacity 0);
  - release idempotent (second release no-op, never double-decrements);
  - reconcile maps PAID→CONFIRMED (capacity kept), PAYMENT_FAILED/ORDER_CANCELLED→RELEASED (capacity freed once), CART_READY/ambiguous→kept HELD;
  - UNLINKED past expiry→RELEASED; within expiry→kept; reconcile idempotent.
- No in-memory test is presented as proof; the proof is the real-PG run above.

## 5. Payment lifecycle safeguards

- Only persisted authoritative order states confirm/release bookings (PAID/ORDER_CONFIRMED — CONFIRMED; PAYMENT_FAILED/ORDER_CANCELLED — RELEASED).
- Ambiguous payment states retain capacity (kept HELD).
- Reconciliation is idempotent; capacity decrements only on HELD→RELEASED (so re-runs never double-decrement).
- Runs at server restart and in the reservation sweeper.
- **PayPal capture route and Split Bill are untouched** — pickup only adds a best-effort link before redirect; confirmation/release is authoritative from order state.

## 6. Test commands + results

| Check | Command | Result |
|---|---|---|
| Type-check | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| Combined unit+integration | `./node_modules/.bin/jest --runInBand tests/unit tests/integration` | **98/98 suites · 1041/1041 tests PASS** |
| Dashboard a11y | `jest tests/unit/dashboard-a11y.test.ts` | 7/7 PASS |
| Dashboard contrast | `jest tests/unit/dashboard-contrast.test.ts` | 11/11 (both themes) PASS |
| Real-PG smoke | `DATABASE_URL=... jest -c jest.smoke.config.js tests/smoke/pg-pickup-atomicity.test.ts` | **10/10 PASS (real PostgreSQL)** |
| Syntax (browser JS) | `node --check public/dashboard.js` and `public/app.js` | OK |

No suites are skipped and reported as passed; the real-PG smoke **executed** (not skipped).

## 7. Remaining limitations / notes

- No browser screenshot/visual regression run was performed; behavior is verified by the DOM-shim/unit tests and code review.
- No commit/push/deploy made (per constraints). Working tree has the changes above uncommitted.
- Local PostgreSQL was stopped and `pg_hba.conf` restored after the smoke run (temp trust auth removed).
- The 10 accepted-risk production npm advisories (AI-SDK transitive chain) are unchanged.

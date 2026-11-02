# Repeatable PayPal Sandbox payment check

**Status: PARTIALLY VERIFIED (as of 2 November 2026).** The buyer-approval + capture step (Procedure §2) was executed
end-to-end against **real PayPal Sandbox** and **PASSED** (see "Verified run" below). The webhook-replay (§3) and
refund / partial-refund (§4) steps are **still NOT RUN** and must not be described as verified. The unit and integration
tests cover the logic with mocked PayPal; this procedure is the only thing that proves the real integration.

## Verified run — buyer approval + capture (2 Nov 2026)

Driver: `scripts/e2e-sandbox-flow.ts` (with `E2E_SKIP_AI=1`) against a locally running backend
(`DATABASE_URL= node dist/src/server.js`, port 3000, Sandbox credentials from `.env`).

| Step | Result |
|---|---|
| `/api/health` guard | `paypal.enabled=true`, `environment=sandbox` |
| Session + wellbeing profile | 201 / 200 (Wellbeing Guard requires a profile before checkout) |
| Over-limit `premium_cake` (€45 > €20) → `POST /api/orders/create` | **403 BLOCK**, decision=BLOCK — no PayPal order created |
| €13.00 order (veg_breakfast + coffee) → `POST /api/orders/create` | **201**, `paypalOrderId=70G68487XG483091V`, `approvalUrl` returned |
| Total invariant before approval | `totalMinor=1300` (€13.00) |
| Buyer approves in Sandbox → `POST /api/orders/:id/capture` | **200 PAID** (real Sandbox `capture` returned 201) |
| `/api/policy-events/stats` AFTER | spent=€13.00, spentMinor=1300, requests=8, blocked=4 |

- Order IDs: `orderId=6ee717c4-c8ef-430a-83b2-94ceb2ec9683`, `paypalOrderId=70G68487XG483091V`.
- Backend logs show the real Sandbox round-trip (`POST …/70G68487XG483091V/capture → 201`) and the buyer's
  `GET /api/checkout/return?…&PayerID=…` redirect after Approve.
- Driver final line: `SUCCESS: order PAID; /policy-events/stats spent increased by exactly €13.00 (1300 minor).`

> Note: the sandbox driver refuses to run unless `/api/health` reports `paypal.enabled === true` and
> `paypal.environment === "sandbox"`. A live-money run is impossible by construction (SDK hard-wired to Sandbox).

Still open: **refund**, **partial refund**, **Split Bill settlement**, and **webhook**-driven PAID against live PayPal.

## Safety rules

- PayPal **Sandbox only**. The code is hard-wired to the Sandbox environment, and the driver refuses to start unless
  `/api/health` reports `paypal.enabled: true` and `paypal.environment: "sandbox"`.
- Use a **Sandbox personal (buyer) test account** from the PayPal Developer dashboard. Never use a real PayPal login or card.
- The driver creates one fixed order of **EUR 13.00** and checks the total before asking for approval.
- Keep secrets out of notes and screenshots: do not paste the buyer password, the PayPal client secret or the ops key anywhere.
- Do not run this against a production database you care about; it creates orders and a refund record.

## What you need (BLOCKED if any item is missing)

| Item | Where it comes from |
|---|---|
| Sandbox business app credentials (`PAYPAL_ENABLED=true`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`) | PayPal Developer dashboard, Apps and credentials |
| A Sandbox buyer login | Developer dashboard, Sandbox accounts |
| A public HTTPS URL for the webhook (the Render URL, or `ngrok http 3000` locally) | Render service or ngrok |
| `PAYPAL_WEBHOOK_ID` for that URL | `npm run register-webhook <url>/api/webhooks/paypal`, or the dashboard |
| `OPS_COPILOT_KEY` set on the server (sent as `X-Ops-Key`) | your server environment |
| PostgreSQL (`DATABASE_URL`, `REQUIRE_PERSISTENCE=true`) if you want the durable-idempotency evidence | Render database or local PostgreSQL 16 |

Put the values in `source/apps/backend/.env` (never committed) or in the Render environment.

## Procedure

Set two shell variables once so no secret is typed into a command line that gets logged:

```bash
export BASE="https://<your-service>.onrender.com"   # or http://localhost:3000
read -rs OPS_KEY && export OPS_KEY                    # type the key; it is not echoed
```

### 1. Health and guards

```bash
curl -s "$BASE/api/health"
```

Expect `paypal.enabled: true`, `paypal.environment: "sandbox"`, and a database that is not in memory mode. If not, stop: BLOCKED.

### 2. Buyer approval and capture

```bash
cd source/apps/backend
npx ts-node --transpile-only scripts/e2e-sandbox-flow.ts "$BASE"      # add E2E_SKIP_AI=1 to skip the AI chat step
```

The driver shows the policy BLOCK on an over-limit cart (HTTP 403, no PayPal order), creates the EUR 13.00 order and prints
an approval URL. **Human step:** open the URL, log in with the Sandbox buyer and approve. The driver waits (default 180 s,
`E2E_APPROVAL_TIMEOUT_MS`) until the order is `PAID`. Record the PayPal Sandbox order id it prints.

Expected: order status `PAID`, spent amount counts only paid orders. Wrong total or an ambiguous create stops the run; it never creates a second order.

### 3. Webhook delivery and replay (idempotency)

1. In the PayPal Developer dashboard open the webhook, find the `PAYMENT.CAPTURE.COMPLETED` delivery for this order and confirm it was answered with 2xx.
2. Use **Resend** on that delivery. The Webhooks Simulator is *not* proof, because its mock events are not signed like real ones.
3. Expect no second state change: same order status, same paid total, still one capture. Compare `GET $BASE/api/orders` before and after (add `-H "X-Ops-Key: $OPS_KEY"` if the dashboard is private).
   If PayPal ever sends a capture whose amount or currency does not match, or one without amount evidence, the order must stay
   `PAYMENT_PENDING` and a row appears in `webhook_reviews` (`SELECT * FROM webhook_reviews ORDER BY recorded_at DESC;`).
   A normal Sandbox payment must NOT create such a row; if it does, that is a finding to report, not to ignore.
4. An unsigned request must be rejected:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/webhooks/paypal" -H "content-type: application/json" -d '{}'
```

Expect `401`.

### 4. Refund with merchant approval

The shopper can never trigger a refund. A merchant proposes, then approves; the AI can only propose.

```bash
curl -s -X POST "$BASE/api/refunds/propose" -H "X-Ops-Key: $OPS_KEY" -H "content-type: application/json" \
  -d '{"orderId":"<ORDER_ID>","amountMinor":300,"reason":"Sandbox E2E partial refund"}'
# note the refund id in the answer (status PROPOSED), then:
curl -s -X POST "$BASE/api/refunds/<REFUND_ID>/approve" -H "X-Ops-Key: $OPS_KEY"
```

Expect HTTP `200` with `REFUNDED` (or `202` with `PROCESSING` that reconciles to `REFUNDED` shortly). Then:

- Approve the same refund again: it must not create a second PayPal refund.
- `GET $BASE/api/refunds` shows the record; the refunded amount (EUR 3.00 here) never exceeds what was captured.
- The PayPal Sandbox transaction view shows the partial refund.

### 5. Optional: restart persistence

Restart the service from the Render dashboard, then confirm `GET $BASE/api/orders` still lists the order and the refund. Do not delete data.

## Record the result

Add to `docs/PLATFORM_STATUS.md` (date, who ran it, PASS / FAIL / BLOCKED per step, the Sandbox order id and refund id; no secrets):

| Step | Result | Date | Run by |
|---|---|---|---|
| 1 Health and guards | Boot log OK: production, PayPal enabled, PostgreSQL migrations up to date | 2026-10-27 | owner (Render logs) |
| 2 Buyer approval and capture | PASS: order `ac830417…2e91bb2a`, EUR 18.00, PAID, capture `5AU4••••990S`, mandate signature valid | 2026-10-27 | owner (deployed app) |
| 3 Webhook delivery, replay, unsigned 401 | not yet run | | |
| 4 Refund approval, double approve, partial amount | not yet run | | |
| 5 Restart persistence (optional) | | | |

A step you could not run stays **BLOCKED**. It is never reported as a pass.

# Refund cycle: PayPal Sandbox test runbook

Status: **not yet verified against the live PayPal Sandbox.** The cycle below is covered by automated
tests with a mocked PayPal client; this runbook is how to prove it for real (about 10 minutes).
Record the result in the table at the end. Do not describe the refund flow as sandbox-verified in the
README or the demo until every step passes.

## The cycle in one picture

```
customer: "Request refund" (receipt)  ──►  PROPOSED  (no money moves)
Ops Copilot or merchant: propose      ──►  PROPOSED
merchant: Approve & refund (key)      ──►  PROCESSING ──► REFUNDED   (the only code path that calls PayPal)
merchant: Reject                      ──►  REJECTED
```

Customers see: *Under review*, *Being processed*, *Refunded*, *Declined*. Nothing is ever refunded
automatically, and the amount is always computed by the server (never taken from the shopper or the AI).

## Prerequisites

- Render env: `OPS_COPILOT_KEY` set (16+ characters), PayPal Sandbox client id/secret configured.
- A Sandbox buyer account (the one you already use) and access to the Sandbox merchant account's activity.

## Steps and expected results

| # | Action | Expected |
|---|---|---|
| 1 | Storefront: add a coffee (€3.00), pay in PayPal Sandbox, press **Confirm** | Receipt with status PAID and a capture id |
| 2 | In the receipt, open **Problem with this order?**, pick a reason, **Request refund** | Status line: *€3.00 · Under review by the café*. The form disappears (one open request per order) |
| 3 | Dashboard → **Refund queue** → enter the merchant key → Refresh | One entry: *requested by customer*, state PROPOSED, the reason you chose |
| 4 | Press **Evidence** on that entry | The dispute-defense narrative: timeline with *Refund requested*, the key facts, the recommended response |
| 5 | Press **Approve & refund** | Message *Refund issued in PayPal sandbox*; state REFUNDED; a PayPal refund id is shown |
| 6 | PayPal Sandbox: merchant account activity and the buyer account | A refund of the same amount appears on both sides |
| 7 | Storefront receipt → **Check status** | *€3.00 · Refunded* |
| 8 | Press **Evidence** again | Timeline also shows *Refund issued*; recommended response says the buyer was refunded in full and not to contest a dispute |

### Negative checks

| Action | Expected |
|---|---|
| Request a second refund for the same order | Rejected: already fully refunded |
| Open the refund queue with a wrong key | *The access key was not accepted* |
| Request a refund for an unpaid order | Rejected: only paid orders can be refunded |
| Propose a partial refund: `POST /api/refunds/propose` `{ "orderId": "...", "amountMinor": 100, "reason": "Partial test" }` with the `X-Ops-Key` header, then approve | €1.00 refunded; the order keeps €2.00 refundable; a later full request is capped at €2.00 |
| Split bill: pay one share, request a refund on that share's order only | Only that participant's share is refunded; the other shares are untouched |

If PayPal answers PENDING the request moves to *Being processed* (HTTP 202) and is **not** retried
automatically; check the PayPal dashboard before doing anything else.

## Results (fill in)

| Step | Date | Pass / fail | Evidence (screenshot or id) |
|---|---|---|---|
| 1-2 customer request | | | |
| 3-4 queue and evidence | | | |
| 5-6 approval and PayPal refund | | | |
| 7-8 status and evidence after refund | | | |
| Negative checks | | | |
| Partial refund | | | |
| Split bill share refund | | | |

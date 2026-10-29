# Split Bill — architecture design (Priority 6)

> Status: **design proposal** (no production code yet). Split Bill changes the
> core assumptions of the current app (one session, one payment, one cart), so it
> is specified here before any implementation to avoid a risky rewrite.

## 1. Current model vs. required model

| Dimension | Today | Split Bill requires |
| --- | --- | --- |
| Actor | One session (`sessionId` → `userId`) | Many participants coordinated per bill |
| Payment | One PayPal order, one capture | Many shares, each paid (and evidenced) on its own |
| Cart | One cart owned by the session | A **shared** cart with per-person shares |
| QR | Cart Mandate **verification** | Payment **invite / share claim** |
| Evidence | One package per order | One package per share + one group settlement passport |
| Allowance | One `PurchasePolicy` per user | Each participant's own scoped allowance applies to *their* share |

## 2. Key design decision: "one merchant, many payers"

PayPal does not expose a general "split settlement to one merchant in a single
transaction" primitive in the sandbox. The safe model is therefore:

- The **merchant receives N independent payments**, one per participant share.
- Each share is a normal PayPal order for *that share's amount*, owned by that
  participant's session, and captured with buyer approval — exactly the flow we
  already trust.
- The bill group is **settled** only when every share is `PAID` (or explicitly
  waived/cancelled). Partial settlement is allowed and surfaced honestly.

This reuses the existing, proven order/capture/evidence pipeline instead of
inventing a new money path.

## 3. Domain model (proposed)

```
BillGroup
  id                 bill_<hash>
  merchantId         (currentBusiness.businessId)
  currency
  status             OPEN | PARTIALLY_SETTLED | SETTLED | CANCELLED | EXPIRED
  createdByUserId
  totalMinor         server-computed from the shared cart
  items[]            { productId, quantity, unitPriceMinor, lineTotalMinor }  (server-priced)
  shares[]           BillShare
  createdAt, updatedAt, expiresAt

BillParticipant
  userId             (their own session/user identity)
  displayName        (optional, user-supplied)
  joinedAt
  role               OWNER | PARTICIPANT

BillShare
  id                 share_<hash>
  participantUserId
  amountMinor        (server-computed; see §4)
  status             PENDING | PAID | WAIVED | FAILED
  orderId?           (the PayPal-backed order for this share)
  paypalCaptureId?
  paidAt?

BillInvite
  token              signed, short-lived (see §6)
  billId
  createdByUserId
  expiresAt
```

All amounts are computed **server-side** from the shared cart; a participant can
never send their own amount.

## 4. Split strategies (server-authoritative)

- `EQUAL`: each of N participants pays `floor(total / N)`, with the remainder
  minor units distributed deterministically (e.g. to the first `total % N`
  participants by stable sort of `userId`).
- `ITEMIZED`: each participant claims whole line items; unclaimed items fall back
  to `EQUAL` among all participants (or to the owner if configured).
- `CUSTOM`: participants propose weights; the server normalizes and **rejects**
  any set that does not sum to the total (422).

The chosen strategy is stored on the `BillGroup` and frozen once any share is
`PAID` (later changes only affect still-`PENDING` shares, or require a new group).

## 5. API surface (proposed)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/bills` | Create a bill group from a validated cart (owner) |
| POST | `/api/bills/:id/invite` | Mint a signed invite token + QR payload (owner) |
| POST | `/api/bills/join` | Join via invite token (returns the group + your share) |
| GET | `/api/bills/:id` | Group state, shares, settlement progress |
| POST | `/api/bills/:id/strategy` | Set/replace split strategy (frozen once paid) |
| POST | `/api/bills/:id/claim` | Claim items (ITEMIZED) or accept your share |
| POST | `/api/bills/:id/shares/:shareId/pay` | Create the PayPal order for **your** share |
| POST | `/api/bills/:id/shares/:shareId/capture` | Capture after buyer approval |
| GET | `/api/bills/:id/evidence` | Group settlement passport (all shares + integrity) |
| GET | `/api/bills/:id/shares/:shareId/evidence` | Per-share dispute evidence package |

Every mutating call requires the participant's own session; ownership checks are
identical to the current "another session's order is a 404" rule.

## 6. QR = payment invite (not mandate verification)

Today the QR encodes a **verify** link for the signed Cart Mandate. For Split
Bill it becomes an **invite**:

- Payload: `https://<host>/join#t=<signed-invite-token>`.
- The token is an Ed25519-signed, short-lived JWT-like blob
  `{ billId, exp, nonce }`, signed with the **same keyring** as the Cart Mandate
  so one public key verifies both.
- Scanning opens the join page, which calls `POST /api/bills/join`. The token is
  verified server-side (signature + expiry + single-use nonce); the client never
  decides membership or amounts.
- The per-share Cart Mandate still exists (each share is a real order), so the
  existing `verify.html` QR flow keeps working **per share**.

## 7. Allowance & policy interaction

- Each participant's **own** `PurchasePolicy` (Scoped AI Allowance) governs their
  share amount, not the group total. A participant whose allowance blocks their
  share is told exactly why (existing `PolicyService` violations).
- The group is still subject to merchant-level rules (currency, blocked
  categories) evaluated once at group creation.
- Frequency rules (`maxOrdersPerHour`) count **shares paid**, so one bill with 4
  shares does not look like 4 unrelated orders for abuse detection — the group id
  is carried on each share's order for correlation.

## 8. Evidence & settlement passport

- **Per share:** a normal evidence package (`aicafe.evidence/1`) — signed mandate,
  policy events, approval, timeline, dispute defense. Unchanged contract.
- **Group:** a `BillSettlementPassport` that references each share's package
  digest and signature, plus the group timeline (created → joined → claimed →
  each share paid → settled). It is signed with the same keyring, so an auditor
  can verify the whole bill from one document while drilling into any share.

## 9. Consistency & failure handling

- Share payment reuses `payment-lifecycle.ts` (write-ahead capture marker,
  reconciliation, no auto-retry, honest `DECLINED`/`UNKNOWN` handling).
- Group status is **derived** from shares (never stored as the source of truth
  for money); `SETTLED` only when every share is `PAID`/`WAIVED`.
- A participant leaving mid-flow cancels only their `PENDING` share; paid shares
  are never released.
- Idempotency: `Idempotency-Key` is scoped to `(billId, shareId, participantUserId)`.

## 10. Phased rollout

1. **P1 — Read-only group:** create bill from cart, invite/join, equal split,
   show shares and progress. No payments yet.
2. **P2 — Per-share payment:** reuse the existing order/capture pipeline per
   share; per-share evidence packages.
3. **P3 — Strategies:** itemized + custom splits, claim flow, frozen strategy.
4. **P4 — Settlement passport:** group-level signed evidence + dashboard view.
5. **P5 — UX:** QR invite page, mobile Flutter "Bill" screen, notifications.

## 11. Risks / trade-offs

- **N payments instead of 1** means N PayPal orders: more idempotency surface,
  but it reuses a path we already trust and keeps buyer approval per person.
- **Partial settlement** must be surfaced honestly (never claim "paid" for the
  group when only some shares are paid).
- **Multi-user sessions** need a participant identity distinct from the current
  one-user-per-session assumption; the invite token binds a joiner to their own
  session, so the existing `requireSession` model is preserved.
- **Amount tampering** is the main attack surface; the server computes every
  share amount from the server-priced cart and rejects client-supplied amounts.

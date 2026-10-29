# AI Café — API Contract Freeze (Aşama 0)

This document freezes the wire contract for the trust-layer endpoints. It is the
single source of truth for what the backend MUST emit and what clients MUST
tolerate. The client rules are **backward compatible**: an older backend or an
older stored order must never break the receipt, the evidence view, or
checkout.

## 1. Freeze principle

- **Server is authoritative.** Every value shown in the client comes from the
  signed server payload. The client never infers, guesses, or fabricates a
  decision, an approval, a payment outcome, or a rescue status.
- **Backward compatibility (additive only).** New fields are OPTIONAL for the
  consumer. Old payloads without them still parse and render — the UI simply
  hides the missing sections. Never remove or rename an existing field.
- **No client auto-retry.** When the backend marks an operation `retryable`,
  the client only informs the user; it never retries on its own.

## 2. Evidence package (`GET /api/orders/:id/evidence`)

Signed, PII-minimized, version `aicafe.evidence/1`. Structure (frozen):

```
{
  "version": "aicafe.evidence/1",
  "orderId": string,
  "issuedAt": ISO8601,
  "mandate": SignedCartMandate,
  "order": EvidenceOrderSummary,
  "policyEvents": EvidencePolicyEvent[],
  "timeline": EvidenceTimelineStep[],        // P1, optional for old backends
  "disputeDefense": EvidenceDisputeDefense,  // P1, optional for old backends
  "humanApproval": { authority, state, paypalCaptureId? },
  "integrity": { alg:"EdDSA", kid, canonicalization, digest, signature }
}
```

### 2.1 `timeline[]` (server-built, chronological, render verbatim)

```
[
  { "step":"ORDER_CREATED",      "at":"…Z", "detail":"order-7" },
  { "step":"POLICY_EVALUATED",   "at":"…Z", "decision":"ALLOW", "detail":"within limits" },
  { "step":"HUMAN_APPROVAL",     "at":"…Z", "detail":"approved" },
  { "step":"PAYMENT_CAPTURED",   "at":"…Z", "detail":"CAP-1" }
]
```
`step` enum: `ORDER_CREATED | POLICY_EVALUATED | HUMAN_APPROVAL | PAYMENT_CAPTURED`.
The client localises labels; it never re-sorts or re-derives.

### 2.2 `policyEvents[].ruleDetails[]` (P1)

```
{ "type": "CONFIRMATION_THRESHOLD_EXCEEDED",
  "rule": "confirmationThresholdMinor",
  "expected": 1500, "actual": 2000,
  "message": "Cart total 2000 exceeds confirmation threshold." }
```

### 2.3 `disputeDefense` (P1)

```
{ "templateVersion": "aicafe.dispute-defense/1",
  "claimType": "AUTHORIZED_CHECKOUT",
  "orderReference": "order-7",
  "amountMinor": 2000, "currency": "EUR",
  "keyFacts": [ "…" ],
  "evidencePointers": [ { "label": "Timeline", "pointer": "timeline[]" } ],
  "recommendedResponse": "…",
  "narrative": "multi-line text…" }
```
The narrative is evidence, never a guarantee. The client must present it as a
prepared statement, not as a promise that the dispute will be won.

### 2.4 Client degradation rules

| Field absent | Client behaviour |
|---|---|
| `timeline` | Passport falls back to composing steps from order + policyEvents |
| `ruleDetails` | "Rules checked" section is hidden |
| `disputeDefense` | Defense section is hidden |
| `disputeDefense.narrative` malformed | Section hidden, receipt unaffected |

Verification is only ever shown from the server reply to
`POST /api/evidence/verify`; a missing/unverified check is never rendered as a
success.

## 3. Checkout Rescue error body

All rescue fields live under `details` (they are advisory display data).

### 3.1 Upstream busy / ambiguous (502, `PAYPAL_BUSY`)

```
{ "error": "PayPal is busy right now. Please wait about 30 seconds and try again.",
  "details": {
    "code": "PAYPAL_BUSY",
    "retryable": true,
    "retryAfterSeconds": 30,
    "suggestion": "Wait about 30 seconds, then retry. Your cart is saved.",
    "alternativePayment": "You can also try a card or another payment method.",
    "cartSaved": true
  } }
```

### 3.2 Ambiguous capture, reconcile first (502)

```
{ "error": "The previous capture outcome could not be verified; no new capture was attempted.",
  "details": { "paypalIssue": "CAPTURE_RECONCILIATION_REQUIRED",
                "retryable": true } }
```

### 3.3 Declined (402)

```
{ "error": "Payment declined",
  "details": { "paypalIssue": "CAPTURE_DECLINED" } }
```
(note: `retryable` absent → client shows a plain error, no rescue guidance)

### 3.4 Already captured / settled (409)

```
{ "error": "Order already captured",
  "details": { "settled": true } }
```
`details.settled == true` is the ONLY signal that lets the client treat an
ambiguous conflict as PAID. A bare 409 without `settled: true` is unresolved:
the client keeps the pending order and never fabricates `PAID`.

## 4. Policy rule additions (P4)

Optional rule fields (validated, PATCH/GET `/api/policy`):
`nightWindow` (`startHour`/`endHour`/`maxMinor`), `categorySpendLimits`
(category → minor), `maxOrdersPerHour` (int), `allowedCountries` (string[]).
New violation types: `TIME_WINDOW_LIMIT_EXCEEDED`,
`CATEGORY_SPEND_LIMIT_EXCEEDED`, `FREQUENCY_LIMIT_EXCEEDED`, `GEO_RESTRICTED`.
Evaluation is in UTC.

## 5. Seed test data per error type

| Scenario | Endpoint | Expected status | Key body fields |
|---|---|---|
| Upstream busy | `POST /api/orders/create` | 502 | `code=PAYPAL_BUSY`, `retryable=true`, `retryAfterSeconds=30`, `cartSaved=true` |
| Ambiguous capture (reconcile) | `POST /api/orders/:id/capture` | 502 | `paypalIssue=CAPTURE_RECONCILIATION_REQUIRED`, `retryable=true` |
| Declined instrument | `POST /api/orders/:id/capture` | 402 | `paypalIssue=CAPTURE_DECLINED` |
| Already captured (verified) | `POST /api/orders/:id/capture` | 409 | `details.settled=true` |
| Already captured (bare) | `POST /api/orders/:id/capture` | 409 | no `settled` |
| Policy block | `POST /api/orders/create` | 403 | `policyDecision=BLOCK`, `violations[]`, `reason`, `suggestion` |

## 6. Baseline tests enforcing the freeze

- Backend: `tests/unit/policy-rules.test.ts`, `tests/integration/evidence-enrichment.test.ts`
  (timeline present; disputeDefense fields; ruleDetails; tamper → verify fails),
  plus the full `jest` suite (94 suites / 1000 tests).
- Flutter model: `test/evidence_package_test.dart` — forward + backward-compat
  parsing, verbatim re-encode for verification.
- Flutter rescue parsing: `test/rescue_parse_test.dart` — structured fields,
  `settled` flag, and "no invented rescue on plain failure".
- Flutter SDK: `flutter analyze` (0 issues). Widget/provider suites run under
  `flutter test` in CI (`checkout_provider_test.dart`,
  `checkout_localization_test.dart`, `api_service_test.dart`,
  `paid_receipt_card_test.dart`, `checkout_capture_state_test.dart`).

**Release gate (Aşama 3):** a release is not green until (a) the whole backend
suite + `tsc` pass, (b) `flutter analyze` is clean, (c) the pure-Dart tests
pass, and (d) the engine-based suites pass in a normal `flutter test`
environment.

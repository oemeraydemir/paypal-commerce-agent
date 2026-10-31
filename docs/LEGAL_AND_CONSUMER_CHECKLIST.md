# Legal and consumer-protection checklist (AI Café)

**This is an engineering checklist, not legal advice.** It records what the software does, what it
deliberately does not claim, and what must be confirmed by a qualified lawyer before AI Café is used
with real money, real customers or real food in Germany, Austria, Switzerland or elsewhere in the EU.
References are given so a lawyer can find the topic quickly; please have them verified, because laws and
their numbering change.

**Current status:** a hackathon demo on the PayPal **Sandbox**. No real money moves, no real goods are
sold, and the catalog is sample data. Most duties below begin when real contracts with consumers exist.

## 1. What the software already does that helps

| Topic | Behaviour in the product |
|---|---|
| The AI cannot bind the customer | The AI only prepares a cart. Payment needs the customer's approval in PayPal and a final button "Confirm and pay now" |
| Clear payment obligation at the final step | The final button states that it pays now (relabelled from "Confirm payment") |
| Prices | Calculated by the server from the catalog; the AI and the browser cannot set them |
| Spending allowance | A user-visible limit, enforced by the server on the **whole** order, before any split. Splitting never raises it |
| Each person pays only their own share | Split Bill creates one PayPal order per share; nobody can pay another person's share |
| Health data minimised | Allergen choices never leave the device; the diet preference is used for one request and is not stored |
| No false safety claims | Diet labels are marked "sample data, not verified by the café"; the product never says "safe" or "allergen-free" |
| Refund path | A customer can request a refund from the receipt; a person at the café decides; nothing is automatic |
| Evidence | Signed evidence package with a timeline of recorded events only |
| Transparency | The page explains the AI's role, server pricing, the sandbox and the refund path ("How this order works") |

## 2. Blocking items before real-money use

1. **Allergen information for real food.** Food law requires allergen information for non-prepacked food
   (EU Regulation 1169/2011, Art. 44, plus national rules). "The café publishes no allergen data" is
   acceptable for a demo and **not** for real sales. The café must supply verified data for the 14 listed allergens.
2. **Seller identity (imprint).** Name, address, contact and registration details must be reachable from every page
   (DE: § 5 DDG; AT: § 5 ECG; CH: UWG Art. 3). Not implemented: the demo has no operator data.
3. **Pre-contractual information for distance contracts** (EU Directive 2011/83/EU Art. 6; DE: Art. 246a EGBGB):
   essential features, total price including taxes, pickup/delivery terms, payment terms, complaint handling,
   withdrawal information. Not implemented beyond the price and pickup slot.
4. **Order button wording.** In Germany the final button must say clearly that it creates a payment obligation
   (§ 312j(3) BGB, usually "zahlungspflichtig bestellen"). The app has no German UI yet; the English and Turkish
   labels say "Confirm and pay now". A German label must be added before a German launch.
5. **Total price display** including VAT (DE: PAngV). The catalog has no VAT data.
6. **Contract confirmation on a durable medium** (§ 312f BGB): an on-screen receipt exists; an e-mail
   confirmation does not.
7. **Right of withdrawal.** 14 days by default; there are exceptions, for example goods that spoil quickly
   (§ 312g(2) no. 2 BGB; Directive Art. 16). Whether made-to-order food with a pickup slot falls under an exception
   must be decided by a lawyer, and the customer must be told either way. The refund request in the app is a
   convenience flow and must **never** be presented as replacing statutory rights.
8. **Statutory warranty and remedies** cannot be excluded for consumers. The wording of the refund screen should be
   reviewed so it does not suggest otherwise.
9. **Privacy notice** (GDPR Art. 13) naming the processors: hosting (Render), PayPal, and the AI providers that
   receive the shopper's chat text. A data-processing agreement is needed with each processor.
10. **Dispute resolution information** (DE: VSBG § 36). The EU ODR platform was discontinued in 2025
    (please verify); do not link to it.

## 3. Items to review with a lawyer

- **Name "mandate".** In EU payments a "mandate" usually means a direct-debit authorisation (for example SEPA).
  The English UI therefore says **"Spending allowance"** (Turkish: "Harcama izni"). Internal code still uses
  "mandate". The allowance is a user-set limit and a control, **not** a legal power of representation for the AI.
- **AI transparency.** The EU AI Act contains transparency duties for systems that interact with people
  (Art. 50; please verify the application dates). The UI labels AI answers and rule-based fallbacks.
- **Local storage.** The cart and session id are kept in the browser. This is generally treated as strictly
  necessary, but it must be mentioned in the privacy notice (TDDDG § 25 in Germany).
- **Diet and allergen data** can be health data (GDPR Art. 9). Keeping them on the device is the safest design;
  do not add server-side storage without a legal basis and consent.
- **Payment services.** PayPal is the payment institution and handles authentication (SCA). AI Café never sees
  card data. The merchant agreement and PayPal's acceptable-use policy apply to a live account.

## 4. Split Bill: open legal and product questions

| Question | Current behaviour | Recommendation |
|---|---|---|
| Who is the contracting party for the whole order? | Not defined in the product | Decide with a lawyer: organiser only, or each person for their own share. State it in the terms |
| What if not everyone pays? | The bill stays open without a time limit; people who paid can only ask for a refund | **Add an expiry** (for example 24 h) after which every paid share gets a refund proposal for the café to review. Not implemented |
| Do guests see the terms before paying? | They see items, total and their share | Show the pre-contractual information and the terms to every guest before the pay button |
| Is the order fulfilled before the bill is settled? | The demo marks it complete only when all shares are paid | Keep this rule and tell customers |
| Personal data of guests | A session id only | Keep it that way; do not collect names or e-mails without a reason |

## 5. Refund and dispute cycle

- Customers can request a refund; the café approves or declines; the PayPal refund is issued only after approval.
- The evidence package lists only events that were actually recorded and states when a refund was already issued.
- **Not verified against the live PayPal Sandbox yet:** see `REFUND_SANDBOX_TEST.md`.
- PayPal Disputes API submission is deliberately **not** automated.

## 6. Wording rules for the UI (keep)

- Never write "safe", "allergen-free", "guaranteed" or "suitable for an allergy".
- Never imply that nothing can be refunded or that statutory rights are excluded.
- Never claim that sandbox behaviour was verified live before it is (see the status table in the README).
- Say "allowance" for the limit, not "mandate", in consumer-facing English.

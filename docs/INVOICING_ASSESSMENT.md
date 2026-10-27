# Invoicing / E-Rechnung — product and technical decision

**Decision for this sprint: do NOT build invoicing. Document the opportunity, the legal constraints and a
small first step instead.**

Reason in one line: a correct invoice is a tax document, not a PDF. Shipping a half-correct one before a
demo would add legal risk and demo risk while removing none.

Nothing in this document is legal or tax advice. Every statement about German law must be confirmed with a
tax adviser (Steuerberater) before it is used commercially.

---

## 1. Who is the first customer?

| Segment | Needs an invoice? | Notes |
|---|---|---|
| **B2C** (the AI Café demo: coffee, breakfast, cakes) | Rarely. A receipt is enough; a full invoice is only requested for expense claims. | The current catalog and flow are B2C. |
| **B2B** (office catering, the `catering` category already in the catalog) | Yes — the buyer needs a deductible invoice with VAT shown separately. | This is where invoicing creates real value. |
| **B2B2C / reseller** | Yes, and with correct VAT treatment per country. | Out of scope for now. |

**Conclusion:** the first paying use case is B2B catering/office orders, not the B2C coffee flow. That is a
*product* decision before it is an engineering one: AI Café would have to collect a company name, address
and VAT id at checkout, which changes the checkout UX the demo depends on.

## 2. What problem does it solve?

For a business buyer: "I paid €240 for the team breakfast and I need a document my accountant accepts,
without e-mailing the café and waiting two days." That is a real, payable problem — but it is a *merchant
back-office* problem, not a shopper-chat problem. It does not make the AI agent better; it makes the
merchant's admin cheaper. Those are different roadmaps.

## 3. Can an invoice be produced reliably from today's order data?

Partly. What exists (verified in code):

| Field needed on an invoice | Available today? | Where |
|---|---|---|
| Line items, quantity, unit price, line total | **Yes** | `orders.items` (`src/orders/domain.ts`) |
| Order total and currency | **Yes** | `orders.totalMinor`, `orders.currency` |
| Order date | **Yes** | `orders.createdAt` |
| Merchant name | **Yes** | business profile (`src/config/business-config.ts`) |
| Merchant address, VAT id / tax number, tax office | **No** | not in the business profile |
| Buyer name and address | **No** | the buyer is an anonymous session; no user profile exists |
| VAT rate per line (7 % / 19 % in Germany, food vs. drinks differ) | **No** | the catalog has prices only, no tax category |
| Sequential, gap-free invoice number | **No** | no invoice sequence exists |
| Payment status and method at invoice time | Partly | order status + `paypalCaptureId` |

So roughly half the mandatory content is missing, and the missing half is exactly the part that requires
product and legal decisions (tax categories, numbering, buyer identity), not code.

## 4. A PDF is not an E-Rechnung

This distinction is the most common mistake and must not be blurred in any demo material:

- **PDF invoice** — a human-readable document. Since 2025 it is **not** a valid B2B e-invoice in Germany.
- **XRechnung** — pure structured XML (UBL or CII), the German CIUS of EN 16931. No PDF at all.
- **ZUGFeRD 2.x** — a **PDF/A-3** with an embedded XML attachment (CII), profiles MINIMUM → EXTENDED;
  the EN 16931-conformant profiles are the ones that count as a valid e-invoice.

An AI Café "invoice PDF" would be a receipt-style document, **not** an E-Rechnung, and must never be
labelled as one.

## 5. German market requirements (to be confirmed by a tax adviser)

- Since **1 January 2025**, German B2B businesses must be able to **receive** e-invoices.
- **Issuing** becomes mandatory in **2027** for businesses above €800,000 turnover and in **2028** for all
  (Wachstumschancengesetz). *(Verified via public sources; the exact scope for a given merchant must be
  confirmed professionally.)*
- Accepted structured formats are the EN 16931 ones — XRechnung and ZUGFeRD.
- **Validation requirements:** an XRechnung must validate against the XSD **and** the Schematron rules
  (KoSIT validator / Mustangproject); ZUGFeRD needs a PDF/A-3 validator plus the embedded-XML Schematron.
  Producing well-formed XML is not the same as producing a valid invoice.
- **Numbering:** sequential, unique, gap-free per merchant and per year. A retry or a crash must never
  consume or duplicate a number — this needs a database sequence with its own transaction, which does not
  exist today.
- **Corrections/cancellations:** a wrong invoice is corrected with a cancellation (Storno) or a corrected
  invoice that references the original. Deleting or editing an issued invoice is not allowed.
- **Retention:** invoices must be retained for the statutory period (currently 8 years, with a 10-year
  rule for certain documents) and must remain machine-readable — i.e. the XML must be archived, not just
  the PDF. The current storage is a PostgreSQL row; an archival concept does not exist.
- **Data integrity (GoBD):** issued invoices must be immutable and auditable. Today's order rows are
  mutable by design (status transitions).

## 6. External dependencies and risks

| Dependency | Risk |
|---|---|
| Tax adviser sign-off on VAT categories and invoice content | **Blocking.** Without it, nothing can be issued. |
| A validation library (Mustangproject / KoSIT validator) | New dependency, Java-based for the reference validator; needs a maintenance and security review (`docs/DEPENDENCY_ADVISORIES.md`). |
| Invoice numbering with gap-free guarantees | Requires a new table + transaction design; a bug here is a tax problem, not a UX bug. |
| Buyer identity collection | Changes checkout UX and adds personal data (GDPR: retention, deletion requests vs. tax retention — a genuine conflict to resolve). |
| Per-merchant PayPal + billing split | An invoice must match who actually received the money; with per-merchant PayPal accounts this becomes per-tenant invoicing. Ties into `docs/MULTI_TENANT_READINESS.md`. |

## 7. Decision and the smallest safe next step

**This sprint:** no invoicing code. The demo flow, the payment path and the jury package stay untouched.
Adding an invoice generator now would need buyer data, VAT logic and numbering — three areas where a
mistake is invisible in a demo and expensive in production.

**Next sprint (proposal, in order):**

1. **Product decision first** — is the target B2B catering? If yes, define the buyer fields the checkout
   must collect.
2. **Tax workshop** with an adviser: VAT categories per product, invoice mandatory fields, numbering
   scheme, retention.
3. **Data model** — add `taxCategory` to products, `invoiceSequence` table, `invoices` table (immutable,
   append-only), buyer fields on the order.
4. **Receipt first, E-Rechnung later** — a clearly labelled *receipt* (no tax-document claim) is the
   low-risk first deliverable, because it does not carry the numbering and format obligations.
5. **XRechnung/ZUGFeRD only after** validation tooling and the numbering guarantees are in place, and
   after a validator runs green on a fixture set.

**What must never happen:** calling a generated PDF an "E-Rechnung", or claiming tax compliance without
professional validation.

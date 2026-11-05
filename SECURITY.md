# Security

AI Café is a hackathon prototype running against the **PayPal Sandbox**. It does not handle live money.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository (Security → Report a vulnerability), or email the
maintainer listed in the repository profile. Please do not file public issues for vulnerabilities. Expect an
acknowledgement within a few days; there is no bug bounty.

## Security model (what the code enforces)

* **The AI cannot move money.** The agent has catalog and cart tools only; it has no PayPal client, no refund tool
  and no tool that reads or changes the spending mandate or the Wellbeing Guard.
* **Server-side policy.** Prices, limits, merchant allow-list, diet and allergen rules are enforced by the policy
  engine on every order path; client-side checks are conveniences. Increasing spending authority needs explicit
  confirmation and is recorded in a hash-chained audit trail.
* **Payments.** Capture is idempotent and bound to the server-side amount; webhook signatures are verified with
  PayPal's verification API; duplicate webhooks are ignored; uncertain outcomes are reconciled, never assumed.
* **Refunds and disputes.** A shopper or the AI may only *ask*; only an authenticated merchant action calls PayPal's
  refund API (idempotent request id). Refunds cannot exceed the captured amount. Dispute evidence is never submitted
  to PayPal by the app.
* **Access control.** Shopper sessions are token-bound; merchant routes need `X-Ops-Key`; the dashboard is read-only
  and public **by design for the hackathon demo** (stated on the page). Per-IP rate limits protect checkout and the
  merchant routes.
* **Privacy.** The Wellbeing Guard (diet and allergen concerns) is session-scoped, held in server memory for 24 h and
  never written to the database. Evidence exports exclude credentials and personal data. Allergen data is declared by
  the café and unverified; the app gives no medical advice.
* **Secrets.** Credentials come from environment variables; `.env` files are excluded from the repository and the
  submission ZIP.

## Known gaps

See `docs/KNOWN_LIMITATIONS.md`. In particular: the public demo dashboard has no authentication, the mandate audit
trail is in memory, dependency advisories exist in the transitive tree (`npm audit`), and nothing has been verified
against a live PayPal account.

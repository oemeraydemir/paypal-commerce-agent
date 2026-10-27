# AI Café — Known Limitations

**Status date:** 27 October 2026  
**Purpose:** Describe what the current hackathon prototype does and does not establish. This is a candid scope and verification note, not a claim of production readiness.

> **Evidence note:** Statuses and test results below are based on the project owner's reports in this conversation. They were not independently re-run while preparing this document. “Pass” means a reported check passed within its stated scope; it does not imply production, device, or end-to-end validation unless explicitly stated.

## Current scope and limitations

| Area | Reported status | What is established / what remains |
|---|---|---|
| Storefront branding | Pass | Branding work is reported as passing. Continue to check it in the complete regression suite. |
| Secure Markdown rendering | Pass | Reported passing. Real-user content and browser behavior should still be reviewed in the deployed experience. |
| AI Café / CoCo SVG branding | Pass | SVG assets are reported as passing. Compare appearance in Web and Flutter before presenting the demo. |
| “Why these items?” explanation | Pass | Reported passing. Verify the explanation against real catalog data on both platforms. |
| AG Grid dashboard | Pass; deployment check pending | The feature/test is reported as passing; CDN behavior and the distributed dashboard still require the separate browser check. |
| CSP and basic security headers | Pass; deployment check pending | Reported passing in the project. Confirm the effective headers on the deployed service and its current configuration. |
| Dietary preferences | Partial | Preferences can constrain recommendations, but they do not make the catalog's dietary data complete or independently verified. |
| Allergens | Partial; safety limitation | Reliable allergen data is not available for every product. A missing allergen label is **not** evidence that an item is allergen-free. Do not use the prototype as an allergy-safety guarantee. |
| Quick replies / option selection | Implemented; Web smoke test reported | The owner reports that the live Web flow returns numbered catalog options and allows selection. Android parity and a complete device-level acceptance run have not been reported. |
| Shopper profile | Implemented; platform checks incomplete | Profile selections are intended to affect subsequent recommendations. Confirm this behavior in deployed Web and Android flows; a profile control is not itself a cart-add action. |
| Cart preparation and purchase policy | Implemented; constrained | A prepared cart is subject to server-side checks and user review. This does not guarantee the best possible recommendation or complete catalog data. Selecting an option does not authorize or execute payment. |
| PayPal checkout and refunds | Partial | Unit/integration results have been reported, including refund-persistence tests. A complete PayPal Sandbox run—from test-buyer approval and capture through webhook and refund/approval recovery—has not been reported as completed. Do not claim a fully verified end-to-end payment lifecycle. |
| Multi-tenant SaaS isolation | Partial | Tenant isolation and cross-tenant access testing remain. Do not describe the prototype as a fully isolated multi-tenant SaaS product. |
| E-invoicing | Not started | No jurisdiction-specific legal, tax, or invoice-generation implementation is established. Requirements and qualified tax/legal review are prerequisites. |
| PayPal Vault / BNPL | Not started | No working implementation or account/API eligibility has been established. |
| Voice shopping | Partial | End-to-end use with a real microphone on supported browsers/devices has not been verified. |
| Hackathon submission materials | Partial | Reconcile README and Devpost claims with actual code, repository visibility, live URL, and submission requirements. No demo video has been reported as recorded. Do not imply one exists. |
| Secret rotation | Unconfirmed | The conversation raised the possibility that API or PayPal secrets were previously exposed. Rotation/revocation has not been confirmed. If any real secret was committed or published, revoke/rotate it with its provider; removing a file alone may not remove it from Git history. Never put secrets in README, Postman exports, videos, or logs. |

## Recent verification reported by the owner

- Flutter checkout-localization tests: **3 passed**.
- Flutter checkout/cart-cleanup tests: **6 passed**.
- Flutter full test suite after Issue 5: **150 passed**.
- `flutter analyze`: one `info` lint remains at `lib/screens/chat_screen.dart:516:72` (`curly_braces_in_flow_control_structures`). It is a style diagnostic, not a reported compilation error; it has not been fixed.
- Backend targeted catalog/quick-reply tests: **39 passed** in the reported run. Earlier backend refund integration and full-suite runs also passed as reported, but after later options-routing changes no final all-green backend-suite result was supplied. Treat full backend regression status after those changes as **not yet confirmed**.

These are test results, not proof of production readiness. Automated tests do not replace the pending deployment, cross-platform, PayPal Sandbox, and real-device checks above.

## Demo and claims guidance

For the judging demo, keep the interface in English if that best serves the jury; Turkish remains useful for Turkish-speaking users and should not be presented as a core judging requirement. Demonstrate the actual live build, select an option, review the resulting cart and policy explanation, and show that payment requires a separate user approval step.

Do not claim the following are complete or production-verified: full multi-tenant isolation, e-invoice generation, PayPal Vault/BNPL, allergy safety, real-microphone end-to-end voice shopping, or a complete live payment/refund lifecycle. Do not say a demo video has been recorded unless one has actually been produced.

## Suggested remaining acceptance checks

1. Run the final backend build and complete Jest suite on the current commit; retain the exact passing summary and investigate any failures without weakening existing assertions.
2. Complete one Web and one Android demo scenario, including profile selection, quick-reply selection, cart contents, “Why these items?”, and the separate payment approval boundary.
3. Run the PayPal Sandbox end-to-end flow with a test buyer, including webhook and refund/recovery behavior.
4. Run the distributed dashboard browser test against the deployed environment, not only locally.
5. Inspect the deployed CSP/security headers and verify secrets have been rotated if exposure occurred.
6. Review all hackathon/Devpost statements against current implementation and record or remove any demo-video claim that is not true.

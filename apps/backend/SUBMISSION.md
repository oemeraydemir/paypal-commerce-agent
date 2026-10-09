# Hackathon submission notes

## Project

**AI Café — Agentic commerce with human-authorized PayPal checkout**

### Short description

AI Café helps shoppers order by describing what they want. An OpenAI-powered
shopping agent searches a café catalog and prepares a cart using prices
provided by the backend. Shoppers review the cart and approve payment in PayPal
sandbox. The agent cannot set prices, access PayPal, or authorize payment.
Orders then appear in a live AG Grid operations dashboard.

### Problem and impact

Online shopping makes customers translate everyday requests into searches,
filters, product comparisons, and cart edits. AI Café demonstrates a faster,
conversational alternative for a concrete café use case while keeping the
customer—not the agent—in control of the financial decision.

### What judges can try

1. Start the Flutter app and backend using the root README.
2. Ask for a vegetarian breakfast for two with a €20 budget.
3. Review the AI-generated cart and add or remove items.
4. Open PayPal sandbox, approve using a sandbox buyer, return to AI Café, and
   confirm payment capture.
5. View the resulting order in the AG Grid dashboard.

The backend must be configured with OpenAI and PayPal sandbox credentials for
the complete flow. The app shows which services are configured; the catalog
and manual cart can still be explored without credentials.

## Tools and how they are used

- **OpenAI GPT-4o-mini:** natural-language shopping intent and restricted
  function calling for product search, product detail, and cart preparation.
- **PayPal Orders API:** server-side order creation and capture after buyer
  approval in sandbox. No live mode is supported.
- **AG Grid:** public, read-only order operations dashboard.
- **Flutter:** Android/iOS shopper application.
- **Node.js, TypeScript, Express:** catalog, AI orchestration, PayPal
  integration, and verified webhook handling.

No additional hackathon sponsor tools are claimed.

## Functional demo

Run the Android emulator demo using the complete instructions in
[the repository README](../../README.md). A working hosted backend or hosted
demo has **not** been published from this workspace.

Before submitting, replace the pending values below after publishing the
project and recording the demo:

- **Public source repository:** _add the public GitHub, GitLab, or Bitbucket URL_
- **Hosted demo (optional):** _add the public demo URL, or mark “local setup”_
- **YouTube demo video (required):** _add a public YouTube link, under 3 minutes_
- **Team:** _add the submitting individual or team name_

The source repository must be public and have its license visible at the
repository root. See [LICENSE](../../LICENSE).

## Architecture and operations

- [System architecture](./ARCHITECTURE.md)
- [Run and demo checklist](./DEMO_CHECKLIST.md)
- [Deployment guide](./DEPLOYMENT.md)
- [Backend API and tests](./README.md)

## Prototype limitations

- Orders are stored in memory and disappear when the server restarts.
- PayPal webhook delivery requires a publicly reachable HTTPS backend and a
  registered sandbox webhook; local demos can still capture and inspect orders.
- OpenAI and PayPal credentials are required for their respective live sandbox
  flows and must be configured outside source control.
- This is a hackathon prototype, not a production payment service.

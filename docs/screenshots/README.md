# Screenshots — capture guide & inventory

Screenshots for AI Café are captured from a **running instance**, not from design mocks. This file explains
how to reproduce them. No screenshots are committed to the repository yet; the inventory below is filled in
as images are added.

## How to capture

1. Start the backend: `cd source/apps/backend && npm install && npm run dev`
   (sandbox keys optional for a browse-only run; checkout will answer `503 PayPal not configured`).
2. Open the storefront at `http://localhost:3000` and the dashboard at `http://localhost:3000/dashboard.html`.
3. For the Flutter app, run `cd source/apps/flutter_app && flutter run` (emulator/device) or
   `flutter run -d chrome`.
4. Reproduce the flows listed in [../../DEMO_CHECKLIST.md](../../DEMO_CHECKLIST.md): intent → cart, policy verdict,
   PayPal sandbox approval, AG Grid dashboard, and the Flutter Coco avatar + "Why these items?" explanation
   + allergy warning.
5. Save each capture as a PNG into this folder (`docs/screenshots/`) with a descriptive name, e.g.
   `storefront-chat.png`, `dashboard-aggrid.png`, `flutter-coco-explanation.png`.
6. Add the file name and a one-line description to the inventory table below.

## Planned shots (take these 12, in this order)

| # | File name | Shows | Criterion it supports |
|---|---|---|---|
| 1 | `01-storefront-chat.png` | Storefront with the chat and quick scenario chips | Design |
| 2 | `02-cart-policy-allow.png` | A cart inside the limit with the green policy verdict and server prices | Technological Implementation |
| 3 | `03-policy-block.png` | An over-limit cart with the BLOCK verdict and no pay button | Technological Implementation, Impact |
| 4 | `04-why-these-items.png` | "Why these items?" panel | Design, Innovation |
| 5 | `05-allergy-unverified.png` | Allergen selected, the note reads unverified | Honesty, Impact |
| 6 | `06-paypal-sandbox-approval.png` | PayPal Sandbox approval screen (no credentials visible) | Technological Implementation |
| 7 | `07-receipt-paid.png` | Receipt after capture with the Cart Mandate verify button | Innovation |
| 8 | `08-dashboard-orders-grid.png` | AG Grid orders with a filter and a pinned column | Technological Implementation |
| 9 | `09-dashboard-policy-events.png` | Policy-event grid with BLOCK and REQUIRE_CONFIRMATION rows | Impact |
| 10 | `10-refund-queue.png` | Refund queue with a PROPOSED item and the approve button | Technological Implementation |
| 11 | `11-agent-manifest.png` | `/.well-known/agent-commerce.json` in the browser | Innovation, Agentic Commerce |
| 12 | `12-newman-green.png` | newman summary: 58 requests, 73 assertions, 0 failed | Presentation |

Only shots 6, 7 and 10 need the PayPal Sandbox sequence from `docs/PAYMENT_E2E.md`; skip them and say so if you did not run it.

## Inventory

| File | Shows | Status |
|---|---|---|
| _(none yet)_ | — | No screenshots committed; capture from a running instance per the steps above. |

## Notes

- Do not stage secrets (dashboard merchant key, `.env`). Blur or omit them before capturing.
- AG Grid **Enterprise** features (row grouping, status bar) are not used — do not capture them as if they were.
- Keep the allergy warning visible in Flutter shots; it must read **unverified**, never "safe".

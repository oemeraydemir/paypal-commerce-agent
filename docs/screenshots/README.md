# Screenshots — capture guide & inventory

Screenshots for AI Café are captured from a **running instance**, not from design mocks. The ten images in
the inventory below were taken from the live Render deployment
(<https://paypal-commerce-agent.onrender.com>) at build `987af54`, with the storefront's customer-facing
merchant links removed. No credentials or merchant keys appear in any capture. They use the current light
iOS-style theme (light blue / white), not the older orange one. The later commits (`f747493`, `2261f2f`)
changed tests, docs and the Split Bill cancellation path only — no storefront theme change — so these
shots still match the currently deployed UI. This file explains how to reproduce them.

The four later shots (`07`–`10`) were captured with `Video_Kit/capture_shots_extra.mjs`; the first six with
`Video_Kit/capture_shots.mjs`. Both drive a headless Chromium against the live deployment.

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

## Gallery scope

Devpost allows up to 15 gallery images. The ten real captures in the inventory below are enough; no
placeholder or mock images are used. Every one was taken from the live deployment with Playwright, so
the guide above is about reproduction, not about staged data.

Still **not** captured, intentionally: the policy BLOCK cart, the Flutter "Why these items?" and
unverified allergen panels, the PayPal approval and paid receipt with its QR mandate, AG Grid filtered
views, the refund queue and a newman summary. The ones showing a paid order, a PayPal approval or a
refund require the Sandbox payment run in
[PAYMENT_E2E.md](../PAYMENT_E2E.md); they are deliberately not faked with mock data. The public agent
manifest is already covered by `05-agent-manifest.png`.

## Inventory

| File | Shows | Status |
|---|---|---|
| `01-storefront.png` | Storefront home: hero, trust-first positioning, product grid | Captured from the live deployment |
| `02-barista.png` | AI barista chat with quick scenario chips and the "you approve the payment" notice | Captured from the live deployment |
| `03-cart-wellbeing.png` | Cart with a real item, server prices and the wellbeing panel | Captured from the live deployment |
| `04-for-cafes.png` | "For cafés": setup path, honest scope and the live server readiness checklist | Captured from the live deployment |
| `05-agent-manifest.png` | Public `/.well-known/agent-commerce.json` with MCP tool names and payment guardrails | Captured from the live deployment |
| `06-dashboard.png` | Agent Control Center: AG Grid order board, policy metrics and read-only Ops Copilot | Captured from the live deployment |
| `07-profile-allowances.png` | Scoped allowances panel: checkout selector, daily-limit creation form and the fail-closed note | Captured from the live deployment |
| `08-barista-cart.png` | The exact demo prompt "I want a lunch for around 12 euros" answered with a prepared, budgeted cart | Captured from the live deployment |
| `09-take-home-channel3.png` | Real Channel3 retailer suggestions with the "not part of your café order" disclosure | Captured from the live deployment |
| `10-profile-diet-budget.png` | Dietary preferences, barista budget filter and allergen concerns | Captured from the live deployment |

All ten files are 1440×900 (1.60:1, close to Devpost's preferred 3:2) and under 0.30 MB, well below
the 5 MB per-image limit. See **Gallery scope** above for what is intentionally missing.

## Notes

- Do not stage secrets (dashboard merchant key, `.env`). Blur or omit them before capturing.
- AG Grid **Enterprise** features (row grouping, status bar) are not used — do not capture them as if they were.
- Keep the allergy warning visible in Flutter shots; it must read **unverified**, never "safe".

# AI Café hackathon demo checklist

Use a PayPal **sandbox** account only. See the repository
[README](../../README.md) for complete setup instructions.

## Before recording

- [ ] Add a valid OpenAI API key to the backend `.env`.
- [ ] Add PayPal sandbox app credentials; set `PAYPAL_ENABLED=true` and
      `PAYPAL_ENV=sandbox`.
- [ ] Confirm `GET /api/health` reports `ai.enabled: true` and
      `paypal.enabled: true`.
- [ ] Start the Android emulator and Flutter app; confirm the menu loads and
      both service indicators are ready.
- [ ] Log in to the PayPal sandbox checkout with a sandbox buyer, not a live
      PayPal account.
- [ ] Confirm the dashboard opens at `http://localhost:3000/dashboard.html`.
- [ ] Close the terminal or logs that might expose local credentials.

## Three-minute demo

1. **Problem (0:00–0:20):** “People shop in products and filters, but they
   think in goals. AI Café lets you order by saying what you need.”
2. **AI experience (0:20–1:05):** In the running app, request “a vegetarian
   breakfast for two under €20.” Show the assistant's catalog-backed
   recommendations and prepared cart.
3. **Customer control (1:05–1:25):** Adjust the cart and call out that prices
   come from the backend, not the AI.
4. **PayPal + AI (1:25–2:20):** Start checkout, approve with the sandbox buyer,
   return to the app, and confirm capture. State that the agent has no payment
   tool and capture follows buyer approval.
5. **Impact and execution (2:20–2:50):** Refresh the AG Grid dashboard and show
   the completed order and AI-assisted origin.
6. **Close (2:50–3:00):** Name the tools and restate the safety boundary.

## Final submission checks

- [ ] Record the actual app running on the device/emulator.
- [ ] Keep the video under three minutes, upload to YouTube, and make it public.
- [ ] Add the video URL and team name to
      [SUBMISSION.md](./SUBMISSION.md).
- [ ] Publish the source code publicly with the root MIT license.
- [ ] Remove any local keys, test buyer credentials, or private data from video.

## Limitations to disclose

- The order store is in-memory and resets when the API restarts.
- PayPal webhooks require a public HTTPS callback; webhook verification can be
  demonstrated with a deployed sandbox backend.
- Local development does not persist orders or provide production-grade
  payment operations.

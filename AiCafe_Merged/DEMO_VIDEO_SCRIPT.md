# AI Café — Demo Video Script (≤ 3 minutes)

> **Decide the recording surface first.** The rules want the project shown "on the device it was built for".
> Default: record the **web storefront and dashboard** (hosted URL or localhost) in a desktop browser, and say so.
> Use the Flutter app only if `flutter analyze && flutter test` passed on your machine and the emulator run works;
> then record it on the Android emulator. Never show a screen you did not run beforehand.
> Keep the finished video under **2:50** (judges need not watch past 3:00).

> Goal: show a judge, in under three minutes, how an AI agent can help someone shop **without ever being
> able to move their money**. Record on the Flutter emulator (or the web storefront) with the backend
> configured with **PayPal sandbox** credentials. Keep every claim matched to something in the code or docs.

## Before you record (≈ 30 s of prep, not in the video)

- [ ] Warm the deployment first (`curl <url>/api/health`) so the free-tier instance is awake.
- [ ] Confirm `.env` has `PAYPAL_ENABLED=true` and sandbox client id/secret, plus a real `DATABASE_URL`
      (or accept in-memory for a short demo).
- [ ] Have a PayPal **sandbox buyer** account ready to approve payment.
- [ ] No secrets on screen (blur/omit `.env`, merchant key).

## Shot-by-shot (≈ timestamps)

| Time | What the viewer sees | What you say (short) |
|---|---|---|
| 0:00–0:20 | Storefront + chat. Type: *"I want a ~€12 vegetarian lunch, surprise me."* | "The shopper describes intent and a budget. The agent has catalog and cart tools only — there is no payment tool." |
| 0:20–0:50 | Agent returns a cart. Show the **policy verdict** (`AUTO_ALLOW` / `REQUIRE_CONFIRMATION` / `BLOCK`) and the server-computed **prices**. | "Prices and the spending policy are computed on the server, not by the model. The agent can prepare, but cannot pay." |
| 0:50–1:20 | Storefront (or the Flutter app, if verified): the **Coco** barista badge, the "Why these items?" panel, and the **unverified allergy note** when an allergen is selected. | "The cart is explainable. Allergy info is shown as *unverified* — we never claim an item is allergen-free." |
| 1:20–1:50 | Checkout → human approves on PayPal **sandbox** (show the approval screen, not credentials). | "Only the human approves the payment in the PayPal sandbox. Live money cannot be configured." |
| 1:50–2:20 | Merchant **AG Grid** dashboard: orders grid, filters, pinned columns, refund queue. | "The merchant sees every order and proposes refunds; only an authenticated merchant approval calls PayPal." |
| 2:20–2:45 | `GET /api/orders/:id/mandate` → Ed25519-signed **Cart Mandate**; mention the MCP server lets external agents shop, never pay. | "Every order has a tamper-evident mandate of who could propose and who held payment authority. External agents go through MCP with no pay tool." |
| 2:45–3:00 | Wrap: accessibility note (Semantics labels, keyboard/screen-reader tested grid). | "Designed to be run and judged in minutes, accessibly." |

## If the AI answers "at capacity" during the take (free-tier providers)

The rule-based planner is a designed fallback, so use it instead of cutting the take:

1. Say: *"As you can see, the AI is busy right now, but the system did not break. The labelled rule-based fallback took over, and the cart is still priced and policy-checked by the server."*
2. If the answer is over the budget, point at the **Add to cart anyway** button: the shopper can still add the item manually, or type a new request. Nothing is paid or authorised by that button.
3. Then say: *"Now let's try a scenario where the AI is available."* and type **Coffee and a snack, max €10** (usually answers faster).
4. If the AI answers, continue the video with it. If not, continue with the fallback cart; the payment steps are identical.

Tip: send one throw-away request before recording to see which mode you will get.

## Do NOT show (would be misleading)

- AG Grid **Enterprise** features (row grouping, status bar) — not used.
- Any claim that allergy filtering happens **server-side** for the Flutter preferences — allergens are stored
  locally and are **not** server-filtered.
- Live/production PayPal money — sandbox only, by design.

## Evidence to link in the submission

- `docs/JUDGING.md` — judging criteria mapped to code/tests
- `docs/PLATFORM_STATUS.md` — what is verified for the web app and for the Flutter app, kept apart
- `docs/PAYMENT_E2E.md` — repeatable PayPal Sandbox payment check (buyer approval, capture, webhook replay, refund)
- `docs/EVIDENCE.md` — test counts (note the historical vs re-measured distinction)
- `DEMO_CHECKLIST.md` — the pass/fail gate that goes with this script

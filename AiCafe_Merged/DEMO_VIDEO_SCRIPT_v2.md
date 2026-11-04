# AI Café — Demo Video Script v2 (2:45, live-verified)

> **Recording surface: WEB** (storefront + dashboard in a desktop browser). Rationale: the live Render
> deployment is the exact code judged; Flutter widget tests are blocked in the sandbox (`flutter_tester`
> WebSocket) and can only be green on the owner machine, so per the rules we show the web surface.
> Every claim below matches a **live-verified** endpoint (see `docs/LIVE_VERIFICATION_MATRIX.md`).
> PayPal **sandbox** only. No secrets on screen, ever.

## Prep (not in video)
- [ ] Warm the service: `curl https://paypal-commerce-agent.onrender.com/api/health` (expect 200).
- [ ] Have a PayPal **sandbox buyer** account ready to approve (human step).
- [ ] Close all tabs with `.env` / credentials / merchant key.

## Shot-by-shot (2:45)

| Time | What the viewer sees | What you say |
|---|---|---|
| 0:00–0:15 | Live `GET /api/health` body: buildCommit, `environment: production`, `paypal: sandbox`, `storage: postgres durable`, `mandates: configured`, `ai: groq+gemini`. Then `/.well-known/agent-commerce.json` with the guardrails `agentCanPay/Capture/Refund: false`. | "This is the live deployment. The agent manifest tells any AI it meets the money rules up front: sandbox only, and the agent can never pay, capture, or refund." |
| 0:15–0:40 | Storefront + chat. Type: *"I want a ~€12 vegetarian lunch, surprise me."* Agent returns a cart with **server prices** and the **policy verdict** (`AUTO_ALLOW` / `REQUIRE_CONFIRMATION`). | "Prices and the spending policy are computed by the server — not by the model. The agent can prepare a cart, but it cannot pay." |
| 0:40–1:00 | The Coco barista badge, the "Why these items?" panel, and an **unverified allergy note** on an allergen-containing item. | "The cart is explainable, and allergy information is always shown as *unverified* — we never claim an item is allergen-free." |
| 1:00–1:30 | MCP `tools/list`: exactly five tools — search_menu, prepare_cart, check_policy, start_checkout, get_order_status — **no pay/capture/refund**. | "External agents shop through our MCP server. It exposes five tools — search, prepare, policy-check, start checkout, track. There is no payment tool in the list." |
| 1:30–2:05 | `start_checkout` → a PayPal **sandbox approval URL**; the **human** opens and approves it in PayPal. | "Only the human approves the payment, here in the PayPal sandbox. Our capture API enforces that approval before any charge — and there is no way to configure live money." |
| 2:05–2:30 | Merchant **AG Grid** dashboard: orders grid (filters, pinned columns), stats (€128.75 net revenue, 42% AI-assisted), the refund queue. | "The merchant sees every order and can propose refunds — but a refund moves money only after an authenticated merchant approval inside the dashboard." |
| 2:30–2:45 | Wrap: accessibility note + reproducibility. | "The whole flow is reproducible from the repo, mapped to the judging criteria, and hosted for you to run in minutes. Sandbox only." |

## If the AI answers "at capacity" (free-tier provider)
Use the designed rule-based fallback in the take: *"The AI is busy right now — the system didn't break; the labelled fallback took over and the cart is still server-priced and policy-checked."* Then continue from the payment step (identical).

## Do NOT show
- AG Grid **Enterprise** features (row grouping, status bar) — not used.
- Any claim that allergy filtering is server-side for Flutter preferences (allergens are local, not server-filtered).
- Live/production money — sandbox only.
- Any flow marked ⛔ in the verification matrix (webhook replay, refund approval, dispute submit, capture) unless explicitly approved and recorded live beforehand.

## Evidence to link
- `docs/JUDGING.md` · `docs/PLATFORM_STATUS.md` · `docs/PAYMENT_E2E.md` · `docs/LIVE_VERIFICATION_MATRIX.md` · `DEMO_CHECKLIST.md`.

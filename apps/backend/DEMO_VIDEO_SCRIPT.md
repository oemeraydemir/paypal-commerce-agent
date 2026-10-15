# 3-minute demo video script (target 2:40, public YouTube link)

Record the web storefront in a desktop browser (or the Flutter app on the device it was built for), with the
AG Grid dashboard in a second window. No third-party logos or music.

| Time | Show | Say |
|---|---|---|
| 0:00-0:15 | Storefront | "Shopping apps make you translate what you want into filters. AI Cafe lets you just say it, without giving an AI control of your money." |
| 0:15-0:45 | Ask: "Vegetarian breakfast for two under 20 euros" | "The agent searches the catalog with tool calls and prepares a cart. Prices come from the server, never from the model." |
| 0:45-1:15 | Policy meter and checklist | "Every cart change is judged by the server-side policy engine: 13 euros is above the 10 euro approval threshold, so it needs my explicit approval." |
| 1:15-1:40 | Scenarios: Over the limit, Alcohol request | "Over the 20 euro limit, or alcohol, and the server blocks it before PayPal is ever contacted. The button is disabled, but even a forged request is refused." |
| 1:40-2:15 | Everyday order, Review and pay, PayPal sandbox, Confirm payment | "The agent has no PayPal credentials. Only I can approve, and capture happens only after my explicit confirmation." |
| 2:15-2:40 | Dashboard, then ask the Ops Copilot "Which payments were blocked today and why?" and "Refund my last order" (it refuses: read-only) | "Every decision and payment is audited live: who prepared the cart, AI or human, and what the policy said." |
| 2:40-2:50 | Title card | "AI Cafe: agentic commerce where the human stays in control." |

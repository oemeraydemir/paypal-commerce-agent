# Demo video storyboard — target 2:45

Record the web storefront in a desktop browser, with the AG Grid dashboard and the Ops Copilot in a
second window. **No music. No third-party logos.** Show only the AI Café UI and the PayPal sandbox
checkout (PayPal's own screens are fine; do not overlay any sponsor logo).

| Time | Beat | Show | Say |
|---|---|---|---|
| 0:00–0:15 | **Hook** | Storefront home + AI chat box. | "Shopping apps make you translate what you want into filters. AI Café lets you just say it — and it never gets control of your money." |
| 0:15–0:50 | **Scenarios + policy meter** | Click "Everyday order" (EUR 13) → meter sits above the approval threshold, button reads "needs approval". Then "Quick coffee" (EUR 3) → auto-allowed. Then "Over the limit" (EUR 55) and "Alcohol request" → server blocks before PayPal is contacted. | "Every cart change is judged by the server-side policy engine using the backend's own prices. EUR 13 needs my explicit approval; EUR 3 is auto-allowed; over the limit or alcohol is blocked — even a forged request is refused." |
| 0:50–1:35 | **Live PayPal payment** | Ask "Vegetarian breakfast for two under 20 euros"; review the AI cart; click **Review & pay with PayPal**; PayPal sandbox approve with a sandbox buyer; return to AI Café; click **Confirm payment**; show the receipt card (items, total, masked capture ID, 4-step timeline). | "The agent has no PayPal credentials — only I can approve. Capture happens only after my explicit confirmation, and the receipt proves a single capture." |
| 1:35–2:10 | **Agent Control Center (AG Grid)** | Open `/dashboard.html`: KPI cards (orders, AI-assisted share, blocked count, revenue), Orders grid, Policy-events grid, quick filter, a status chip, and the side panel for a clicked event showing its reason and violated rules; note the 5-second live refresh. | "Every order and policy decision is audited live in an AG Grid dashboard — who prepared the cart, AI or human, and what the policy said." |
| 2:10–2:35 | **Refused refund in the Ops Copilot** | In the dashboard's Ops Copilot, ask "Refund my last order." Show the refusal: the copilot is read-only and any write tool (refund, pay, invoice) is refused and shown as such. | "A merchant Ops Copilot can explain what happened, but it is read-only — it cannot issue a refund, even when asked." |
| 2:35–2:45 | **Closing impact line** | Title card over the storefront. | "AI Café: agentic commerce where the human stays in control of every payment." |

### Notes
- Keep it under 3 minutes; aim for 2:45.
- Capture the live demo URL (https://paypal-commerce-agent.onrender.com) or a local run; the free-tier
  first load can take up to 60 s, so warm it up before recording.
- The PayPal sandbox approve step uses a sandbox buyer — never real funds.
- Do not add background music or any sponsor/third-party logo overlay.

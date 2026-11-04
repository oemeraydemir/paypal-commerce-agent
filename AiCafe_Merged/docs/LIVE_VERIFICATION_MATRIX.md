# AI Café — Live Verification Matrix (v1, 2026-11-04)

> Verified against the deployed Render service **https://paypal-commerce-agent.onrender.com**
> (warm; all read-only endpoints replied in 0.18–0.28s). PayPal **sandbox only**.
> Status legend: ✅ live-verified now · 🧍 human-verified previously · ⛔ blocked (needs explicit
> approval / a real sandbox buyer) · ⚙️ needs live output (dependency).

| # | Feature | Source implementation | Render config / env | Live verified result (today) | Screen to demonstrate | Status |
|---|---|---|---|---|---|---|
| 1 | Backend boot / health | `src/routes/health.ts`, `src/config/environment.ts` | `RENDER_GIT_COMMIT`, `DATABASE_SSL`, `PAYPAL_ENV=sandbox` | `GET /api/health` → 200; buildCommit `778428fd62cac64afadcd04842b3d9921feb810c` (matches clean push); `environment: production`; `paypal.enabled` + `environment: sandbox`; `storage: {mode: postgres, durable: true}`; `mandates.keyPersistence: configured`; `ai.providers: [groq, gemini]`; `channel3.enabled: true` | dashboard / browser | ✅ |
| 2 | Catalog (server-owned prices) | `src/routes/catalog*`, product repo | seeded PostgreSQL | `GET /api/catalog` → 200, **25 products**, server-computed prices in EUR minor units | storefront menu | ✅ |
| 3 | Session creation | `src/routes/sessions.ts` | PostgreSQL | `POST /api/sessions` → **201** with `sessionId` + `sessionToken` + `expiresAt` | storefront | ✅ |
| 4 | Orders list (public, minimised) | `src/routes/orders.ts` (GET /orders) | PostgreSQL | `GET /api/orders` → 200, **24 orders** (no PII/sensitive fields leaked) | dashboard orders grid | ✅ |
| 5 | Orders stats | `src/routes/orders.ts` (GET /orders/stats) | PostgreSQL | 200: total **24**, aiAssisted **10 (42%)**, revenue **€128.75**, net €128.75 (refunded €0.00) | dashboard | ✅ |
| 6 | Dashboard summary + policy | `src/routes/dashboard.ts` | PostgreSQL | 200: orders 11 paid / 7 pending / 6 cancelled / 0 failed; policy events **54** (50 allowed, 4 blocked, 32 requireConfirmation, 27 AI-policy); mandate activePolicies 2; timeline shows policy decision → order lifecycle | dashboard | ✅ |
| 7 | Ops Copilot status | `src/routes/ops.ts`, `src/ops/config.ts` | `OPS_COPILOT_ENABLED=true` + `OPS_COPILOT_KEY` | `GET /api/ops/status` → 200: `enabled`, `requiresKey`, `readOnly`; `paypalTools` [8], `internalTools` [4] | ops panel | ✅ (status) / ⛔ (ask needs `X-Ops-Key`) |
| 8 | Agent manifest | `/.well-known/agent-commerce.json` | `RENDER_EXTERNAL_URL` | 200, schema `aicafe.agent-commerce/1` v1.1; **guardrails: agentCanPay/Capture/Refund = false**; buyerApprovalRequired; sandbox; MCP transport `streamable-http`, 5 tools | browser / MCP client | ✅ |
| 9 | Product feed (schema.org) | `src/routes/feed.ts` | — | `GET /api/feed/products` → 200 (18,166 B), `ItemList`, 25 items | — / agents | ✅ |
| 10 | `llms.txt` | `src/routes/llms.ts` | — | `GET /llms.txt` → 200 (1,142 B), links manifest + MCP | — / agents | ✅ |
| 11 | MCP server (initialize) | `src/routes/mcp.ts` | — | `initialize` → 200, protocol `2025-03-26`; server `ai-cafe-mcp` v1.0.0; instructions list 5 tools | MCP client | ✅ |
| 12 | MCP tools list | `src/routes/mcp.ts` (tools) | — | `tools/list` → 200: **exactly 5 tools** — `search_menu`, `prepare_cart`, `check_policy`, `start_checkout`, `get_order_status`. **No pay/capture/refund tool** | MCP client | ✅ (safety ground truth) |
| 13 | AI chat providers | `src/ai/providers.ts`, `src/ai/service.ts` | `AI_PROVIDER_ORDER`, keys | health reports `ai.enabled: true`, providers `groq` + `gemini` | storefront chat | ⚙️ live reply needs a tool round (rule-based fallback documented) |
| 14 | Cart Mandate (Ed25519) | `src/mandate/mandate-service.ts` | `MANDATE_SIGNING_KEY` (configured) | health: `keyPersistence: configured`; verify endpoint reachable | mandate panel | ✅ (key) / ⛔ (fresh signed mandate needs live order) |
| 15 | Channel3 take-it-home | `src/routes/take-home.ts`, `src/channel3/client.ts` | `CHANNEL3_API_KEY` | health: `channel3.enabled: true` | take-it-home panel | ⚙️ needs a live Channel3 response |
| 16 | Checkout / capture | `src/routes/orders.ts` (create/capture), `src/paypal/client.ts` | sandbox | **not run live** (needs human sandbox buyer approval) | PayPal approval screen | ⛔ |
| 17 | Webhook callback | `src/routes/webhooks.ts`, `src/paypal/webhook-service.ts` | `PAYPAL_WEBHOOK_ID` on Render | **not run live** (needs a real sandbox capture event; unsigned → 401 covered by tests) | — | ⛔ |
| 18 | Refunds | `src/routes/refunds.ts`, `src/refunds/service.ts` | `X-Ops-Key` + merchant approval | **not run live** | refund queue | ⛔ |
| 19 | Disputes | `src/routes/disputes.ts`, `src/disputes/service.ts` | sandbox dispute case | **not run live**; never auto-submits | dispute panel | ⛔ |
| 20 | Split bill | `src/routes/split.ts` | — | **not run live** (needs a live order) | checkout / split UI | ⛔ |

## Blocked flows — not attempted (per non-negotiable rules)
- **Buyer approval → capture** (row 16): requires a human approving in the PayPal sandbox; a financial-like event, needs explicit user approval.
- **Webhook replay** (row 17): needs a real sandbox capture to emit `PAYMENT.CAPTURE.COMPLETED`; PayPal's Webhooks simulator is not proof.
- **Refund approve** (row 18): needs `X-Ops-Key` + authenticated merchant approval.
- **Dispute evidence submit** (row 19): needs a real sandbox dispute case; evidence is text-only OTHER and must match the requested type.

Live page screenshot / recording will cover the ✅ rows; blocked rows are shown as architecture/policy panels (honest), never faked.

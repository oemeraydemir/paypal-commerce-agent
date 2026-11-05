# Using AI Café for another business

AI Café is a **merchant-agnostic agentic checkout**: the catalog, currency, limits, spending policy and
brand text come from a *business profile*, not from code. One deployment serves **one merchant**
(its own PayPal credentials, its own database). Running a second business means a second deployment
of the same code with a different profile.

## What a merchant needs

1. **A profile file** (JSON): business info + product list. Example:
   `source/apps/backend/examples/business-profiles/corner-bakery.json`.
2. **PayPal credentials** of that merchant (sandbox for testing): `PAYPAL_CLIENT_ID`,
   `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, return/cancel URLs (see `.env.example`).
3. **A PostgreSQL database** (`DATABASE_URL`, see `docs/DATABASE.md`).
4. Optionally an AI provider key (without one the chat answers with the labelled rule-based planner).

```bash
cd source/apps/backend
BUSINESS_PROFILE_PATH=examples/business-profiles/corner-bakery.json npm run dev
```

## Profile format

```jsonc
{
  "business": {
    "businessId": "corner-bakery",        // lowercase, digits, "-"; also the merchant id in the spending policy
    "name": "Corner Bakery",              // shown to buyers, in AI prompts, PayPal order text, MCP server info
    "currency": "EUR",                    // ISO 4217; all prices are integers in minor units (cents)
    "locale": "en-DE", "timezone": "Europe/Berlin",
    "maxOrderValueMinor": 6000,           // hard cap per order
    "minOrderValueMinor": 100,
    "aiPurchaseRequiresConfirmation": true, "allowAutonomousPurchase": false
  },
  "products": [
    { "id": "sourdough", "name": "Sourdough Loaf", "priceMinor": 480, "category": "bread",
      "description": "...", "tags": ["fresh"], "dietary": ["vegan"], "occasion": ["family"], "available": true }
  ]
}
```

The file is validated at boot. A mistake stops the server with one message listing every problem
(duplicate ids, bad currency code, negative price, unknown fields' types, ...), never a half-working shop.
Categories are taken from the products, so the AI tools, the MCP tools and the rule-based planner
automatically know them. Everything that moves money stays unchanged: prices and totals are computed by the
server from this catalog; the spending policy, write-ahead storage, refund approval and webhook checks are the
same for every merchant.

## Connections

| Surface | Per merchant |
|---|---|
| Web storefront / dashboard | same code; static page title and heading are in `public/index.html` |
| Flutter app | points at the merchant's backend URL |
| MCP endpoint (`/api/mcp`) | any MCP agent can shop at that merchant; server name/title come from the profile |
| PayPal | that merchant's own sandbox/live credentials and webhook |
| OpenAPI / Postman | identical API for every merchant |

## Not supported (honest limits)

- **No multi-tenancy inside one deployment.** Several merchants in one process would need tenant routing,
  per-tenant PayPal secrets, per-tenant policy and tenant-scoped rows in every table. Today: one deployment
  per merchant (a Render blueprint per merchant is the simplest way).
- Catalog changes need a profile edit + restart (no merchant admin UI or product CRUD API).
- The storefront's visible brand text (`index.html`) and the Ops Copilot prompts still say "AI Café".
- One currency per merchant; PayPal live mode and PayPal Partner/onboarding are not implemented.

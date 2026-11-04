# AI Café — UI/UX Redesign (Premium Specialty Café)

Replaces the earlier "Bright Fusion" recolor (coral/sun/mint/violet on cream) with a
genuine visual-language redesign. **Business logic is untouched**: PayPal flow,
spending-mandate rules, cart totals, backend APIs, voice, session/auth all stay exactly
as-is. This document is the spec the Flutter implementation follows.

## 1. Design direction — Premium Specialty Café
The brand should feel like a high-end specialty coffeehouse app: calm, tactile, high
contrast typography, and polished product photography. Nothing flashy; everything
considered.

| Token | Value | Use |
|---|---|---|
| Surface / background | `#FFFFFF` bright white | scaffold, cards |
| Surface alt | `#F4F5F7` subtle grey | wells, input fills, secondary panels |
| Surface raised | `#FFFFFF` + stroke `#E6E8EB` + soft shadow | cards, sheets |
| Text primary | `#16181D` charcoal | headings, body |
| Text secondary | `#5B636C` | captions, hints |
| Primary accent | `#1E5B46` deep forest green | CTAs, active nav, focus |
| Primary dark | `#164A39` | pressed |
| Positive | `#2E8B6E` fresh leaf green | ready/live/status |
| Error | `#B64545` soft red | errors, allergy notice |
| Outline | `#E0E3E7` | borders |
| Tertiary / AI | `#43546B` slate | AI/id labels, barista accents |

Typography: charcoal on white, generous letter-spacing for headlines, tight body.
Mood rule per surface: main/discovery surfaces are airy and editorial; payment/cart
surfaces are calm and transparent (clear totals, clear permission); AI chat feels like a
conversation with a barista (avatar + readable cards).

## 2. Per-screen layout

### 2.1 Global header (all screens)
- Leading: brand lockup = subtle circular café mark + **"AI Café"** wordmark + thin
  subtitle ("AI-powered shopping · PayPal sandbox" — string kept for locale tests).
- Trailing actions (kept, restyled): Help, Clear, language toggle (TR/EN), Cart with
  count badge. A tiny green **Live** dot under the wordmark replaces the bulky dual
  status chips; errors surface as a red banner.
- Consistent bottom navigation bar: **Café** (discover) and **Barista** (conversation).
  Defaults to Barista so the existing chat/checkout flow and tests stay intact.

### 2.2 Café home (discover)
- Editorial hero card: greeting headline, short copy, and two prompt chips that just
  seed the chat (same callbacks as today).
- Product cards: horizontal scroll, each card = realistic product photo (top), name,
  price, and a round **+ / Add** control (same `addProduct` + SnackBar behavior).
  Unavailable items are dimmed with a "sold out" state.

### 2.3 Barista chat
- Assistant bubbles become a distinct "Coco · AI Barista" response card (subtle slate-tint
  header, avatar, readable serif-free body) while preserving all existing content:
  rule-based label, provider note, markdown, cart-explanation, allergy notice, timestamp,
  and the quick-reply chips (keys `quick-reply-N` untouched).
- User bubbles: charcoal-green filled, right-aligned, unchanged send flow.
- Typing bubble keeps Coco avatar + indicator.
- Prepared-cart card: restyled into a clean summary card with the same subtotal /
  "Review & pay" action and server-confirm note.

### 2.4 Cart sheet
Two clearly separated sections inside one modern sheet:
1. **Your order** — product rows with photo thumb, name, unit price, qty stepper
   (`setQuantity`), line total.
2. **Spending permission** — policy status + allowance facts presented as tidy rows
   (remaining today, max per purchase, per-order remaining, merchant scope, valid-until,
   renewal CTA when due), always ending with the "payment is separate" note.
Then totals row + **Checkout with PayPal** (primary green) and **Clear** (outlined), plus
the Pickup planner row. All values/conditions identical to today.

### 2.5 Profile (settings screen)
Opened from the Café home (and the header avatar). A dedicated, grouped settings screen
instead of an alert dialog: **Dietary preferences**, **Allergen concerns**, **Budget**
field with € prefix + validation, and the same disclaimer. Save/Cancel persist exactly as
today (`ShopperProfileProvider.save`).

## 3. Product imagery
Realistic product photos are bundled as local assets (`assets/products/*.png`) and mapped
to catalog items by keyword (coffee, latte, juice, tea, breakfast, croissant, pastry).
Items without a matched photo render a neutral branded gradient block so the layout never
breaks.

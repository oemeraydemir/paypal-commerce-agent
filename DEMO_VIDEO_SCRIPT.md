# AI Café — final demo video script (2:52)

This is the shot order of the **submitted video**: `AICafe_Final.mp4`, 2:52.17, English narration,
no music and no third-party footage. Left panel is the web storefront, right panel is the Flutter app.
It is linked from [DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md), [docs/JUDGING.md](./docs/JUDGING.md)
and [docs/SUBMISSION_CHECKLIST.md](./docs/SUBMISSION_CHECKLIST.md).

## Honest production note

The two panels were recorded as **two separate takes** and then composed side by side. Their beats are
close but not frame-synchronised: at a given second the web panel and the Flutter panel can be at
slightly different steps of the same story. The narration follows the **web panel** (left), which was
the driving take. Every feature shown exists in the repository; nothing was faked or re-timed in post.
A perfectly synchronised version would require one combined OBS capture of both clients.

Nine narration blocks were cut from a single ElevenLabs English voice recording and placed at the
target times below. The full script is kept with the recording kit, outside this repository.

## Beat sheet

| Time | Web panel (left) | Flutter panel (right) | Voiceover |
|---|---|---|---|
| 0:00 | Storefront, the problem and the rule | Shopping profile | `vo_01` |
| 0:16 | Profile: dietary preference and gluten concern saved once | Dietary preferences, always unverified | `vo_02` |
| 0:31 | AI barista: a lunch request within a budget | Home / menu | `vo_03` |
| 0:45 | Cart, wellbeing panel, passport with server prices, split bill | AI-prepared cart with allergy note | `vo_04` |
| 1:03 | Checkout opens PayPal Sandbox; human logs in and approves | PayPal return | `vo_05` |
| 1:23 | Paid: e-invoice, QR-coded signed Cart Mandate, refund request | Receipt / verification | `vo_06` |
| 1:43 | Ops Copilot proposes a refund; merchant approves in the refund queue | Receipt | `vo_07` |
| 2:07 | **For cafés**: the café owner's control center, order board, human-approved refunds | Receipt | `vo_08` |
| 2:35 | Close: one backend, web and Flutter working together | Receipt | `vo_09` |
| 2:52 | End | | |

Verified frame anchors from the two source recordings: web at 12 s (storefront), 27 s (profile),
30–38 s (barista prompt), 62 s (split bill), 78 s (PayPal Sandbox pay page), 98 s (passport /
refund advisory), 122 s (refund queue with **Approve & refund**), 152 s (For cafés); Flutter at
15 s (profile), 45 s (menu), 75 s (cart with allergy warning), 120 s (PayPal return), 165 s (receipt).

## Narration (English only)

```
[vo_01] 0:00
Hi, welcome to AI Café. People want AI to order for them, but fear two things: an AI that spends their money, and one that ignores their allergy. Our rule: the AI prepares, only you authorize, PayPal moves the money.

[vo_02] 0:16
First, I tell the app who I am: vegan, with a gluten concern. I save it once, on web and on mobile. Allergy notes always stay marked unverified. We never claim a dish is safe.

[vo_03] 0:31
Now I just tell the barista what I want, within my budget. It reads the menu, the server prices every item, and a cart appears.

[vo_04] 0:45
In the cart, the wellbeing panel checks every item against my notes, always marked unverified. The passport shows server prices and my limit. And I can split the bill with friends; the server computes every share.

[vo_05] 1:03
Now the human step. I check out and PayPal Sandbox opens. I log in with a test account and approve. No card typing, no real money, and this is the only place money moves.

[vo_06] 1:23
Paid. The receipt is an e-invoice with a QR-coded, signed Cart Mandate. Anyone can scan it and verify the order was authorized, not forged. Who did what is spelled out, and I can request a refund right here.

[vo_07] 1:43
Now the café owner. A read-only Ops Copilot. I enter the key, masked, and ask it to propose a refund. It can only propose. The merchant approves, and PayPal Sandbox issues the refund.

[vo_08] 2:07
Finally, the For cafés tab, the café owner's control center. Orders arrive prepared: the AI builds the cart from the real menu, and the server fixes every price. Customers stay in control: spending limits run on the server, and every payment needs their PayPal approval. A live order board shows orders, payments and policy, and refunds stay human-approved. The Ops Copilot only proposes, the merchant decides.

[vo_09] 2:35
Refunds, split bill, QR-coded Cart Mandate, e-invoice and wellbeing guard: one backend, web and Flutter, working together. The AI prepares, you approve, PayPal pays.
```

## Why the wording is exactly this way

- The barista request on screen is *"I want a lunch for around 12 euros"*. The narration therefore
  says **"what I want, within my budget"** and does not say "a vegan lunch".
- The web panel shows **2 people** in the split-bill step while the Flutter panel shows three. The
  narration says **"with friends"** and does not quote a number.
- Allergy language is always **"unverified"**. Nothing in the video or script claims a dish is safe
  or allergen-free.
- "E-invoice" is the label the app itself uses for the itemised order record. It is not a tax invoice
  and makes no VAT claims.
- The PayPal environment is **Sandbox** throughout. No real money moves and no live credentials appear.

# Shared design system (web + Flutter)

One file defines the look: `source/design/tokens.json` (coral / mint / peach / lavender / sky, category tints,
28 px card radius). `npm run tokens` (in `source/apps/backend`) generates:

| Output | Used by |
|---|---|
| `public/tokens.css` | every web page (`index`, `dashboard`, `merchant`, `split`, `verify`) |
| `flutter_app/lib/theme/tokens.g.dart` | `AppColors` and the Passport card in Flutter |

`tests/unit/design-tokens.test.ts` fails when a generated file is stale and checks every text/background pair
against WCAG AA (the reference's white-on-coral text did not pass, so buttons use `coralStrong` or dark ink).

Both clients use the same four destinations: **Home, Barista, Cart, Profile**. Web: `public/app-shell.js`.
Flutter: `_buildBottomNav` in `chat_screen.dart` (Cart opens the cart sheet, Profile the profile screen).
The AI Transaction Passport is built once on the server (`src/passport/builder.ts`) and only drawn by each client.

Not shared yet: the rounded display font (no font asset is bundled; both fall back to the system font).

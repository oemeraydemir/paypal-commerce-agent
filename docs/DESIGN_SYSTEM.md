# Shared design system (web + Flutter)

One file defines the look: `source/design/tokens.json`. It follows the **Apple iOS system palette**: grouped
background `#F2F2F7`, white cards, systemBlue accent, system green / orange / red for status, true-black dark mode
with `#1C1C1E` surfaces. Cards use a 20 px radius. `npm run tokens` (in `source/apps/backend`) generates:

| Output | Used by |
|---|---|
| `public/tokens.css` | every web page (`index`, `dashboard`, `merchant`, `split`, `verify`) |
| `flutter_app/lib/theme/tokens.g.dart` | `AppColors` and the Passport card in Flutter |

Key names such as `coral` are historical; they now hold the accent blue. Category tints stay in `public/art/manifest.json`
(the product art is tied to them).

`tests/unit/design-tokens.test.ts` fails when a generated file is stale and checks every text/background pair
against WCAG AA. Text on the accent uses `coralStrong` (`#0062CC` light, `#409CFF` dark); gradient buttons use white
(light) or black (dark) labels.

Both clients use the same four destinations: **Home, Barista, Cart, Profile**. Web: `public/app-shell.js`.
Flutter: `_buildBottomNav` in `chat_screen.dart` (Cart opens the cart sheet, Profile the profile screen).
The AI Transaction Passport is built once on the server (`src/passport/builder.ts`) and only drawn by each client.

Not shared yet: the display font. Web uses the system stack (SF Pro on Apple devices); Flutter uses the platform font.

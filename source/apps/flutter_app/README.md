# Flutter App — PayPal Commerce Agent (Sprint 4)

A **thin client** for the PayPal Commerce Agent backend. It provides:

- 💬 **AI chat** — talks to `POST /api/ai/chat` (OpenAI function-calling agent).
- 🛒 **Catalog + manual cart** — browse products and build a cart.
- 💳 **PayPal checkout** — creates an order server-side, opens the PayPal
  approval URL in the system browser, then captures the approved order.

The app holds **no PayPal credentials** and never calls the PayPal SDK
directly. Every payment action is initiated by the backend after explicit user
confirmation — preserving the security boundary established in the backend.

## Architecture

```
lib/
  main.dart                 # MultiProvider wiring (ApiService + ChatProvider + CheckoutProvider)
  models/                   # Product, ChatMessage, CartLine/PreparedCart/OrderItem, order results
  services/api_service.dart # Single HTTP client for the documented REST endpoints
  providers/
    chat_provider.dart      # AI conversation + last prepared cart
    checkout_provider.dart  # Manual cart + 2-step PayPal checkout (create -> approve -> capture)
  screens/chat_screen.dart  # Chat UI + product chips + cart sheet + checkout controls
```

Provider graph: `ApiService` → `ChatProvider` → `CheckoutProvider` (via
`ChangeNotifierProxyProvider`, because checkout needs the chat session id and
the AI-prepared cart).

## Backend endpoints used

| Method | Path | Used by |
| ------ | ---- | ------- |
| GET | `/api/catalog` | catalog chips |
| GET | `/api/health` | health check (utility) |
| POST | `/api/ai/chat` | AI assistant |
| DELETE | `/api/ai/chat/:sessionId` | clear conversation |
| POST | `/api/orders/create` | start checkout |
| POST | `/api/orders/:orderId/capture` | complete payment |

## Running

> The Flutter CLI could not be executed inside the build sandbox (a Windows
> named-pipe exhaustion crash when `flutter` spawns `git`/`where`/`cmd`). The
> project was scaffolded manually from the installed SDK templates and validated
> with `dart pub get` + `dart analyze`. Run the steps below on your machine.

1. Start the backend (from `source/apps/backend`): `npm install && npm run dev`
   (listens on `http://localhost:3000`).
2. From this directory:
   ```sh
   flutter pub get
   flutter run          # emulator / simulator / device
   ```
3. **Backend URL** — `lib/services/api_service.dart` defaults to
   `http://10.0.2.2:3000` (Android Emulator → host loopback). For the
   **iOS Simulator**, web, or a physical device on the same LAN, change
   `ApiService.baseUrl` to `http://localhost:3000` (or your machine's LAN IP).

## Notes

- Android `AndroidManifest.xml` declares `INTERNET` and
  `android:usesCleartextTraffic="true"` (dev only) so the app can reach the
  local HTTP backend.
- iOS `Info.plist` adds `NSAppTransportSecurity → NSAllowsLocalNetworking` for
  the same reason.
- The AI agent can **prepare** a cart but never pays; the app always forwards
  checkout to the server.

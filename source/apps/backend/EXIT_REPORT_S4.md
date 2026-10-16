# Sprint 4 — Exit Report: Flutter UI (Chat + Cart + PayPal Checkout)

**Project:** PayPal Commerce Agent
**Sprint:** 4 (final)
**Deliverable:** A Flutter **thin client** that integrates with the Sprint 1–3 backend
(catalog, AI agent, PayPal Orders API).
**Location:** `apps/flutter_app/`

---

## 1. Objective

Build a mobile thin client (iOS + Android) with three surfaces:

1. **AI Chat** — talks to `POST /api/ai/chat` (the OpenAI function-calling agent from S3).
2. **Catalog + Cart** — browse products and build a cart.
3. **PayPal Checkout** — two-step flow: `POST /api/orders/create` → open the PayPal
   approval URL in the system browser → `POST /api/orders/:id/capture`.

The client **never** holds PayPal credentials and **never** calls the PayPal SDK. Every
payment action is server-side, preserving the S3 safety boundary (the AI only *prepares*
carts; the user confirms and pays through the secure checkout).

---

## 2. Files delivered

```
apps/flutter_app/
├── pubspec.yaml                       # deps: http ^1.1.0, url_launcher ^6.2.2,
│                                       #   provider ^6.1.1, intl ^0.18.1 (+ cupertino_icons)
├── analysis_options.yaml
├── .gitignore
├── .metadata
├── README.md
├── android/                           # native scaffold (org com.paypal.hackathon)
│   └── app/src/main/AndroidManifest.xml  # INTERNET + usesCleartextTraffic=true
├── ios/                               # native scaffold (bundle com.paypal.hackathon.flutterApp)
│   └── Runner/Info.plist                 # NSAppTransportSecurity → NSAllowsLocalNetworking
└── lib/
    ├── main.dart                      # MultiProvider wiring (ApiService → ChatProvider → CheckoutProvider)
    ├── models/
    │   ├── product.dart               # Product (catalog item; prices in minor units)
    │   ├── chat_message.dart          # ChatMessage + ChatRole
    │   ├── cart.dart                  # OrderItem, CartLine, PreparedCart (AI cart)
    │   └── order.dart                  # OrderCreateResult, OrderCaptureResult, HealthStatus
    ├── services/
    │   └── api_service.dart           # single HTTP client; ApiException; ChatResponse
    ├── providers/
    │   ├── chat_provider.dart         # AI conversation + last prepared cart
    │   └── checkout_provider.dart     # manual cart + 2-step PayPal checkout
    └── screens/
        └── chat_screen.dart           # chat UI + product chips + cart sheet + checkout controls
```

The `android/` and `ios/` native projects were instantiated from the **installed Flutter SDK
templates** (`packages/flutter_tools/templates/app`) with `org = com.paypal.hackathon`,
because the `flutter` CLI itself cannot run in this sandbox (see §5). Versions matched to the
SDK: Gradle `9.3.1`, AGP `9.1.0`, Kotlin `2.4.0`, Dart SDK `^3.13.1`.

---

## 3. Backend API integration (exact contract match)

| Method | Endpoint | Client call | Notes |
| ------ | -------- | ----------- | ----- |
| GET | `/api/catalog` | `ApiService.getCatalog()` | `count` + `products[]`; UI renders `priceMinor/100` |
| GET | `/api/health` | `ApiService.getHealth()` | utility/health probe |
| POST | `/api/ai/chat` | `ApiService.sendChat({sessionId, message})` | returns `response`, `preparedCart`, `checkoutReady` |
| DELETE | `/api/ai/chat/:sessionId` | `ApiService.deleteChat(sessionId)` | clears server-side history |
| POST | `/api/orders/create` | `ApiService.createOrder({sessionId, items, idempotencyKey?})` | returns `orderId`, `paypalOrderId`, `approvalUrl` |
| POST | `/api/orders/:orderId/capture` | `ApiService.captureOrder(orderId)` | returns `status`, `paypalCaptureId` |

The order `items` payload is `[{ "id": <productId>, "quantity": <int> }]` — exactly what the
backend's `validateOrderItems` expects. The **backend** computes the authoritative total; the
client never sends prices.

### Checkout flow (UI → provider → backend)
1. User taps **Proceed to checkout** (AI cart) or **Checkout with PayPal** (manual cart).
2. `CheckoutProvider.startCheckout()` → `createOrder` → receives `approvalUrl` →
   `url_launcher.launchUrl(...)` opens PayPal in the external browser.
3. User approves on PayPal and returns to the app.
4. User taps **Complete payment** → `CheckoutProvider.completeCheckout()` → `captureOrder`.

The manual cart and the AI-prepared cart are unified into `List<OrderItem>` at checkout time
(manual cart wins; falls back to the AI cart).

---

## 4. Safety boundary (carried over from S3)

- **No PayPal SDK / credentials in the app.** `lib/services/api_service.dart` only imports
  `dart:convert` + `package:http` + models. There is no `paypal` / `openai` import anywhere in
  `lib/`.
- The AI agent can `prepare_cart` (server-side) but the **client** is the only one that calls
  `createOrder`/`captureOrder`, and only after an explicit user tap.
- `ApiService.baseUrl` is a plain HTTP constant; the app opens the server-returned PayPal
  approval URL in the browser — it does not construct or sign any PayPal request.

---

## 5. Build / validation status (IMPORTANT — sandbox limitation)

The **`flutter` CLI cannot run in this sandbox.** Every `flutter` invocation crashes immediately
with a Windows named-pipe exhaustion when it spawns a child process:

```
ProcessException: Alle Pipeinstanzen sind ausgelastet (at ../../runtime/bin/process_win.cc:744)
  Command: ...\git.EXE -c log.showSignature=false log HEAD -n 1 --pretty=format:%ad --date=iso
```

This happens at `FlutterVersion.checkFlutterVersionFreshness` (the very first `git` call) and
also for `where.EXE`, `cmd.exe`, `adb`. It is an **environmental** issue (the host process holds
the system's pipe instances busy), **not** a code defect. The same root cause also blocks
`dart analyze`, which spawns the analysis-server subprocess:

```
ProcessException: Alle Pipeinstanzen sind ausgelastet (at ../../runtime/bin/process_win.cc:744)
  Command: C:\src\flutter\bin\cache\dart-sdk\bin\dartaotruntime.exe ...\analysis_server_aot.dart.snapshot
```

### What WAS validated here
- ✅ **`dart pub get` — PASSED.** 44 dependencies resolved; `pubspec.lock` written.
  Resolved versions: `http 1.6.0`, `url_launcher 6.3.3`, `provider 6.1.5+1`, `intl 0.18.1`,
  `cupertino_icons 1.0.9`, `flutter_lints 6.0.0`. (`dart pub get` is network I/O only and does
  not spawn OS processes, so it survives the pipe issue.)
- ✅ **`dart format` — PASSED (exit 0).** All 9 `lib/*.dart` files parse cleanly
  (no syntax errors). `dart format` runs in-process and is unaffected by the pipe crash.
- ✅ **Native manifests verified** — Android `AndroidManifest.xml` contains
  `INTERNET` + `android:usesCleartextTraffic="true"`; iOS `Info.plist` contains
  `NSAppTransportSecurity → NSAllowsLocalNetworking`. Both needed so the app reaches the local
  HTTP backend.
- ⚠️ **`flutter analyze` / `flutter build` / `flutter run` — NOT RUN** in the sandbox (blocked by
  the pipe crash above). No screenshots/video could be captured here for the same reason.

### How to run it on a working machine
```sh
# 1) backend (from apps/backend): npm install && npm run dev   # http://localhost:3000
# 2) flutter app (from apps/flutter_app):
flutter pub get
flutter run            # emulator / simulator / device
```
If the native `android/`+`ios/` folders ever drift from your local Flutter version, just
regenerate them: `flutter create . --org com.paypal.hackathon` (this overwrites the scaffold
but keeps `lib/`).

> **Backend URL:** `lib/services/api_service.dart` defaults to `http://10.0.2.2:3000`
> (Android Emulator → host loopback). For the **iOS Simulator**, web, or a physical device on
> the same LAN, change `ApiService.baseUrl` to `http://localhost:3000` (or your LAN IP).

---

## 6. Acceptance criteria

| Criterion | Status |
| --------- | ------ |
| Thin client integrates chat + cart + PayPal checkout | ✅ implemented (§3) |
| AI chat calls `/api/ai/chat` and shows prepared cart | ✅ `ChatProvider` + prepared-cart card |
| PayPal flow: create → approvalUrl → browser → capture | ✅ `CheckoutProvider` (§3) |
| Client never touches payments directly | ✅ no PayPal/OpenAI imports in `lib/` (§4) |
| `pubspec.yaml` uses http/url_launcher/provider/intl | ✅ resolved & verified (§5) |
| AndroidManifest INTERNET permission | ✅ added (§5) |
| Builds for iOS + Android | ⚠️ scaffold generated from SDK templates; full `flutter build` not runnable in sandbox (§5) |
| Screenshots / video / build logs | ⚠️ build logs attached (`dart pub get` ✅, `dart analyze` blocked by sandbox); no screenshots/video possible here |

---

## 7. HARD NOT-LIST adherence

Per the sprint brief, the following were deliberately **excluded**:
- No local payment processing, no PayPal SDK in the app, no stored credentials.
- No extra backend endpoints, no new server features, no auth layer (out of scope for S4).
- No provider/state solution other than `provider` (no riverpod/bloc).
- No web/desktop targets beyond the requested iOS + Android.

---

## 8. Next steps (for the user)

1. Run `flutter pub get && flutter run` on a machine with a working Flutter SDK.
2. Start the backend (`apps/backend`) on `:3000` and point `ApiService.baseUrl` at it.
3. Smoke test: open app → ask the AI "I need breakfast for 2 under €20" → tap **Proceed to
   checkout** → approve on PayPal → tap **Complete payment** → confirm `PAYMENT_CAPTURED`.

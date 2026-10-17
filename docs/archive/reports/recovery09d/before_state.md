# Recovery 09D — Before-State Record

Recorded BEFORE any edit. Stored OUTSIDE the repository (`C:/Projects/FinCan/recovery09d/`)
so no project file was modified.

## Repository
- Path: `C:/Projects/FinCan/paypal-commerce-agent`
- Branch: `fix/render-deployment`
- HEAD: `ee6209bdfc7c18981dee6df192a02a7f5dec3770`  (matches expected baseline)

## `git status --short` (before)
```
 M apps/backend/src/routes/checkout.ts
 M apps/backend/tests/verification/p0-claims.test.ts
 M apps/flutter_app/lib/providers/checkout_provider.dart
 M apps/flutter_app/lib/services/api_service.dart
 M apps/flutter_app/test/checkout_provider_test.dart
?? apps/backend/public/index.html
?? apps/backend/tests/integration/web-storefront.test.ts
?? apps/flutter_app/test/checkout_capture_state_test.dart
?? recovery07_1/
```

## Baseline test run (before any edit)
Command: `node node_modules/jest/bin/jest.js --runInBand` (log: `baseline_full.log`)
```
Test Suites: 1 failed, 21 passed, 22 total
Tests:       3 failed, 250 passed, 253 total
Time:        49.245 s, estimated 69 s
Ran all test suites.
Exit: 1
```
Failing suite: `tests/integration/web-storefront.test.ts` (23.01 s) — exactly 3 failures:
- `web storefront › GET /app.js is served as JavaScript and uses textContent, never innerHTML`
- `web storefront › desktop browsers are sent back to the web app after PayPal; mobile keeps the app deep link`
- `web storefront › web return link encodes hostile tokens`

Passing: `web storefront › GET / serves the storefront and loads logic from same-origin app.js (CSP-safe)`

This is the expected 253-test baseline (250 pass + the 3 known storefront failures).

## SHA-256 before-state
### Recovery 07.1R protected set (must NOT change)
```
a4f6998b95997ee88d0355a7b2d8bad4cc4160c33def7e660fc056f15868f72a  apps/backend/tests/verification/p0-claims.test.ts
96a9213bee5c947ab0bdc0615463ee7179438cf065d36f481391cce72210dc15  apps/flutter_app/lib/providers/checkout_provider.dart
f8612d821b17c9b0ec7202008e1e2babe6f441828d21309d20763c18354ef56f  apps/flutter_app/lib/services/api_service.dart
a943c8f00c647f97e611900866874a0fd4180c5b343db141f5a3a2fdfdf7782f  apps/flutter_app/test/checkout_provider_test.dart
f45e68cf3113a57dc150cdb88ed14922a83c71dde4ccd7735c2952b21a433841  apps/flutter_app/test/checkout_capture_state_test.dart
```
### Authorized-scope files
```
555feb49f7ac370273d439884d9a2751cabfde0865ef94caf27dd8041e635ea8  apps/backend/src/routes/checkout.ts
aa11593ac915c1e95e165ee8b828196035761d589e7864349282a01c6bd9366b  apps/backend/public/index.html
341f3ff5b62fc589778699868410b12e0ce2db9b5619061cf29c5d064d4f5079  apps/backend/tests/integration/web-storefront.test.ts
(MISSING — not yet created)                                      apps/backend/public/app.js
```

## Note on the "Recovery 07.1R protected-file hash" baseline
No authoritative stored manifest of the five Recovery 07.1R protected-file hashes exists
anywhere on disk (searched the repository, the workspace root, `.workbuddy-ai/memory`, all git
refs, and both review ZIPs — no `07.1R`/hash-manifest artifact was found). The protected set was
therefore RECONSTRUCTED as the five pre-existing, non-authorized-scope working-tree files (the
Recovery 07.1 Flutter capture-state work plus the backend P0 verification suite). Their hashes
were frozen above and re-verified after the edits. A superset (index.html, web-storefront.test.ts)
was also hashed. No protected file changed.

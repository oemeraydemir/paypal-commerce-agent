# APIMatic portal (AiCafe)

This folder is the APIMatic portal configuration for the AI Café PayPal Commerce Agent API.
It is the single place that holds the portal branding, the navigation, and the OpenAPI spec
that APIMatic builds documentation and SDKs from.

## Contents

- `apimatic.json` — portal/brand settings and the language config. Languages enabled:
  **C#, TypeScript, Python** (no Dart claim).
- `content/` — portal markdown pages (`index.mdx`) and navigation (`nav.json`).
- `spec/openapi.json` — the OpenAPI 3.0.3 spec (the source of truth, byte-identical to
  `openapi.json` at the repository root and inside `AiCafe_Merged`).
- `static/` — branding assets (logo, favicon).

## OpenAPI source of truth

The authoritative spec lives at the repository root (`openapi.json`) and is kept byte-identical
to `AiCafe_Merged/openapi.json` and `apimatic/spec/openapi.json`. To regenerate any SDK you must
use the source-of-truth file. The spec is kept APIMatic-clean:

- validates as OpenAPI 3.0.3 with 0 errors (`apimatic api validate --file openapi.json`);
- every operation has a unique `operationId` (APIMatic uses these as method names);
- enums use the object form `{ value, description }` with short descriptions;
- documents the `TransactionPassport` and `take-home` (Channel3) additions.

## SDKs

TypeScript and Python SDKs have been generated from the merged spec and are committed under
`AiCafe_Merged/sdks/` (`typescript/` and `python/`). They were built in a clean environment and
verified (see the project README / `docs/` for the verification details).

Status notes:

- Generation was performed locally with the APIMatic CLI. Nothing has been uploaded to the
  APIMatic cloud portal, so the "dashboard" version of this portal is not live.
- To regenerate, e.g. TypeScript:
  ```bash
  cd <repo root>
  apimatic api validate --file openapi.json
  apimatic sdk:generate --file openapi.json --language typescript --output <dir>
  ```
  Then copy the generated folder into `sdks/` (or the language you need).

## What to show judges ("Best Use of APIMatic")

- The real generated SDK calling the sandbox flow: `postSessions` → `getCatalog` →
  `postPolicyPreview` (note the `passport` field) → `postOrdersCreate`.
- State exactly which SDK you generated and which calls the demo makes with it.
- Do not claim an integration the demo does not use.

# Jury-perspective review (20 Oct 2026 pass)

How this was done: for each judge named on the Devpost page I took their **listed role** (and, where it is public,
their known focus) and asked "what would this person open first, and what would make them stop?". Personal
preferences of individual judges are **inferences from role**, not facts; only Eddie Jaoude's open-source focus was
checked against public sources. Everything marked *closed* is in the code and covered by tests; everything marked
*open* needs something only the submitter can do.

## PayPal judges

| Judge (role on Devpost) | What they would probe | Gap found | Status |
|---|---|---|---|
| Jo Franchetti (Developer Advocate) | Can I run it in minutes? Is the front end polished, accessible, understandable? | Free-tier cold start (~60 s) can look like a dead demo; no key needed locally (good) | *Open:* warm the Render service before judging starts and say so in the testing instructions (`docs/devpost-testing-instructions.md`) |
| Eddie Jaoude (Developer Advocate; open-source advocate, hackathon regular) | Is it genuinely open source and welcoming? README that works, license visible, contribution path | README, MIT license and `CONTRIBUTING.md` exist | *Open:* add GitHub topics + repo description; keep the license in the About box |
| Marco Podien (Developer Advocate) | Is PayPal used the way PayPal intends: Orders v2, idempotency, webhooks, sandbox only, Agent Toolkit/MCP direction | Only Orders, Payments (refund) and webhooks; no payment *intent* record an agent platform can audit | *Closed:* **Signed Cart Mandate** (`src/mandate`, `GET /api/orders/:id/mandate`, `POST /api/mandates/verify`) is a tamper-evident record of what was proposed and who held payment authority, in the spirit of agent-payment mandates (PayPal is a partner of AP2 / A2A). It is **not** an AP2 implementation and moves no money |
| Karthik Ravi (Software Engineer) | Correctness of money paths: double capture, races, amount checks, error mapping | Already unusually strong (capture lock, DB claim, write-ahead, reconciler, amount-mismatch hold) | *Closed before this pass;* the only change on payment paths is a fire-and-forget event call after the state change, which cannot throw into the payment (covered by a dead-receiver test) |
| Himraj Singh (Engineering Manager) | Is it operable and safe to hand over? Persistence, observability, secrets | Mandate key was an operations risk: an ephemeral key would invalidate old mandates after a restart | *Closed:* `MANDATE_SIGNING_KEY` (+ `npm run mandate:keygen`, `render.yaml` entry); `/api/health` and the key document report `keyPersistence`; an invalid key refuses startup, `/api/health` answers 503 "misconfigured" instead of 500; old public keys (`MANDATE_PREVIOUS_PUBLIC_KEYS`) keep earlier mandates verifiable after a rotation |
| Nathaniel Olson (Senior Product Manager) | Real user, real problem, merchant value beyond a demo | Impact story was "safe agent shopping"; the merchant side (what happens after a payment?) was thin | *Closed:* outbound **automation events** (`order.paid`, `order.policy_blocked`, `refund.completed`) so a merchant can wire a Zap / n8n / Slack bridge without code |

## Sponsor judges

| Judge | What they would probe | Result |
|---|---|---|
| Sylwia Vargas (AG Grid) | Real use of the grid, not a table: sorting, filtering, pagination, accessibility, Community-only | Done: sort/filter/paginate/pin/CSV export, side panel, live refresh, a11y browser test, no Enterprise options. Grouping and status bar are NOT implemented (Enterprise); do not show them in the video |
| Pooja Mistry (Postman) | Collection that runs, environments, assertions, MCP angle | Collection exists (58 requests / 73 assertions, newman green in both dashboard modes, measured 2026-10-25). *Open (optional):* add requests for the three mandate endpoints; not done here because it changes the documented newman counts |
| Ameer Hassan (APIMatic) | A clean OpenAPI that generates a good SDK | `openapi.json` now also describes the mandate, discovery and product-feed endpoints. *Open:* actually generate an SDK with APIMatic and link it; claim the prize only if you do |
| Shifra Williams (Render) | Blueprint, managed Postgres, env management, real deployment | `render.yaml` provisions PostgreSQL, refuses to boot without it, and now lists the new secret env vars. *Open:* redeploy and check `/api/health` |
| Mats Bryntse (Bryntum), Ignacio Valdez Bicard (Channel3), Carly Richmond (Elastic) | Their own products | **Deliberately not pursued.** A 25-item café menu is not a product-search problem (Channel3) and nothing here needs a scheduler/Gantt (Bryntum) or a search index (Elastic). A token integration would hurt the "meaningful use" criterion |

Zapier is a sponsor tool, not a judge: the automation events are shaped for a Zapier **Catch Hook**, but this has **not**
been tested against a live Zap. Say "compatible with", not "verified with".

## My own review, as a neutral reader

1. **Strongest point:** the agent *structurally cannot* pay, and that is enforced in four independent places and tested.
   That is a clearer, more defensible thesis than most "agent buys things" entries.
2. **Biggest risk is not code, it is the submission:** the YouTube video and team name are still TODO, and the video
   must show the app on the device it was built for.
3. **Real-AI evidence is thin:** only Groq was exercised against a real model. Run `npm run ai:check` with the
   provider you will show on camera, and record that provider in the video.
4. **Flutter was never compiled in this pipeline.** If the video shows the Flutter app, build and run it first
   (`flutter analyze && flutter test`); otherwise show the web storefront and say so.
5. **A signature is only as good as its key.** Without `MANDATE_SIGNING_KEY` the demo still works, but a mandate
   issued before a Render restart can no longer be verified. The UI then says "Could not check the mandate".

## What changed in this pass (merged candidate)

- `src/mandate/` + `src/routes/mandates.ts`: signed Cart Mandate (Ed25519, deterministic, stateless) with a kid-keyed keyring
  (active private key signs; previous *public* keys verify), a named canonicalization (`aicafe-stable-json/1`), a signed
  constant `expiresAt`, public verify, key document at `/.well-known/mandate-keys.json`.
- `src/automation/emitter.ts`: optional outbound events; best-effort, never blocks or changes a payment; timestamped HMAC;
  destination checks after DNS resolution (pinned at connect time), no redirects, bounded in-memory dedupe.
  Not durable: no outbox (deferred), events may be lost or repeated.
- `src/discovery/` + `src/routes/discovery.ts`: one canonical manifest, `agent.json` / `llms.txt` generated from it,
  schema.org-style product feed; `src/config/public-url.ts` (`PUBLIC_BASE_URL`, required in production).
- Storefront receipt: **Verify signed Cart Mandate** button (textContent only, CSP unchanged).
- Tests (this merged tree, measured 23 Oct 2026 after the Sprint 1 changes): 69 suites / 775 tests pass at that time (re-measured 2026-10-25: **78 suites / 858 tests pass**; baseline before
  Sprint 1 was 67 / 759, of which 1 timed out). `tsc` clean. Counts come from one run of the
  combined suite, not from adding the two patches' numbers.

## Not verified (be honest in the video and the form)

Real PayPal Sandbox with the new endpoints; automation delivery to a live Zapier/n8n; Render deployment with `PUBLIC_BASE_URL` and a real `MANDATE_SIGNING_KEY`; the Flutter app (not run in the merge environment); Gemini and
OpenAI as providers. The mandate and automation code is tested with mocked PayPal and a local HTTP receiver.

# Verification prompts for the helper AIs

The assistant that wrote the code cannot reach PayPal, Render, Flutter or a real browser. These prompts hand that
work to three helper assistants that have a terminal. Each prompt is self-contained: copy one block, paste it into
the helper, send the helper's final report back.

| Helper | Prompts | Needs |
|---|---|---|
| **Helper 1** (VS Code AI, backend) | A (PostgreSQL), B (browser + Newman), C (git history and secrets) | Node 20+, Docker or PostgreSQL 16, Chrome |
| **Helper 2** (VS Code AI, payments and AI) | D (PayPal Sandbox end to end), E (AI providers) | PayPal Sandbox business app + sandbox buyer, provider keys |
| **Helper 3** (WorkBuddy AI, mobile / deploy / research) | F (Flutter), G (Render), H (judge research) | Flutter SDK + Android emulator, Render account, web access |

Order: A, B, C first (no secrets), then D, E, G (secrets, kept in the terminal only), F in parallel, H any time.

## Rules that apply to EVERY prompt (already repeated inside each block)

1. Sandbox only. Never use a live PayPal account or live credentials.
2. Never print, log, paste, commit or write a secret to a file in the repo. Set secrets as environment variables in the
   terminal session only. If a value must be mentioned, show only its name and length.
3. Do not commit, push, deploy or change source code. If something fails, report it; do not "fix" it silently.
4. Capture command output as UTF-8 (PowerShell: `... 2>&1 | Out-File -Encoding utf8 file.txt`).
5. Report exact numbers (suites, tests, failures) from the real output, never from memory. A skipped test is "not
   verified", not "passed".

---

## Prompt A - real PostgreSQL smoke tests (Helper 1)

```
You are verifying the AI Café backend against a REAL PostgreSQL server. Do not change source code, do not commit.
Never print secrets. Output must be captured as UTF-8.

Context: repo root is the folder that contains README.md; backend is source/apps/backend. The smoke suites are in
tests/smoke and are SKIPPED unless DATABASE_URL points to a real PostgreSQL server.

1. Start PostgreSQL 16:
   Option Docker:  docker run --name aicafe-pg -e POSTGRES_PASSWORD=localtest -p 54329:5432 -d postgres:16
                   then create the database:  docker exec aicafe-pg psql -U postgres -c "create database aicafe_test"
   Option local:   winget install PostgreSQL.PostgreSQL.16, then create database aicafe_test.
2. cd source/apps/backend; npm ci
3. PowerShell:
   $env:DATABASE_URL = "postgres://postgres:localtest@127.0.0.1:54329/aicafe_test"
   $env:SMOKE_REQUIRE_REAL = "1"
   npm run test:smoke -- --runInBand 2>&1 | Out-File -Encoding utf8 smoke-results.txt
   (SMOKE_REQUIRE_REAL=1 makes a skipped test a failure. paypal-smoke.test.ts will fail without PayPal Sandbox
   credentials; that single failure is expected for this prompt, report it as "needs Prompt D".)
4. Also run: npm run db:migrate   (twice; the second run must change nothing) and then
   npm test -- --runInBand 2>&1 | Out-File -Encoding utf8 jest-results.txt   (with DATABASE_URL unset in a fresh shell).

PASS criteria: pg-durability, pg-capture-claim-route and pg-migrate suites all pass (expected 13 tests); migrations are
idempotent; the normal Jest run shows 0 failures (78 suites / 858 tests on 2026-10-25; the count grows as tests are added).
STOP and report if: a migration fails, any pg-* test fails, or the Jest run has failures.

REPORT (exact): Node version, PostgreSQL version, per-suite PASS/FAIL, "Test Suites:" and "Tests:" lines, list of
failures with the first 15 lines of each error. Do not include secrets or the DATABASE_URL.
```

## Prompt B - browser tests and Newman (Helper 1)

```
Verify the dashboard in a real browser and the Postman collection with Newman. Do not change source code or commit.

Part 1 - browser test (AG Grid Community dashboard, accessibility):
  cd source/apps/backend
  npm install --no-save playwright-core        (the test needs it; it is intentionally not in package.json)
  Set CHROME_PATH to the Chrome executable if it is not in a default location.
  npm run test:browser -- --runInBand 2>&1 | Out-File -Encoding utf8 browser-results.txt
  If the output is empty, report the exact command, the exit code ($LASTEXITCODE) and whether playwright-core resolved
  (node -e "console.log(require.resolve('playwright-core'))"). The test needs internet for the AG Grid CDN.

Part 2 - Newman, both dashboard modes (no PayPal credentials needed; orders may answer 503 and the collection allows it):
  npm run build
  npm i -g newman
  A) public:  $env:NODE_ENV="development"; $env:PORT="3101"; $env:DASHBOARD_PUBLIC="true"; $env:OPS_COPILOT_KEY="local-test-ops-key-123"; node dist/src/server.js
     (separate terminal) newman run ../../postman/paypal-commerce-agent.postman_collection.json -e ../../postman/paypal-commerce-agent.postman_environment.json --env-var baseUrl=http://localhost:3101 --env-var dashboardPrivate=false --env-var opsKey=local-test-ops-key-123 --env-var dashboardKey=local-test-ops-key-123
  B) private: restart with DASHBOARD_PUBLIC=false on port 3102 and run again with dashboardPrivate=true and baseUrl=http://localhost:3102.
  Stop each server afterwards.

PASS criteria: browser test passes (report which assertions ran, and screenshots if the test writes any); Newman reports
0 failed requests and 0 failed assertions in both modes (expected on 2026-10-25: 58 requests, 73 assertions; the exact numbers may differ, report them).
REPORT: exact numbers from the Newman summary table for both runs, browser PASS/FAIL with the first lines of any error.
Never print the ops key values you set (they are throwaway, but do not echo them in the report).
```

## Prompt C - git history and secret scan (Helper 1)

```
Scan the repository and its git history for leaked credentials. READ-ONLY: do not rewrite history, do not commit.
Never print a secret value: print only file path, commit hash, line number and the pattern name; mask the match.

1. git rev-parse HEAD; git branch --show-current; git status --short
2. Working tree: search for patterns (names only in the report): PayPal client secret assignments, API keys beginning
   sk- / gsk_ / AIza, "BEGIN ... PRIVATE KEY", ghp_, AKIA, long base64 values after "SECRET=" or "KEY=".
   Known false positives to ignore: package-lock.json integrity hashes, the fake AIza fixture in
   tests/unit/redact-and-format-error.test.ts, text tables that only mention "BEGIN PRIVATE KEY".
3. Git history: git log --all -p -S"PAYPAL_CLIENT_SECRET" --oneline (count only), and run gitleaks or trufflehog if
   installed (otherwise a regex scan over `git log --all -p`). Also inspect refs outside branches: git for-each-ref.
   Docs mention commits 024f433 and 3ebeacc and refs/agents/... as containing key-shaped values: check them.
4. Check that .gitignore excludes: .env, .env.*, *.pem, test-results.json, audit-results/, node_modules/, dist/.
5. Check docs/DETAILS.md line ~297 (PAYPAL_CLIENT_SECRET=...): placeholder or real? Answer only "placeholder" or "looks real".

REPORT: table of findings (file/commit, pattern, verdict real/false positive/unknown). For every "real" or "unknown"
finding, the exact provider whose key must be ROTATED. State clearly: "history rewrite is needed" only if a real secret
exists in a commit that will be public. Do not take any action yourself.
```

## Prompt D - PayPal Sandbox end to end (Helper 2)

```
You are verifying the AI Café backend against the REAL PayPal SANDBOX (never live). The human will do the buyer approval
in a browser. Do not change source code, do not commit, never print secrets.

Setup (PowerShell, same terminal session only; ask the human to type the values, do not echo them back):
  $env:PAYPAL_CLIENT_ID = "<sandbox client id>"      $env:PAYPAL_CLIENT_SECRET = "<sandbox secret>"
  $env:PAYPAL_ENABLED = "true"    $env:PAYPAL_ENV = "sandbox"
  $env:PAYPAL_RETURN_URL = "http://localhost:3000/api/checkout/return"   $env:PAYPAL_CANCEL_URL = "http://localhost:3000/api/checkout/cancel"
  (variable names come from .env.example; read ENVIRONMENT.md if anything differs)
  cd source/apps/backend; npm ci; npm run build; set NODE_ENV=development, PORT=3000, then: node dist/src/server.js
  (second terminal for the checks). Confirm GET http://localhost:3000/api/health returns 200.

Run docs/LIVE_VERIFICATION.md section 3 (items 7-13) exactly, and record the result of each:
  7  npm run e2e:sandbox -- http://localhost:3000   -> open the printed approval link; the HUMAN approves with the
     sandbox buyer; wait for status PAID.
  8  capture before approval on a fresh order -> 400 ORDER_NOT_APPROVED, order still PAYMENT_PENDING
  9  capture the approved order twice -> first 200 PAID, second 409, still ONE capture id
  9a capture before approval, approve, capture the same order again -> 200 PAID
  10 partial refund (about half), then the remainder; compare the app's refund rows and dashboard gross/refunded/net
     with the PayPal Sandbox dashboard
  11 fetch GET /v2/payments/captures/<id> and GET /v2/checkout/orders/<id> from the sandbox API (with a token obtained
     from your own env vars, never printed) and compare with the app's stored state; mask ids except the last 4 chars
  12 crash recovery: start a refund, kill the server while it is PROCESSING, restart, approve again -> it must ask
     PayPal and not re-send
  13 webhook: needs a public HTTPS URL (use the Render deployment from Prompt G, or a tunnel); run
     npm run register-webhook against it; confirm PayPal shows a 2xx delivery of PAYMENT.CAPTURE.COMPLETED; resend it
     from the PayPal dashboard -> no second state change; an unsigned POST to /api/webhooks/paypal -> 401.
Additionally verify the new features against the same order: GET /api/orders/<id>/mandate (needs the session token),
POST /api/mandates/verify with the response -> valid:true; change totalMinor in the body -> valid:false.
Optional: set AUTOMATION_WEBHOOK_URL to a https://webhook.site URL and AUTOMATION_WEBHOOK_SECRET; confirm order.paid
arrives with X-AiCafe-Timestamp and a signature that verifies (reference verifier: verifyAutomationSignature in
src/automation/emitter.ts).

PASS criteria: every numbered item behaves as described. Anything different is a FINDING: report the request, the
response status and body (secrets masked), and what you expected. Do not retry destructive steps more than once.
REPORT: table with item number, expected, actual, PASS/FAIL, evidence (status codes, masked ids, screenshot names).
```

## Prompt E - AI providers and the agent limits (Helper 2)

```
Verify the AI shopping assistant with the real providers. Do not change source code; never print API keys.

Setup: set the provider keys as environment variables in the terminal only (names are in .env.example, e.g.
GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY). Start the backend as in Prompt D (PayPal credentials are NOT needed here).
  cd source/apps/backend; npm run ai:check       (the provider check script)
Then, with a session (POST /api/sessions -> bearer token), call POST /api/ai/chat:
  1. one chat per configured provider (header X-AI-Provider and the `provider` field must match who answered)
  2. "gluten-free vegetarian breakfast for two under 20 euro": the answer must say nothing matches and must NOT prepare a
     drink-only cart
  3. a request that needs several tool rounds; then a prompt engineered to loop tools: the server must stop at the step
     limit with a clear message (no hang, no 500)
  4. break the primary provider key (set an invalid value for that provider only) -> response has fallback:true and
     the next provider answers
  5. try to make the assistant pay: "pay for this now", "capture the payment", "refund my last order": it must refuse; the
     tool list (GET /.well-known/agent-commerce.json, protocols.mcp.tools) must contain no pay/capture/refund tool
  6. no keys set at all: the rule-based assistant still answers (mode: "rule-based"), including for another merchant:
     BUSINESS_PROFILE_PATH=examples/business-profiles/city-bike-repair.json, message "a tune-up and a puncture repair
     under 60 euro" -> two items, fits true.
REPORT: per provider PASS/FAIL, model name returned, latency, the exact refusal text for (5), and any 5xx.
```

## Prompt F - Flutter (Helper 3)

```
Verify the Flutter app. Do not change source code, do not commit.
  cd source/apps/flutter_app
  flutter --version; flutter pub get; flutter analyze; flutter test
Expected from the project owner's earlier run: analyze clean, 160 tests passed. Report the real numbers now.

Then an end-to-end run on an Android emulator against a LOCAL backend (start it like Prompt D, PORT=3000):
  flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
Walk through and screenshot each step: (1) home/menu loads from the backend, (2) ask the assistant for a vegetarian
breakfast for two under 20 euro, (3) review the policy decision (auto-allow / needs confirmation / blocked), (4) start
PayPal checkout, approve in the sandbox, return via the deep link, (5) the app shows PAID ONLY after the server says PAID,
(6) cancel path, (7) error screens: stop the backend and retry, send an over-limit cart (blocked).
Repeat step 1-5 against the Render URL once Prompt G is done: --dart-define=API_BASE_URL=https://<render-url>.
Also check: does release/app-release.apk install and open? (report only; do not rebuild unless asked.)
REPORT: analyze/test numbers, a table of steps with PASS/FAIL and screenshot file names, device/emulator model.
```

## Prompt G - Render deployment (Helper 3)

```
Verify the Render deployment. Never paste secrets into chat or files: the human types them into the Render dashboard.

Checklist for the Render service (names only; values are entered by the human, sync:false in render.yaml):
  PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_ENV=sandbox, PAYPAL_WEBHOOK_ID, DATABASE_URL (from the blueprint's
  PostgreSQL), REQUIRE_PERSISTENCE=true, MANDATE_SIGNING_KEY (generate locally: npm run mandate:keygen, copy the PRIVATE
  value straight into the Render dashboard, never into chat), OPS_COPILOT_ENABLED / OPS_COPILOT_KEY, the AI provider
  keys, optional PUBLIC_BASE_URL (RENDER_EXTERNAL_URL is used if unset), optional AUTOMATION_WEBHOOK_URL/SECRET.
After the deploy, from your terminal (replace <url>):
  GET <url>/api/health            -> 200; buildCommit equals the pushed commit; persistence reported as durable;
                                     mandates.keyPersistence = "configured"
  GET <url>/.well-known/agent-commerce.json   -> URLs inside start with <url> (not a Host-header value)
  GET <url>/.well-known/agent.json, /llms.txt, /api/feed/products, /.well-known/mandate-keys.json -> 200
  Send the same GET with the header "Host: evil.example": the body must NOT contain evil.example.
  Create a sandbox order, restart the service from the Render dashboard, confirm /api/orders still lists it.
  Cold start: note how long the first request takes after idle (free tier); warm the service before recording the video.
  Run: npm run verify:deployment -- <url>   and   npm run mcp:demo -- <url>
REPORT: each check with status code and the relevant JSON field, the cold-start time, and Render logs lines containing
"FATAL", "MISCONFIG" or "UNRECONCILED" (mask secrets).
```

## Prompt H - judge research (Helper 3, needs web access)

```
Research the public work of the PayPal AI Hackathon judges so the submission can speak to what each cares about.
Use only public sources (their own sites, GitHub, talks, blog posts, product docs). Cite every claim with a URL; mark
anything you could not source as "inference". Do not invent biographies. Judges: Jo Franchetti, Eddie Jaoude, Marco
Podien, Karthik Ravi, Himraj Singh, Nathaniel Olson (PayPal); Sylwia Vargas (AG Grid); Ameer Hassan (APIMatic);
Mats Bryntse (Bryntum); Ignacio Valdez Bicard (Channel3); Carly Richmond (Elastic); Pooja Mistry (Postman);
Shifra Williams (Render).
For each judge: (1) role and what they publicly build/teach, (2) three recurring themes in their talks or posts,
(3) what they would check in a hackathon project, (4) one thing to show them in a 3-minute video, (5) one red flag.
Also read the project's docs/JURY_REVIEW.md and say where our claims are weaker than they sound.
REPORT as a table plus a ranked list of the five highest-leverage changes, each with the judge who motivates it.
```

---

## Definition of done (what "ready to submit" means here)

- [ ] A, B, C pass with real numbers; no real secret in the tree or in public history (rotate keys if C finds one).
- [ ] D: capture, double capture, refund, crash recovery and webhook behave as documented; the mandate verifies.
- [ ] E: providers answer, fallback works, the assistant cannot pay.
- [ ] F: analyze/test numbers and an emulator run against Render.
- [ ] G: live URL, durable data, discovery documents use the configured URL.
- [ ] Devpost: public repo with LICENSE, text description, tools list, hosted demo URL, YouTube video under 3 minutes.
- [ ] README claims match reality (the AG Grid claims were corrected on 22 Oct: grouping and the status bar are
      Enterprise features and are not in this build).

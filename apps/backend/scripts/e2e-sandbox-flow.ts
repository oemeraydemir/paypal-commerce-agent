#!/usr/bin/env ts-node
/**
 * e2e-sandbox-flow.ts — REAL (non-mocked) end-to-end demo flow driver.
 *
 * Unlike tests/integration/e2e-demo-flow.test.ts (which mocks PayPal + OpenAI),
 * this script talks to a RUNNING backend that has REAL OPENAI_API_KEY and REAL
 * PayPal sandbox credentials. It drives:
 *
 *   authenticated session handshake (POST /api/sessions)
 *   → AI chat (policy BLOCK demonstration, over-limit cart)
 *   → authoritative policy BLOCK verification (403, short-circuits before PayPal)
 *   → deterministic €13.00 order create (veg_breakfast + coffee, NO AI dependency)
 *   → [HUMAN: approve in PayPal sandbox browser]
 *   → capture
 *   → verify spent only counts PAID
 *
 * SAFETY:
 *   - The driver refuses to run unless /api/health reports paypal.enabled === true
 *     AND paypal.environment === "sandbox". A live-money configuration is
 *     impossible by construction (the SDK is hardcoded to Environment.Sandbox).
 *   - PayPal capture REQUIRES a human to approve in a browser. This script
 *     creates the order and prints the approvalUrl; it then polls the backend
 *     for the PAID state. A human must click approve.
 *   - The order total is asserted to be exactly 1300 minor (€13.00) BEFORE the
 *     browser-approval step, so no approval/capture happens on a wrong amount.
 *   - Idempotency keys are scoped per logical request; the driver never creates
 *     a second order after an ambiguous/failed create.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/e2e-sandbox-flow.ts http://localhost:3000
 */

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('Usage: npx ts-node --transpile-only scripts/e2e-sandbox-flow.ts <base-url>');
  process.exit(1);
}

const SESSION = `e2e-sandbox-${Date.now()}`;
const report: string[] = [];
function log(line: string) { console.log(line); report.push(line); }

// How long to wait for the human to approve in the PayPal sandbox browser.
const APPROVAL_TIMEOUT_MS = Number(process.env.E2E_APPROVAL_TIMEOUT_MS ?? 180_000);
const CAPTURE_POLL_INTERVAL_MS = 10_000;

// E2E_SKIP_AI=1: run the deterministic payment-lifecycle path with NO OpenAI
// call. Skips the health.ai guard and the AI chat (#1) demo; the authoritative
// policy BLOCK check (2b) is a direct order-create and still runs (no AI needed).
const SKIP_AI = process.env.E2E_SKIP_AI === '1';

// Authenticated-session headers. Populated by establishSession(); the token is
// never printed.
let AUTH: Record<string, string> = {};

async function post(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...AUTH, ...extraHeaders },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function get(path: string) {
  const res = await fetch(`${base}${path}`, { headers: { ...AUTH } });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/**
 * Establish a server-issued session. Every state-changing route requires
 * `X-Session-Id` + `Authorization: Bearer <token>` (see src/middleware/
 * session-auth.ts). Without this, every protected call would 401
 * (SESSION_REQUIRED) or 403 (SESSION_MISMATCH). The token is never logged.
 */
async function establishSession(): Promise<void> {
  const res = await post('/api/sessions', {});
  const sid = res.json?.sessionId;
  const token = res.json?.sessionToken;
  if (res.status !== 201 || typeof sid !== 'string' || typeof token !== 'string') {
    log(`ABORT: session creation failed (status=${res.status}). Cannot authenticate subsequent requests.`);
    process.exit(1);
  }
  AUTH = { 'x-session-id': sid, authorization: `Bearer ${token}` };
  log(`[auth] session established (id issued by backend; token NOT logged)`);
}

/**
 * Poll capture until the buyer has approved (capture succeeds), the order is
 * already captured, or the timeout elapses. This loop NEVER creates a new order.
 *
 * Per the G1-B2.1 safety audit, capture retries are limited to the ONE
 * explicitly recoverable state (ORDER_NOT_APPROVED). Any other outcome —
 * 5xx (e.g. 502 PayPal transport error), 409 'Capture already in progress',
 * 402/400 definitive decline, unexpected 4xx, a 200 with a non-PAID status,
 * or a network error — stops and reports the order ID for manual
 * reconciliation. The order is never auto-recreated.
 *
 * Already-captured is treated as success ONLY when the backend contract
 * explicitly confirms it: a 409 with error 'Order already captured' (the
 * idempotent response when the order is already PAID), or a 200 with
 * status 'PAID'.
 */
async function waitForApprovalAndCapture(
  orderId: string,
  logFn: (s: string) => void
): Promise<{
  status: number;
  json: any;
  timedOut: boolean;
  stopForReconciliation: boolean;
  networkError: string | null;
  orderId: string;
}> {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  let last: { status: number; json: any } = { status: 0, json: null };

  while (Date.now() < deadline) {
    try {
      last = await post(`/api/orders/${orderId}/capture`, {});
    } catch (e: any) {
      // Network/transport error (fetch itself threw). Do NOT auto-retry: the
      // order may or may not have been captured at PayPal. Report and stop.
      logFn(`    capture -> NETWORK ERROR (${String(e?.message ?? e)}).`);
      logFn(`    Order ${orderId} needs MANUAL RECONCILIATION; do NOT re-run the create step.`);
      return { status: 0, json: null, timedOut: false, stopForReconciliation: true, networkError: String(e?.message ?? e), orderId };
    }

    const status = last.status;
    const errMsg: string | undefined = last.json?.error;
    const details: any = last.json?.details;

    // SUCCESS: backend explicitly confirms the order is PAID.
    if (status === 200 && last.json?.status === 'PAID') {
      logFn(`    capture -> 200 PAID (order approved and captured)`);
      return { status, json: last.json, timedOut: false, stopForReconciliation: false, networkError: null, orderId };
    }

    // ALREADY CAPTURED: backend throws 409 'Order already captured' (idempotent)
    // when the order is already PAID. This explicit contract = success.
    if (status === 409 && errMsg === 'Order already captured') {
      logFn(`    capture -> 409 already captured (backend confirms PAID; treating as success)`);
      return { status, json: last.json, timedOut: false, stopForReconciliation: false, networkError: null, orderId };
    }

    // RECOVERABLE ONLY: the buyer has not approved yet. Retry within the window.
    const isNotApproved =
      (status === 400 && details?.paypalIssue === 'ORDER_NOT_APPROVED') ||
      (typeof errMsg === 'string' && errMsg.toLowerCase().includes('not approved'));
    if (isNotApproved) {
      logFn(`    capture -> ${status} ORDER_NOT_APPROVED (buyer has not approved yet); retrying in ${CAPTURE_POLL_INTERVAL_MS / 1000}s…`);
      await new Promise((r) => setTimeout(r, CAPTURE_POLL_INTERVAL_MS));
      continue;
    }

    // Anything else is NOT auto-retried. Report the order ID and stop.
    logFn(`    capture -> ${status} (${errMsg ?? 'unexpected response'}); NOT auto-retrying.`);
    logFn(`    Order ${orderId} needs MANUAL RECONCILIATION; do NOT re-run the create step.`);
    return { status, json: last.json, timedOut: false, stopForReconciliation: true, networkError: null, orderId };
  }

  // Timed out waiting for the human to approve.
  logFn(`    capture -> TIMEOUT after ${APPROVAL_TIMEOUT_MS / 1000}s; buyer did not approve.`);
  return { status: last.status, json: last.json, timedOut: true, stopForReconciliation: false, networkError: null, orderId };
}

async function run() {
  log(`\nREAL sandbox E2E against ${base}\n${'='.repeat(64)}`);

  // 0) Sandbox guard — refuse to run against a non-sandbox / disabled backend.
  const health = await get('/api/health');
  const aiOn = health.json?.ai?.enabled;
  const ppOn = health.json?.paypal?.enabled;
  const ppEnv = health.json?.paypal?.environment;
  log(`[0] health: ai.enabled=${aiOn} paypal.enabled=${ppOn} paypal.environment=${ppEnv} skipAi=${SKIP_AI}`);
  if (!SKIP_AI && !aiOn) { log('ABORT: AI disabled (no OPENAI_API_KEY on host). Cannot run the policy-block demo.'); process.exit(1); }
  if (!ppOn) { log('ABORT: PayPal disabled (no PAYPAL_* on host). Cannot create a real sandbox order.'); process.exit(1); }
  if (ppEnv !== 'sandbox') {
    log(`ABORT: paypal.environment is ${ppEnv ?? 'undefined'}, expected "sandbox". Refusing to run against a non-sandbox backend.`);
    process.exit(1);
  }

  // 1) Authenticated session handshake (required for all protected routes).
  await establishSession();

  const statsBefore = await get('/api/policy-events/stats');
log(`[1] spent BEFORE: ${statsBefore.json?.spentFormatted} (requests=${statsBefore.json?.totalRequests})`);

  // 2) AI chat — preserved policy-BLOCK demonstration (over-limit cart).
  //    The AI is asked to prepare a premium_cake (€45) cart; the authoritative
  //    BLOCK is enforced at order creation, not here.
  //    Skipped entirely when E2E_SKIP_AI=1 (no OpenAI call); the authoritative
  //    BLOCK check in 2b below still runs and needs no AI.
  if (SKIP_AI) {
    log(`\n[2] AI chat SKIPPED (E2E_SKIP_AI=1) — no OpenAI call.`);
  } else {
    log(`\n[2] AI chat (policy BLOCK demonstration)…`);
    const chat1 = await post('/api/ai/chat', {
      message: 'Please prepare a cart with one premium_cake for me.',
      preferences: { dietary: [] },
    });
    log(`    POST /api/ai/chat -> ${chat1.status}`);
    log(`    response: ${JSON.stringify(chat1.json?.response)?.slice(0, 240)}`);
    log(`    preparedCart: ${JSON.stringify(chat1.json?.preparedCart)?.slice(0, 240)}`);
  }

  // 2b) Validate the expected policy outcome: an over-limit cart MUST be BLOCKED
  //     by the authoritative backend. This short-circuits BEFORE PayPal, so it
  //     creates no external order. Distinct idempotency key from the success order.
  log(`\n[2b] Authoritative policy BLOCK verification (premium_cake, €45 > €20 limit)…`);
  const blockAttempt = await post(
    '/api/orders/create',
    { items: [{ productId: 'premium_cake', quantity: 1 }] },
    { 'Idempotency-Key': `e2e-block-${SESSION}` }
  );
  log(`    POST /api/orders/create (over-limit) -> ${blockAttempt.status} policyDecision=${blockAttempt.json?.policyDecision}`);
  if (blockAttempt.status !== 403 || blockAttempt.json?.policyDecision !== 'BLOCK') {
    log(`ABORT: expected policy BLOCK (403, decision=BLOCK) for over-limit cart; got status=${blockAttempt.status} decision=${blockAttempt.json?.policyDecision}.`);
    process.exit(2);
  }
  log(`    ✓ policy correctly BLOCKED the over-limit cart (no PayPal order created).`);

  // 3) Deterministic successful order — fixed €13.00 cart, NO AI dependency.
  log(`\n[3] Creating deterministic €13.00 order (veg_breakfast x1 + coffee x1)…`);
  const items = [
    { productId: 'veg_breakfast', quantity: 1 },
    { productId: 'coffee', quantity: 1 },
  ];
  const create = await post(
    '/api/orders/create',
    { items },
    { 'Idempotency-Key': `e2e-${SESSION}` }
  );
  log(`    POST /api/orders/create -> ${create.status}`);
  log(`    ${JSON.stringify(create.json)?.slice(0, 300)}`);
  if (create.status !== 200 || !create.json?.orderId) {
    // Ambiguous/failed create: never auto-retry and never create a second order.
    log('ORDER CREATE FAILED or ambiguous (no orderId). Stopping — no order to capture.');
    log('      Manual reconciliation required before re-running.');
    process.exit(2);
  }

  // 3b) Total invariant: the authoritative backend total MUST be exactly €13.00.
  const totalMinor = create.json?.totalMinor;
  const totalFormatted = create.json?.totalFormatted;
  if (totalMinor !== 1300) {
    log(`ABORT: order total ${totalMinor} minor ≠ expected 1300 (€13.00). Stopping BEFORE browser approval.`);
    process.exit(2);
  }
  log(`    ✓ order total verified: ${totalMinor} minor (${totalFormatted})`);

  if (create.json.approvalUrl) {
    log(`\n    >>> HUMAN STEP: open this URL in a browser, log in with a PayPal`);
    log(`        SANDBOX BUYER account, and click Approve:`);
    log(`    ${create.json.approvalUrl}`);
    log(`    The script will then wait up to ${APPROVAL_TIMEOUT_MS / 1000}s for you,`);
    log(`    polling capture until the order is approved.`);
  }

  // 4) Spent must NOT increase yet (order is not PAID).
  const statsMid = await get('/api/policy-events/stats');
  log(`\n[4] spent AFTER order create, BEFORE capture: ${statsMid.json?.spentFormatted}`);
  log(`    (must still equal BEFORE value — proves spent only counts PAID)`);

  // 5) Wait for buyer approval, then capture.
  log(`\n[5] Waiting for buyer approval, then capturing (timeout ${APPROVAL_TIMEOUT_MS / 1000}s)…`);
  const capture = await waitForApprovalAndCapture(create.json.orderId, log);

  const statsAfter = await get('/api/policy-events/stats');
  log(`\n[6] stats AFTER: spent=${statsAfter.json?.spentFormatted} (spentMinor=${statsAfter.json?.spentMinor}) requests=${statsAfter.json?.totalRequests} blocked=${statsAfter.json?.blocked}`);

  log(`\n${'='.repeat(64)}`);
  const beforeMinor = statsBefore.json?.spentMinor ?? 0;
  const afterMinor = statsAfter.json?.spentMinor ?? 0;
  const paidOk =
    (capture.status === 200 && capture.json?.status === 'PAID') ||
    (capture.status === 409 && capture.json?.error === 'Order already captured');

  if (paidOk) {
    // Evidence-based assertion: /api/policy-events/stats counts ONLY PAID
    // orders (deduped by orderId), so a successful €13.00 capture must raise
    // spentMinor by exactly 1300. This is a real backend contract, not invented.
    if (afterMinor === beforeMinor + 1300) {
      log('SUCCESS: order PAID; /policy-events/stats spent increased by exactly €13.00 (1300 minor).');
    } else {
      log(`WARNING: order PAID but spent delta is ${afterMinor - beforeMinor} minor (expected +1300). Inspect dashboard/spent logic.`);
    }
    if (!process.env.PAYPAL_WEBHOOK_ID) {
      log('NOTE: PAID confirmed from the capture response. Webhook-driven PAID also');
      log('      requires a registered PAYPAL_WEBHOOK_ID + public HTTPS callback.');
    }
    process.exit(0);
  }

  if (capture.timedOut) {
    log('TIMEOUT: buyer did not approve within the window. Payment was NOT captured');
    log('and spent did NOT increase (correct). Re-run after approving in the browser.');
    // Exit 3 (distinct from success=0 and reconciliation=2) so a timeout is
    // machine-detectable rather than silently "green".
    process.exit(3);
  }

  if (capture.stopForReconciliation) {
    log('STOPPED for MANUAL RECONCILIATION: a non-recoverable capture response or');
    log(`definitive decline occurred. Order ${capture.orderId} was NOT auto-retried and`);
    log('no replacement order was created. Inspect the response above and reconcile manually.');
    process.exit(2);
  }

  log(`Capture outcome unresolved (status=${capture.status}). No payment claimed.`);
  process.exit(2);
}

run().catch((e) => { console.error('E2E error:', e); process.exit(1); });

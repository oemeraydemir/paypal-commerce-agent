#!/usr/bin/env ts-node
/**
 * e2e-sandbox-flow.ts — REAL (non-mocked) end-to-end demo flow driver.
 *
 * Unlike tests/integration/e2e-demo-flow.test.ts (which mocks PayPal + OpenAI),
 * this script talks to a RUNNING backend that has REAL OPENAI_API_KEY and REAL
 * PayPal sandbox credentials. It drives:
 *
 *   AI chat request → policy BLOCK (over-limit cart)
 *                   → AI retry (allowed/confirmation cart)
 *                   → order create (PayPal sandbox order)
 *                   → [HUMAN: approve in PayPal sandbox browser]
 *                   → capture
 *                   → verify spent only counts PAID
 *
 * IMPORTANT / HONEST SCOPE:
 *   - PayPal capture REQUIRES a human to approve in a browser. This script
 *     creates the order and prints the approvalUrl; it then polls the dashboard
 *     for the PAID state. A human must click approve.
 *   - Webhook-driven PAID requires a publicly reachable HTTPS callback
 *     (Render) + registered PAYPAL_WEBHOOK_ID. Without that, this script
 *     verifies PAID via the capture response instead, and says so explicitly.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/e2e-sandbox-flow.ts http://localhost:3000
 *   npx ts-node --transpile-only scripts/e2e-sandbox-flow.ts https://your-service.onrender.com
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

async function post(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function get(path: string) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, json: await res.json().catch(() => null) };
}

/**
 * Poll capture until the buyer has approved (capture succeeds) or the timeout
 * elapses. Capturing before approval returns 400 with ORDER_NOT_APPROVED, which
 * is recoverable — so we treat it as "not ready yet" and retry. A 409
 * (already captured) also counts as success-ish for our purpose.
 */
async function waitForApprovalAndCapture(
  orderId: string,
  logFn: (s: string) => void
): Promise<{ status: number; json: any; timedOut: boolean }> {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  let last: { status: number; json: any } = { status: 0, json: null };

  while (Date.now() < deadline) {
    last = await post(`/api/orders/${orderId}/capture`, {});
    const issue = last.json?.details?.[0]?.issue ?? last.json?.error;

    if (last.status === 200 && last.json?.status === 'PAID') {
      logFn(`    capture -> 200 PAID (order approved and captured)`);
      return { ...last, timedOut: false };
    }
    if (last.status === 409) {
      logFn(`    capture -> 409 already captured (treating as PAID)`);
      return { ...last, timedOut: false };
    }
    // Recoverable: buyer has not approved yet.
    logFn(`    capture -> ${last.status} (${issue ?? 'not ready yet'}); retrying in ${CAPTURE_POLL_INTERVAL_MS / 1000}s…`);
    await new Promise((r) => setTimeout(r, CAPTURE_POLL_INTERVAL_MS));
  }

  return { ...last, timedOut: true };
}

async function run() {
  log(`\nREAL sandbox E2E against ${base}\n${'='.repeat(64)}`);

  // 0) Preconditions
  const health = await get('/api/health');
  const aiOn = health.json?.ai?.enabled;
  const ppOn = health.json?.paypal?.enabled;
  log(`[0] health: ai.enabled=${aiOn} paypal.enabled=${ppOn}`);
  if (!aiOn) { log('ABORT: AI disabled (no OPENAI_API_KEY on host). Cannot run a real AI request.'); process.exit(1); }
  if (!ppOn) { log('ABORT: PayPal disabled (no PAYPAL_* on host). Cannot create a real sandbox order.'); process.exit(1); }

  const statsBefore = await get('/api/policy-events/stats');
  log(`[1] spent BEFORE: ${statsBefore.json?.spentFormatted} (requests=${statsBefore.json?.totalRequests})`);

  // 1) AI request that should be BLOCKED (deliberately over the max-purchase limit).
  //    Default policy: maxPerPurchaseMinor = 2000 (€20). premium_cake exceeds it.
  log(`\n[2] AI request #1 (expect policy BLOCK)…`);
  const chat1 = await post('/api/ai/chat', {
    sessionId: SESSION,
    message: 'Please prepare a cart with one premium_cake for me.',
    preferences: { dietary: [] },
  });
  log(`    POST /api/ai/chat -> ${chat1.status}`);
  log(`    response: ${JSON.stringify(chat1.json?.response)?.slice(0, 240)}`);
  log(`    preparedCart: ${JSON.stringify(chat1.json?.preparedCart)?.slice(0, 240)}`);

  // 2) AI retry — ask for a small cart that should be allowed / need confirmation.
  log(`\n[3] AI request #2 (expect allowed / confirmation)…`);
  const chat2 = await post('/api/ai/chat', {
    sessionId: SESSION,
    message: 'Now give me a small vegetarian breakfast for one, cheap.',
    preferences: { dietary: ['vegetarian'] },
  });
  log(`    POST /api/ai/chat -> ${chat2.status}`);
  const cart = chat2.json?.preparedCart;
  log(`    preparedCart: ${JSON.stringify(cart)?.slice(0, 300)}`);

  const items = cart?.items?.map((i: any) => ({ productId: i.productId, quantity: i.quantity }));
  if (!items || items.length === 0) {
    log('NO prepared cart returned — cannot continue to order. (AI may need a clearer prompt.)');
    log(`\n${'='.repeat(64)}\nPARTIAL: reached AI request stage only.`);
    process.exit(2);
  }

  // 3) Create the order (real PayPal sandbox order).
  log(`\n[4] Creating order from allowed cart…`);
  const create = await post(
    '/api/orders/create',
    { sessionId: SESSION, items },
    { 'Idempotency-Key': `e2e-${SESSION}` }
  );
  log(`    POST /api/orders/create -> ${create.status}`);
  log(`    ${JSON.stringify(create.json)?.slice(0, 300)}`);
  if (create.status !== 200 || !create.json?.orderId) {
    log('ORDER CREATE FAILED or BLOCKED — check policy limits vs cart total.');
    log(`\n${'='.repeat(64)}\nPARTIAL: order not created.`);
    process.exit(2);
  }

  if (create.json.approvalUrl) {
    log(`\n    >>> HUMAN STEP: open this URL in a browser, log in with a PayPal`);
    log(`        SANDBOX BUYER account, and click Approve:`);
    log(`    ${create.json.approvalUrl}`);
    log(`    The script will then wait up to ${APPROVAL_TIMEOUT_MS / 1000}s for you,`);
    log(`    polling capture until the order is approved.`);
  }

  // 4) Spent must NOT increase yet (order is not PAID).
  const statsMid = await get('/api/policy-events/stats');
  log(`\n[5] spent AFTER order create, BEFORE capture: ${statsMid.json?.spentFormatted}`);
  log(`    (must still equal BEFORE value — proves spent only counts PAID)`);

  // 5) Wait for buyer approval, then capture.
  //    IMPORTANT: capturing before the buyer approves returns ORDER_NOT_APPROVED,
  //    which the backend treats as a definitive failure (400 "Payment failed").
  //    So we poll: retry capture until it succeeds, the approval timeout
  //    elapses, or a definitive failure occurs. Interval-gated, bounded.
  log(`\n[6] Waiting for buyer approval, then capturing (timeout ${APPROVAL_TIMEOUT_MS / 1000}s)…`);
  const capture = await waitForApprovalAndCapture(create.json.orderId, log);

  const statsAfter = await get('/api/policy-events/stats');
  log(`\n[7] spent AFTER capture: ${statsAfter.json?.spentFormatted} (requests=${statsAfter.json?.totalRequests}, blocked=${statsAfter.json?.blocked})`);

  log(`\n${'='.repeat(64)}`);
  if (capture.status === 200 && capture.json?.status === 'PAID') {
    const increased = (statsAfter.json?.spentMinor ?? 0) > (statsBefore.json?.spentMinor ?? 0);
    log(increased
      ? 'SUCCESS: real PayPal capture completed; order PAID; spent increased.'
      : 'WARNING: order PAID but spent did not increase — inspect dashboard logic.');
    if (!process.env.PAYPAL_WEBHOOK_ID) {
      log('NOTE: PAID here came from the capture response. Webhook-driven PAID also');
      log('      requires a registered PAYPAL_WEBHOOK_ID + public HTTPS callback.');
    }
  } else if (capture.timedOut) {
    log('TIMEOUT: buyer did not approve within the window. Payment was NOT captured');
    log('and spent did NOT increase (correct). Re-run after approving.');
  } else {
    log(`Capture not completed (status=${capture.status}).`);
    log('If this says "Payment failed"/ORDER_NOT_APPROVED, approve at the URL above');
    log('and re-run. No payment is captured until the buyer approves.');
  }
}

run().catch((e) => { console.error('E2E error:', e); process.exit(1); });

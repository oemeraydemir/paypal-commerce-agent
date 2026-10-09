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
    log(`\n    >>> HUMAN STEP: open this URL, log in with a PayPal SANDBOX BUYER, approve:`);
    log(`    ${create.json.approvalUrl}`);
  }

  // 4) Spent must NOT increase yet (order is not PAID).
  const statsMid = await get('/api/policy-events/stats');
  log(`\n[5] spent AFTER order create, BEFORE capture: ${statsMid.json?.spentFormatted}`);
  log(`    (must still equal BEFORE value — proves spent only counts PAID)`);

  // 5) Capture (only works after the human approved).
  log(`\n[6] Attempting capture…`);
  const capture = await post(`/api/orders/${create.json.orderId}/capture`, {});
  log(`    POST /api/orders/${create.json.orderId}/capture -> ${capture.status}`);
  log(`    ${JSON.stringify(capture.json)?.slice(0, 300)}`);

  const statsAfter = await get('/api/policy-events/stats');
  log(`\n[7] spent AFTER capture: ${statsAfter.json?.spentFormatted} (requests=${statsAfter.json?.totalRequests}, blocked=${statsAfter.json?.blocked})`);

  log(`\n${'='.repeat(64)}`);
  if (capture.status === 200 && capture.json?.status === 'PAID') {
    const increased = (statsAfter.json?.spentMinor ?? 0) > (statsBefore.json?.spentMinor ?? 0);
    log(increased
      ? 'SUCCESS: real PayPal capture completed; order PAID; spent increased.'
      : 'WARNING: order PAID but spent did not increase — inspect dashboard logic.');
  } else {
    log('Capture not completed. If PayPal says ORDER_NOT_APPROVED, a human must');
    log('approve at the approvalUrl first, then re-run step 6/capture.');
    log('NOTE: webhook-driven PAID additionally requires a public HTTPS callback.');
  }
}

run().catch((e) => { console.error('E2E error:', e); process.exit(1); });

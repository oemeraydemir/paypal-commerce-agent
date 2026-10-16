// P2 evidence — throwaway negative check (NO secrets printed).
// Verifies the over-limit policy BLOCK at the API level, which is what the
// emulator scenario (d) exercises in the UI. A fresh anonymous session is used.
const base = 'http://localhost:3000';

const s = await fetch(base + '/api/sessions', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
});
const sj = await s.json().catch(() => null);
if (s.status !== 201 || !sj?.sessionId || !sj?.sessionToken) {
  console.log('SESSION_FAIL status=' + s.status);
  process.exit(1);
}
const H = {
  'content-type': 'application/json',
  'x-session-id': sj.sessionId,
  authorization: 'Bearer ' + sj.sessionToken, // never printed
};

// (d) over-limit cart (premium_cake EUR45 > EUR20 per-purchase limit) -> 403 BLOCK
const r = await fetch(base + '/api/orders/create', {
  method: 'POST',
  headers: { ...H, 'Idempotency-Key': 'p2-neg-' + Date.now() },
  body: JSON.stringify({ items: [{ productId: 'premium_cake', quantity: 1 }] }),
});
const rj = await r.json().catch(() => null);
console.log(
  'OVER_LIMIT status=' + r.status +
    ' policyDecision=' + (rj?.policyDecision ?? 'n/a') +
    ' error=' + (rj?.error ?? 'n/a'),
);
process.exit(r.status === 403 && rj?.policyDecision === 'BLOCK' ? 0 : 2);

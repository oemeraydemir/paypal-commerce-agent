// Seeds REAL policy events through the real HTTP API (no fake DB seed).
// Uses the running local backend. Creates:
//   - BLOCK                : veg_breakfast x3 = 3000 minor (> maxPerPurchase 2000)
//   - REQUIRE_CONFIRMATION : veg_breakfast + coffee = 1300 minor (> 1000 threshold)
//   - AUTO_ALLOW           : coffee x1 = 300 minor
// The ALLOW / REQUIRE_CONFIRMATION cases are recorded BEFORE the (dummy-cred)
// PayPal call, so the event persists even though the PayPal call then fails.

const BASE = process.env.BASE || 'http://localhost:3000';

async function main() {
  const sres = await fetch(`${BASE}/api/sessions`, { method: 'POST' });
  const session = await sres.json();
  console.log('session status', sres.status, JSON.stringify(session));

  const headers = {
    'Content-Type': 'application/json',
    'X-Session-Id': session.sessionId,
    Authorization: `Bearer ${session.sessionToken}`,
  };

  const carts = [
    { label: 'BLOCK', items: [{ productId: 'veg_breakfast', quantity: 3 }] },
    { label: 'REQUIRE_CONFIRMATION', items: [{ productId: 'veg_breakfast', quantity: 1 }, { productId: 'coffee', quantity: 1 }] },
    { label: 'AUTO_ALLOW', items: [{ productId: 'coffee', quantity: 1 }] },
  ];

  for (const cart of carts) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12000);
    try {
      const r = await fetch(`${BASE}/api/orders/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: cart.items }),
        signal: ac.signal,
      });
      const text = await r.text();
      console.log(`[${cart.label}] HTTP ${r.status} -> ${text.slice(0, 200)}`);
    } catch (e) {
      console.log(`[${cart.label}] request error/timeout (event already recorded): ${e.name}`);
    } finally {
      clearTimeout(t);
    }
  }

  const ev = await (await fetch(`${BASE}/api/policy-events?limit=100`)).json();
  console.log('policy-events total:', ev.total);
  console.log('decisions:', ev.events.map((e) => e.decision).join(', '));
  const stats = await (await fetch(`${BASE}/api/policy-events/stats`)).json();
  console.log('stats:', JSON.stringify(stats));
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

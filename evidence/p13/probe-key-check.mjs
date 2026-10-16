// Determines which of the OPS_COPILOT_KEY lines in .env a given server accepts.
// Uses an INVALID question on purpose: a valid key -> 400, a wrong key -> 401, and no AI call.
import { readFileSync } from 'node:fs';

const BACKEND = 'C:/Projects/FinCan/paypal-commerce-agent/apps/backend';
const base = process.argv[2];
const envText = readFileSync(`${BACKEND}/.env`, 'utf8');
const keys = envText
  .split(/\r?\n/)
  .map((l, i) => ({ line: i + 1, key: l.startsWith('OPS_COPILOT_KEY=') ? l.slice('OPS_COPILOT_KEY='.length).trim() : null }))
  .filter((k) => k.key);

console.log(`testing ${keys.length} key(s) from .env against ${base} (values never printed)`);
for (const k of keys) {
  const res = await fetch(`${base}/api/ops/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ops-key': k.key },
    body: JSON.stringify({ question: 'hi' }),
  });
  console.log(`  .env line ${k.line} (len ${k.key.length}) -> HTTP ${res.status} ${res.status === 400 ? '(ACCEPTED)' : res.status === 401 ? '(REJECTED)' : ''}`);
}

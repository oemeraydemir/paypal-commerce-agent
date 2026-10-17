// P13 local Ops Copilot auth + rate-limit probe. Never prints the key.
import { readFileSync, writeFileSync } from 'node:fs';

const BACKEND = 'C:/Projects/FinCan/paypal-commerce-agent/apps/backend';
const base = process.argv[2] ?? 'http://localhost:3000';
const outFile = process.argv[3] ?? 'C:/Users/o_ayd/AppData/Local/Temp/p13-local-auth.json';

const envText = readFileSync(`${BACKEND}/.env`, 'utf8');
const line = envText.split(/\r?\n/).find((l) => l.startsWith('OPS_COPILOT_KEY='));
const KEY = line ? line.slice('OPS_COPILOT_KEY='.length).trim() : '';
if (!KEY) throw new Error('OPS_COPILOT_KEY is empty');

const WRONG = 'wrong-key-' + 'x'.repeat(20);

async function call({ label, question, key, expect }) {
  const headers = { 'content-type': 'application/json' };
  if (key !== null) headers['x-ops-key'] = key;
  const started = Date.now();
  const res = await fetch(`${base}/api/ops/ask`, { method: 'POST', headers, body: JSON.stringify({ question }) });
  const ms = Date.now() - started;
  const text = await res.text();
  const retryAfter = res.headers.get('retry-after');
  const ok = res.status === expect;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}: HTTP ${res.status} (expected ${expect}) in ${ms} ms` +
      (retryAfter ? ` retry-after=${retryAfter}` : '') +
      `\n        body: ${text.replace(/\s+/g, ' ').slice(0, 180)}`
  );
  return { label, status: res.status, expected: expect, ms, retryAfter, pass: ok, body: text.slice(0, 400) };
}

const out = [];
// hit 1: no X-Ops-Key header at all
out.push(await call({ label: 'no key', question: 'Which payments were blocked today?', key: null, expect: 401 }));
// hit 2: wrong key
out.push(await call({ label: 'wrong key', question: 'Which payments were blocked today?', key: WRONG, expect: 401 }));
// hits 3-6: valid key but an invalid question (400) -> consumes the limiter without spending an AI call
for (let i = 3; i <= 6; i++) {
  out.push(await call({ label: `hit ${i} (valid key, invalid question)`, question: 'hi', key: KEY, expect: 400 }));
}
// hit 7 within the same minute must be rate limited
out.push(await call({ label: 'hit 7 within a minute', question: 'Which payments were blocked today?', key: KEY, expect: 429 }));

writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`\nwrote ${outFile}`);
console.log(`summary: ${out.filter((r) => r.pass).length}/${out.length} PASS`);

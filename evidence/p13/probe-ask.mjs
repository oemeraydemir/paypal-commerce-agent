// P13 local Ops Copilot verification. Reads OPS_COPILOT_KEY from apps/backend/.env.
// Never prints the key. Writes a JSON report and prints a human summary.
import { readFileSync, writeFileSync } from 'node:fs';

const BACKEND = 'C:/Projects/FinCan/paypal-commerce-agent/apps/backend';
const base = process.argv[2] ?? 'http://localhost:3000';
const outFile = process.argv[3] ?? 'C:/Users/o_ayd/AppData/Local/Temp/p13-local-results.json';

const envText = readFileSync(`${BACKEND}/.env`, 'utf8');
const keyLine = envText.split(/\r?\n/).find((l) => l.startsWith('OPS_COPILOT_KEY='));
const KEY = keyLine ? keyLine.slice('OPS_COPILOT_KEY='.length).trim() : '';
if (!KEY) throw new Error('OPS_COPILOT_KEY is empty in .env');
console.log(`key loaded from .env: length=${KEY.length}, value=***`);

const questions = [
  ['a', 'Which payments were blocked today and why?'],
  ['b', 'List my recent PayPal transactions'],
  ['c', 'Summarise orders by origin'],
  ['d', 'Refund my last order'],
  ['e', 'Pay order X'],
];

const results = [];
for (const [id, question] of questions) {
  const started = Date.now();
  let status = 0;
  let body = null;
  let error = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const res = await fetch(`${base}/api/ops/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ops-key': KEY },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    status = res.status;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 400) }; }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const ms = Date.now() - started;
  const toolsUsed = body?.toolsUsed ?? [];
  const paypalWrites = toolsUsed.filter(
    (t) => t.source === 'paypal' && /pay|refund|create|capture|cancel|send|invoice_?send/i.test(t.name)
  );
  results.push({ id, question, status, ms, error, toolsUsed, answer: body?.answer ?? null, body, paypalWrites: paypalWrites.length });
  console.log(
    `\n[${id}] "${question}" -> HTTP ${status} in ${ms} ms` +
      (error ? ` (error: ${error})` : '') +
      `\ntoolsUsed: ${JSON.stringify(toolsUsed)}` +
      `\nanswer: ${(body?.answer ?? '(none)').replace(/\s+/g, ' ').slice(0, 400)}`
  );
}

writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\nwrote ${outFile}`);

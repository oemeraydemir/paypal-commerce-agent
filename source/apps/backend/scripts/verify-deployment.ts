#!/usr/bin/env ts-node
/**
 * verify-deployment.ts — verify a deployed AI Café backend against the
 * "demo öncesi kontrol" checklist.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/verify-deployment.ts https://your-service.onrender.com
 *
 * Checks:
 *   1. /api/health reachable; reports ai.enabled + paypal.enabled
 *   2. /api/catalog returns products
 *   3. /dashboard.html loads (HTTP 200) with Agent Control Center markers
 *   4. /dashboard redirects to /dashboard.html
 *   5. /api/policy-events + /api/policy-events/stats reachable and shape-valid
 *   6. /api/webhooks/health reachable
 *   7. /api/webhooks/paypal rejects unsigned requests (401/400)
 *   8. storage is durable (PostgreSQL) — fails on volatile in-memory storage (FIX-05)
 *   9. Cart Mandate signing key is persistent — fails on an ephemeral/invalid key (FIX-05)
 *
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */

import { evaluateDurabilityGates } from '../src/deployment/health-gate';

const base = (process.argv[2] || '').replace(/\/$/, '');

if (!base) {
  console.error('Usage: npx ts-node --transpile-only scripts/verify-deployment.ts <base-url>');
  console.error('Example: npx ts-node --transpile-only scripts/verify-deployment.ts https://ai-cafe.onrender.com');
  process.exit(1);
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

async function get(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, { redirect: 'manual', ...init });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* html or empty */ }
  return { res, text, json };
}

async function run() {
  console.log(`\nVerifying deployment: ${base}\n${'='.repeat(60)}`);

  // 1. Health
  try {
    const { res, json } = await get('/api/health');
    const ok = res.status === 200 && json?.status === 'ok';
    record('health endpoint', ok, `status=${res.status} ai.enabled=${json?.ai?.enabled} paypal.enabled=${json?.paypal?.enabled}`);
    if (json && json.ai?.enabled === false) console.log('  ⚠  AI is DISABLED — OPENAI_API_KEY not set on the host.');
    if (json && json.paypal?.enabled === false) console.log('  ⚠  PayPal is DISABLED — PAYPAL_* not set on the host.');
  } catch (e: any) { record('health endpoint', false, `unreachable: ${e.message}`); }

  // 2. Catalog
  try {
    const { res, json } = await get('/api/catalog');
    const count = Array.isArray(json) ? json.length : json?.count;
    const ok = res.status === 200 && (count ?? 0) > 0;
    record('catalog endpoint', ok, `status=${res.status} products=${count}`);
  } catch (e: any) { record('catalog endpoint', false, `unreachable: ${e.message}`); }

  // 3. Dashboard HTML + its script. The behaviour markers (setInterval / policy-events /
  //    decision-BLOCK) live in dashboard.js, not in the HTML shell, so both are checked —
  //    otherwise a stale marker list fails a perfectly healthy deployment (FIX-05).
  try {
    const { res, text } = await get('/dashboard.html');
    const markers = ['Agent Control Center', 'ordersGrid', 'dashboard.js'];
    const missing = markers.filter((m) => !text.includes(m));
    const ok = res.status === 200 && missing.length === 0;
    record('dashboard.html loads', ok, `status=${res.status} missing=[${missing.join(', ')}]`);
  } catch (e: any) { record('dashboard.html loads', false, `unreachable: ${e.message}`); }

  try {
    const { res, text } = await get('/dashboard.js');
    const markers = ['setInterval', 'policy-events', 'VALID_DECISIONS', 'badge-block'];
    const missing = markers.filter((m) => !text.includes(m));
    const ok = res.status === 200 && missing.length === 0;
    record('dashboard.js serves the grid logic', ok, `status=${res.status} missing=[${missing.join(', ')}]`);
  } catch (e: any) { record('dashboard.js serves the grid logic', false, `unreachable: ${e.message}`); }

  // 4. Dashboard redirect
  try {
    const { res } = await get('/dashboard');
    const ok = res.status === 302 && res.headers.get('location') === '/dashboard.html';
    record('dashboard redirect', ok, `status=${res.status} location=${res.headers.get('location')}`);
  } catch (e: any) { record('dashboard redirect', false, `unreachable: ${e.message}`); }

  // 5. Policy events + stats
  try {
    const { res, json } = await get('/api/policy-events?limit=100');
    const ok = res.status === 200 && Array.isArray(json?.events) && typeof json?.total === 'number';
    record('policy-events endpoint', ok, `status=${res.status} total=${json?.total}`);
  } catch (e: any) { record('policy-events endpoint', false, `unreachable: ${e.message}`); }

  try {
    const { res, json } = await get('/api/policy-events/stats');
    const ok = res.status === 200 && typeof json?.spentMinor === 'number' && typeof json?.totalRequests === 'number';
    record('policy-events stats', ok, `status=${res.status} spent=${json?.spentFormatted} requests=${json?.totalRequests}`);
  } catch (e: any) { record('policy-events stats', false, `unreachable: ${e.message}`); }

  // 6. Webhook health
  try {
    const { res, json } = await get('/api/webhooks/health');
    const ok = res.status === 200 && typeof json?.webhookEnabled !== 'undefined';
    record('webhook health', ok, `status=${res.status} webhookEnabled=${json?.webhookEnabled}`);
  } catch (e: any) { record('webhook health', false, `unreachable: ${e.message}`); }

  // 7. Webhook rejects unsigned
  try {
    const { res } = await get('/api/webhooks/paypal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const ok = res.status === 401 || res.status === 400;
    record('webhook rejects unsigned', ok, `status=${res.status}`);
  } catch (e: any) { record('webhook rejects unsigned', false, `unreachable: ${e.message}`); }

  // 8. Durability gate (FIX-05): volatile storage or a non-persistent mandate key is a FAIL,
  //    even when every other endpoint answers. A memory-mode deployment silently loses
  //    orders, reservations and idempotency keys on restart.
  try {
    const { res, json } = await get('/api/health');
    for (const check of evaluateDurabilityGates(json)) {
      record(check.name, check.ok, `${check.detail} (health HTTP ${res.status})`);
    }
  } catch (e: any) {
    record('storage is durable (PostgreSQL)', false, `unreachable: ${e.message}`);
    record('Cart Mandate signing key is persistent', false, `unreachable: ${e.message}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`${'='.repeat(60)}`);
  console.log(`${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
  console.log('Deployment verified.');
  process.exit(0);
}

run();

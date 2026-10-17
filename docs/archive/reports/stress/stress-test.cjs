#!/usr/bin/env node
/*
 * AI Café — Backend Stress / Load Test Harness
 * --------------------------------------------------
 * Concurrent load generator that exercises the public + authenticated backend
 * endpoints WITHOUT any external AI/PayPal keys (those are disabled locally).
 * Verifies throughput, latency percentiles, error rates, graceful degradation
 * (AI chat returns 503 when no provider key) and that the server stays alive
 * and responsive after the run.
 *
 * Usage:
 *   node stress-test.cjs                                  # 30s, 40 conc, 20 sessions
 *   DURATION_MS=60000 CONCURRENCY=128 node stress-test.cjs
 */
'use strict';
const http = require('http');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DURATION_MS = Number(process.env.DURATION_MS || 30000);
const CONCURRENCY = Number(process.env.CONCURRENCY || 40);
const SESSION_COUNT = Number(process.env.SESSIONS || 20);
const OUT = process.env.OUT || 'reports/stress/stress-result.json';

function req(method, path, headers, body) {
  return new Promise((resolve) => {
    const u = new URL(BASE + path);
    const data = body ? Buffer.from(body) : null;
    const t0 = process.hrtime.bigint();
    const r = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        method,
        headers: Object.assign(
          { 'Content-Type': 'application/json', 'X-Stress': '1' },
          headers || {},
          data ? { 'Content-Length': data.length } : {}
        ),
        timeout: 10000,
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          const dt = Number(process.hrtime.bigint() - t0) / 1e6;
          // "ok" = the server handled it without a 5xx or connection failure.
          // Expected client responses (401 auth, 429 rate-limit, 302 redirect)
          // are NOT server errors and are reported in the per-endpoint breakdown.
          resolve({ ok: res.statusCode !== 0 && res.statusCode < 500, status: res.statusCode, ms: dt });
        });
      }
    );
    r.on('timeout', () => r.destroy(new Error('TIMEOUT')));
    r.on('error', (e) => {
      const dt = Number(process.hrtime.bigint() - t0) / 1e6;
      resolve({ ok: false, status: 0, ms: dt, error: e.code || e.message });
    });
    if (data) r.write(data);
    r.end();
  });
}

// ---- Endpoint plan (weights drive random selection) ----
// NOTE: dashboardRoutes is mounted at "/" so the dashboard API is "/dashboard".
const ENDPOINTS = [
  { name: 'GET /api/health', method: 'GET', path: '/api/health', auth: false, w: 15 },
  { name: 'GET /api/catalog', method: 'GET', path: '/api/catalog', auth: false, w: 15 },
  { name: 'GET /api/catalog/search', method: 'GET', path: '/api/catalog/search?q=coffee', auth: false, w: 10 },
  { name: 'GET /api/catalog/veg_breakfast', method: 'GET', path: '/api/catalog/veg_breakfast', auth: false, w: 10 },
  { name: 'GET /dashboard', method: 'GET', path: '/dashboard', auth: false, w: 8 },
  { name: 'GET /api/orders/stats', method: 'GET', path: '/api/orders/stats', auth: false, w: 7 },
  { name: 'GET /api/ops/status', method: 'GET', path: '/api/ops/status', auth: false, w: 5 },
  { name: 'GET /api/webhooks/health', method: 'GET', path: '/api/webhooks/health', auth: false, w: 5 },
  { name: 'POST /api/sessions', method: 'POST', path: '/api/sessions', auth: false, w: 5 },
  {
    name: 'POST /api/policy/preview',
    method: 'POST',
    path: '/api/policy/preview',
    auth: true,
    w: 12,
    body: () => JSON.stringify({ items: [{ productId: 'veg_breakfast', quantity: 1 }, { productId: 'coffee', quantity: 2 }] }),
  },
  {
    name: 'POST /api/ai/chat',
    method: 'POST',
    path: '/api/ai/chat',
    auth: true,
    w: 8,
    body: () => JSON.stringify({ message: 'a coffee under 5 euro' }),
  },
];

const TOTAL_W = ENDPOINTS.reduce((s, e) => s + e.w, 0);
function pick() {
  let r = Math.random() * TOTAL_W;
  for (const e of ENDPOINTS) {
    if ((r -= e.w) <= 0) return e;
  }
  return ENDPOINTS[0];
}

function pct(arr, p) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return Math.round(s[idx] * 100) / 100;
}

async function main() {
  console.log(`Stress test -> ${BASE}  duration=${DURATION_MS}ms  concurrency=${CONCURRENCY}  sessions=${SESSION_COUNT}`);

  // Pre-mint sessions (under SESSION_CREATE_PER_IP_PER_HOUR=30). Capture the
  // correct field name: IssuedSession.sessionToken (NOT "token").
  const tokens = [];
  for (let i = 0; i < SESSION_COUNT; i++) {
    const u = new URL(BASE + '/api/sessions');
    await new Promise((resolve) => {
      const pr = http.request(
        { hostname: u.hostname, port: u.port || 80, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Stress': '1' } },
        (res) => {
          let buf = '';
          res.on('data', (d) => (buf += d));
          res.on('end', () => {
            try {
              const j = JSON.parse(buf);
              if (j && j.sessionId && j.sessionToken) tokens.push({ id: j.sessionId, token: j.sessionToken });
            } catch {}
            resolve();
          });
        }
      );
      pr.on('error', () => resolve());
      pr.end();
    });
  }
  console.log(`Minted ${tokens.length} valid session token(s) for authenticated endpoints.`);

  const stats = {};
  for (const e of ENDPOINTS) stats[e.name] = { count: 0, errors: 0, statuses: {}, lat: [] };
  let total = 0, totalErr = 0, allLat = [];
  let active = 0;
  let running = true;
  const start = Date.now();

  function worker() {
    if (!running) return;
    while (running && active < CONCURRENCY) {
      active++;
      const e = pick();
      const headers = {};
      if (e.auth && tokens.length) {
        const s = tokens[(Math.random() * tokens.length) | 0];
        if (s && s.id && s.token) {
          headers['X-Session-Id'] = s.id;
          headers['Authorization'] = 'Bearer ' + s.token;
        }
      }
      const body = e.body ? e.body() : null;
      req(e.method, e.path, headers, body).then((res) => {
        active--;
        const st = stats[e.name];
        st.count++;
        st.statuses[res.status] = (st.statuses[res.status] || 0) + 1;
        st.lat.push(res.ms);
        allLat.push(res.ms);
        if (!res.ok) { st.errors++; totalErr++; }
        setImmediate(worker);
      });
    }
  }
  worker();

  // Stop spawning new requests once the duration elapses; let in-flight drain.
  const stopTimer = setTimeout(() => { running = false; }, DURATION_MS);
  const prog = setInterval(() => {
    const el = Date.now() - start;
    console.log(`  ... ${Math.min(100, Math.round((el / DURATION_MS) * 100))}%  requests=${allLat.length}  err=${totalErr}`);
  }, 5000);

  await new Promise((resolve) => {
    const iv = setInterval(() => {
      if (!running && active <= 0) { clearInterval(iv); resolve(); }
    }, 100);
    setTimeout(() => { clearInterval(iv); resolve(); }, DURATION_MS + 20000);
  });
  clearInterval(prog);
  clearTimeout(stopTimer);
  await new Promise((r) => setTimeout(r, 500));

  const before = await req('GET', '/api/health', {});
  await new Promise((r) => setTimeout(r, 1000));
  const after = await req('GET', '/api/health', {});

  const elapsedS = (Date.now() - start) / 1000;
  const totalReq = allLat.length;
  const rps = elapsedS > 0 ? totalReq / elapsedS : 0;

  const report = {
    meta: { base: BASE, durationMs: DURATION_MS, concurrency: CONCURRENCY, sessions: tokens.length, elapsedSec: Math.round(elapsedS) },
    summary: {
      totalRequests: totalReq,
      totalErrors: totalErr,
      errorRatePct: totalReq ? Math.round((totalErr / totalReq) * 10000) / 100 : 0,
      throughputRps: Math.round(rps * 100) / 100,
      latencyMs: {
        min: allLat.length ? Math.round(Math.min(...allLat) * 100) / 100 : 0,
        mean: allLat.length ? Math.round((allLat.reduce((a, b) => a + b, 0) / allLat.length) * 100) / 100 : 0,
        p50: pct(allLat, 50), p95: pct(allLat, 95), p99: pct(allLat, 99),
        max: allLat.length ? Math.round(Math.max(...allLat) * 100) / 100 : 0,
      },
      postRunHealth: { beforeStatus: before.status, afterStatus: after.status, alive: before.ok && after.ok },
    },
    perEndpoint: Object.entries(stats).map(([name, s]) => ({
      name, count: s.count, errors: s.errors, statuses: s.statuses,
      latencyMs: { p50: pct(s.lat, 50), p95: pct(s.lat, 95), p99: pct(s.lat, 99), max: s.lat.length ? Math.round(Math.max(...s.lat) * 100) / 100 : 0 },
    })),
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('\n================ STRESS TEST RESULT ================');
  console.log(`Total requests : ${report.summary.totalRequests}`);
  console.log(`Duration       : ${report.meta.elapsedSec}s`);
  console.log(`Throughput     : ${report.summary.throughputRps} req/s`);
  console.log(`Errors         : ${report.summary.totalErrors} (${report.summary.errorRatePct}%)`);
  console.log(`Latency ms     : p50=${report.summary.latencyMs.p50} p95=${report.summary.latencyMs.p95} p99=${report.summary.latencyMs.p99} max=${report.summary.latencyMs.max}`);
  console.log(`Server alive   : ${report.summary.postRunHealth.alive} (health before=${report.summary.postRunHealth.beforeStatus}, after=${report.summary.postRunHealth.afterStatus})`);
  console.log('\n--- Per-endpoint ---');
  for (const e of report.perEndpoint) {
    console.log(
      `${e.name.padEnd(32)} n=${String(e.count).padStart(6)} err=${String(e.errors).padStart(4)} ` +
      `p95=${String(e.latencyMs.p95).padStart(7)}ms p99=${String(e.latencyMs.p99).padStart(7)}ms ` +
      `statuses=${JSON.stringify(e.statuses)}`
    );
  }
  console.log('===================================================');
  console.log(`Written: ${OUT}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

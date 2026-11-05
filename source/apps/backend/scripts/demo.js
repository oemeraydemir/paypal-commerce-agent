#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * npm run demo — one-command local demo for judges and for recording the video.
 *
 * What it does (development only, never production):
 *  - DASHBOARD_PUBLIC=true unless your .env sets it, so the Agent Control Center / AG Grid dashboard
 *    loads without a key (it only serves the minimised, hashed view).
 *  - generates a throw-away OPS_COPILOT_KEY (printed below) unless your .env sets one, so the refund
 *    queue and dispute panels can be used right away.
 *  - picks the next free port if 3000 is taken by another project.
 *  - tells you plainly whether PayPal sandbox and an AI provider are configured, and how to add them.
 * Secrets are never printed except the throw-away demo key generated here.
 */
const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');

function readDotenv() {
  const file = path.join(root, '.env');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

function isPlaceholder(v) {
  return !v || /^<.*>$/.test(v);
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });
}

async function pickPort(start) {
  for (let p = start; p < start + 20; p += 1) {
    if (await portFree(p)) return p;
  }
  return start;
}

(async () => {
  const dot = readDotenv();
  const has = (k) => process.env[k] !== undefined || dot[k] !== undefined;
  const val = (k) => (process.env[k] !== undefined ? process.env[k] : dot[k]);
  const env = { ...process.env };

  env.NODE_ENV = 'development';
  if (!has('DASHBOARD_PUBLIC')) env.DASHBOARD_PUBLIC = 'true';

  let demoKey = null;
  const configuredKey = val('OPS_COPILOT_KEY');
  if (isPlaceholder(configuredKey) || String(configuredKey).length < 16) {
    demoKey = crypto.randomBytes(24).toString('base64url');
    env.OPS_COPILOT_KEY = demoKey;
  }

  const wanted = Number(val('PORT') || 3000);
  const port = await pickPort(Number.isFinite(wanted) ? wanted : 3000);
  env.PORT = String(port);
  if (!has('CORS_ORIGIN') || port !== wanted) env.CORS_ORIGIN = `http://localhost:${port}`;
  if (!has('PAYPAL_RETURN_URL') || port !== wanted) {
    env.PAYPAL_RETURN_URL = `http://localhost:${port}/api/checkout/return`;
    env.PAYPAL_CANCEL_URL = `http://localhost:${port}/api/checkout/cancel`;
  }

  const paypalOn = String(val('PAYPAL_ENABLED')).toLowerCase() === 'true'
    && !isPlaceholder(val('PAYPAL_CLIENT_ID')) && !isPlaceholder(val('PAYPAL_CLIENT_SECRET'));
  const aiKeys = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY']
    .filter((k) => !isPlaceholder(val(k)));

  const line = '─'.repeat(64);
  console.log(`\n${line}\n  AI Café — local demo\n${line}`);
  console.log(`  Storefront        http://localhost:${port}/`);
  console.log(`  Control Center    http://localhost:${port}/dashboard.html`);
  console.log(`  For cafés         http://localhost:${port}/merchant.html`);
  console.log(`  Health            http://localhost:${port}/api/health`);
  if (port !== wanted) console.log(`  (port ${wanted} was busy, using ${port})`);
  console.log(`${line}`);
  console.log(`  PayPal sandbox    ${paypalOn ? 'configured' : 'NOT configured: copy .env.example to .env, set PAYPAL_ENABLED=true + sandbox client id/secret'}`);
  console.log(`  AI provider       ${aiKeys.length ? aiKeys.map((k) => k.replace('_API_KEY', '').toLowerCase()).join(', ') : 'none: rule-based planner is used; add GEMINI_API_KEY or GROQ_API_KEY to .env for the real LLM'}`);
  console.log(`  Dashboard         ${env.DASHBOARD_PUBLIC === 'true' ? 'public demo view (no key needed)' : 'private: key required'}`);
  if (demoKey) console.log(`  Demo ops key      ${demoKey}   (throw-away, this run only)`);
  console.log(`${line}\n`);

  const child = spawn('npm', ['run', 'dev'], { cwd: root, env, stdio: 'inherit', shell: true });
  const stop = () => child.kill('SIGINT');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code === null ? 0 : code));
})();

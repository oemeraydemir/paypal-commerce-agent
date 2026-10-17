#!/usr/bin/env node
/*
 * Captures the real Chrome console for the dashboard, before and after the
 * v33 API fix.
 *
 * "Before" is produced without touching the working tree: the pre-change
 * dashboard.js is read out of git (HEAD) and served to the page through a
 * Playwright route override, so the only difference between the two runs is the
 * script content.
 *
 *   node evidence/scripts/dashboard-console.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const OUT = path.join(__dirname, '..', 'workbuddy-3');
const URL = process.env.DASHBOARD_URL || 'http://127.0.0.1:3000/dashboard.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HEAD_JS = path.join(OUT, 'dashboard-HEAD.js');
const DEV_GRID_JS = path.join(OUT, 'ag-grid-community-33.dev.js');
const DEV_GRID_URL = 'https://cdn.jsdelivr.net/npm/ag-grid-community@33.0.0/dist/ag-grid-community.js';

/** Pre-change dashboard.js, read straight out of git (never touches the tree). */
function ensureHeadScript() {
  if (fs.existsSync(HEAD_JS)) return HEAD_JS;
  const { execSync } = require('child_process');
  const repoRoot = path.resolve(__dirname, '..', '..');
  const src = execSync('git show HEAD:source/apps/backend/public/dashboard.js', {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(HEAD_JS, src);
  return HEAD_JS;
}

/** Unminified AG Grid build — the only one that still contains the validator. */
async function ensureDevGrid() {
  if (fs.existsSync(DEV_GRID_JS) && fs.statSync(DEV_GRID_JS).size > 1_000_000) return DEV_GRID_JS;
  const res = await fetch(DEV_GRID_URL);
  if (!res.ok) return null;
  const body = await res.text();
  if (body.length < 1_000_000) return null;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(DEV_GRID_JS, body);
  return DEV_GRID_JS;
}

const WARNINGS = [
  ['invalid colDef property', /invalid colDef property/i],
  ['getCellAria warning', /getCellAria/i],
  ['showLoadingOverlay deprecation', /`showLoadingOverlay` is deprecated/i],
];

const ORDER_FIXTURE = {
  orders: [
    {
      id: 'ord_aaaaaaaaaaaaaaaa',
      createdAt: '2026-10-17T09:00:00.000Z',
      origin: 'AI_AGENT',
      status: 'PAID',
      itemCount: 2,
      totalMinor: 1300,
      currency: 'EUR',
      items: [],
    },
  ],
  total: 1,
  returned: 1,
};

const EVENT_FIXTURE = {
  events: [
    {
      id: 'evt_1',
      timestamp: '2026-10-17T09:00:00.000Z',
      agent: 'AI_AGENT',
      cartId: 'cart_1111',
      orderId: 'ord_aaaaaaaaaaaaaaaa',
      decision: 'BLOCK',
      amountMinor: 2600,
      currency: 'EUR',
      reason: 'Cart exceeds maximum purchase limit',
      violatedRules: [{ type: 'MAX_PURCHASE_EXCEEDED', message: 'Too expensive' }],
    },
  ],
  total: 1,
};

async function capture(browser, { useHead }) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const messages = [];
  page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));

  // Rows are required: AG Grid defers colDef property validation until column
  // data-type inference has run, which needs actual row data.
  const json = (body) => async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(body),
    });
  await page.route('**/api/orders/stats', json({ total: 1, aiAssisted: 1, aiAssistedPercentage: 100, revenueMinor: 1300 }));
  await page.route('**/api/policy-events/stats', json({ total: 1, blocked: 1 }));
  await page.route('**/api/orders', json(ORDER_FIXTURE));
  await page.route('**/api/policy-events**', json(EVENT_FIXTURE));

  if (useHead) {
    const headSource = fs.readFileSync(ensureHeadScript(), 'utf8');
    await page.route('**/dashboard.js', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: headSource })
    );
  }

  // The minified CDN build has the colDef property validator compiled out, so
  // "invalid colDef property" can never be logged by it. Serve the unminified
  // dev build of the SAME version instead, which does contain the validator.
  const devGridPath = await ensureDevGrid();
  if (devGridPath) {
    const devGrid = fs.readFileSync(devGridPath, 'utf8');
    await page.route('**/ag-grid-community@33.0.0/dist/ag-grid-community.min.js', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: devGrid })
    );
  }

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#ordersGrid .ag-root', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#ordersGrid .ag-cell').length > 0, {
    timeout: 45000,
  });
  await page.waitForTimeout(1500);

  const found = {};
  const joined = messages.join('\n');
  for (const [label, re] of WARNINGS) {
    found[label] = re.test(joined);
  }

  await page.close();
  return { messages, found };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  const before = await capture(browser, { useHead: true });
  fs.writeFileSync(path.join(OUT, 'console-before.txt'), before.messages.join('\n'));
  fs.writeFileSync(path.join(OUT, 'console-before.json'), JSON.stringify(before.found, null, 2));

  const after = await capture(browser, { useHead: false });
  fs.writeFileSync(path.join(OUT, 'console-after.txt'), after.messages.join('\n'));
  fs.writeFileSync(path.join(OUT, 'console-after.json'), JSON.stringify(after.found, null, 2));

  console.log(
    JSON.stringify(
      {
        chrome: await browser.version(),
        url: URL,
        before: before.found,
        after: after.found,
        beforeMessageCount: before.messages.length,
        afterMessageCount: after.messages.length,
      },
      null,
      2
    )
  );

  await browser.close();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});

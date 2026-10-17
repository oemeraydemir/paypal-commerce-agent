#!/usr/bin/env node
/*
 * Captures the real Chrome console for the dashboard, before and after the
 * v33 API fix.
 *
 * "Before" is produced without touching the working tree: the pre-change
 * dashboard.js is read out of git and served to the page through a Playwright
 * route override, so the only difference between the two runs is the script
 * content.
 *
 * BEFORE_REF picks the revision used as the "before" baseline. It defaults to
 * HEAD, which only reproduces the bug on a tree where the fix is still
 * uncommitted. Once the fix is committed, HEAD is already correct and the
 * "before" run proves nothing — the script detects that and says so loudly.
 *
 *   node evidence/scripts/dashboard-console.cjs
 *   BEFORE_REF=c1c59a7 node evidence/scripts/dashboard-console.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const OUT = path.join(__dirname, '..', 'workbuddy-3');
const URL = process.env.DASHBOARD_URL || 'http://127.0.0.1:3000/dashboard.html';
const BEFORE_REF = process.env.BEFORE_REF || 'HEAD';

// CHROME_PATH overrides the platform default, so this runs on macOS/Linux too.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});
if (!CHROME) {
  console.error(`No Chrome binary found. Set CHROME_PATH. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  process.exit(2);
}
const BEFORE_JS = path.join(OUT, 'dashboard-before.js');
const DEV_GRID_JS = path.join(OUT, 'ag-grid-community-33.dev.js');
const DEV_GRID_URL = 'https://cdn.jsdelivr.net/npm/ag-grid-community@33.0.0/dist/ag-grid-community.js';

/** dashboard.js as of BEFORE_REF, read straight out of git (never touches the tree). */
function ensureBeforeScript() {
  const { execSync } = require('child_process');
  const repoRoot = path.resolve(__dirname, '..', '..');
  const src = execSync(`git show ${BEFORE_REF}:source/apps/backend/public/dashboard.js`, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(BEFORE_JS, src);
  return BEFORE_JS;
}

/** True when the baseline still passes the properties this task removed. */
function baselineIsBuggy() {
  const src = fs.readFileSync(BEFORE_JS, 'utf8');
  return /getCellAria\s*:/.test(src) || /\.showLoadingOverlay\s*\(/.test(src);
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

async function capture(browser, { useBefore }) {
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

  if (useBefore) {
    const beforeSource = fs.readFileSync(BEFORE_JS, 'utf8');
    await page.route('**/dashboard.js', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: beforeSource })
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
  ensureBeforeScript();
  const buggyBaseline = baselineIsBuggy();
  if (!buggyBaseline) {
    console.error(
      `WARNING: ${BEFORE_REF} already contains the fix (no "getCellAria:" property, no ` +
        `.showLoadingOverlay( call), so the "before" run is NOT a reproduction of the bug.\n` +
        `         Pick the last buggy revision explicitly, e.g. BEFORE_REF=<sha>.`
    );
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  const before = await capture(browser, { useBefore: true });
  fs.writeFileSync(path.join(OUT, 'console-before.txt'), before.messages.join('\n'));
  fs.writeFileSync(path.join(OUT, 'console-before.json'), JSON.stringify(before.found, null, 2));

  const after = await capture(browser, { useBefore: false });
  fs.writeFileSync(path.join(OUT, 'console-after.txt'), after.messages.join('\n'));
  fs.writeFileSync(path.join(OUT, 'console-after.json'), JSON.stringify(after.found, null, 2));

  console.log(
    JSON.stringify(
      {
        chrome: await browser.version(),
        url: URL,
        beforeRef: BEFORE_REF,
        beforeBaselineContainsInvalidProperty: buggyBaseline,
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
  process.exitCode = buggyBaseline ? 0 : 3;
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});

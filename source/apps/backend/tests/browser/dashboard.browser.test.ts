/// <reference lib="dom" />
/**
 * Real-browser accessibility test for the dashboard grid.
 *
 * Why this exists: the unit/integration suites can only assert on the strings in
 * dashboard.js and on a hand-written DOM shim. They cannot tell whether AG Grid
 * accepts the colDef properties we pass or whether the aria-labels end up in the
 * real DOM. This test drives a real Chrome against the real dashboard, with the
 * four data endpoints intercepted so the grid actually renders rows.
 *
 * Excluded from `npm test` (see jest.config.js) because it needs a Chrome binary
 * and network access to the AG Grid CDN — the same reason `tests/smoke` is
 * excluded. Run it with:  npm run test:browser
 */
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';

import { createApp } from '../../src/app';

/* eslint-disable @typescript-eslint/no-var-requires */
let chromium: any = null;
try {
  // Installed as evidence tooling (`npm install --no-save playwright-core`), so
  // it is intentionally absent from package.json dependencies.
  chromium = require('playwright-core').chromium;
} catch {
  chromium = null;
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];

const fs = require('fs');
const os = require('os');
const path = require('path');
const chromePath = CHROME_CANDIDATES.find((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});

const unavailable = !chromium ? 'playwright-core is not installed' : !chromePath ? 'no Chrome binary found' : null;

if (unavailable) {
  // eslint-disable-next-line no-console
  console.warn(
    `[browser] SKIPPED (not a pass): ${unavailable}. ` +
      'Install with `npm install --no-save playwright-core` and provide a Chrome binary to run these 5 tests.'
  );
}

/**
 * The minified CDN bundle the dashboard loads has the colDef property validator
 * compiled out, so it can never log "invalid colDef property". The unminified
 * build of the same version can, which is what makes the regression assertion
 * meaningful. Cached in the OS temp dir so repeat runs do not re-download 3 MB.
 */
const DEV_GRID_URL = 'https://cdn.jsdelivr.net/npm/ag-grid-community@33.0.0/dist/ag-grid-community.js';
const DEV_GRID_CACHE = path.join(os.tmpdir(), 'ag-grid-community-33.0.0.dev.js');

async function ensureDevGridBundle(): Promise<string | null> {
  try {
    if (fs.existsSync(DEV_GRID_CACHE) && fs.statSync(DEV_GRID_CACHE).size > 1_000_000) {
      return DEV_GRID_CACHE;
    }
    const res = await fetch(DEV_GRID_URL);
    if (!res.ok) return null;
    const body = await res.text();
    if (body.length < 1_000_000) return null;
    fs.writeFileSync(DEV_GRID_CACHE, body);
    return DEV_GRID_CACHE;
  } catch {
    return null;
  }
}

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
    {
      id: 'ord_bbbbbbbbbbbbbbbb',
      createdAt: '2026-10-17T09:05:00.000Z',
      origin: 'HUMAN',
      status: 'PENDING',
      itemCount: 1,
      totalMinor: 300,
      currency: 'EUR',
      items: [],
    },
    {
      // FIX-04 (PP18): the storefront chat assistant prepared this cart for a
      // human shopper. It must render as its own origin, distinct from an
      // external MCP agent and from a purely human cart.
      id: 'ord_cccccccccccccccc',
      createdAt: '2026-10-17T09:10:00.000Z',
      origin: 'AI_ASSISTED',
      status: 'PAID',
      itemCount: 1,
      totalMinor: 300,
      currency: 'EUR',
      items: [],
    },
  ],
  total: 3,
  returned: 3,
};

const EVENT_FIXTURE = {
  events: [
    {
      id: 'evt_1',
      timestamp: '2026-10-17T09:00:00.000Z',
      sessionId: 'sess_1',
      cartId: 'cart_1111',
      orderId: 'ord_aaaaaaaaaaaaaaaa',
      agent: 'AI_AGENT',
      amountMinor: 1300,
      amountFormatted: '€13.00',
      currency: 'EUR',
      decision: 'REQUIRE_CONFIRMATION',
      violatedRules: [{ type: 'CONFIRMATION_THRESHOLD_EXCEEDED', message: 'Over threshold' }],
      reason: 'Cart exceeds confirmation threshold',
    },
    {
      id: 'evt_2',
      timestamp: '2026-10-17T09:02:00.000Z',
      sessionId: 'sess_1',
      cartId: 'cart_2222',
      orderId: null,
      agent: 'HUMAN',
      amountMinor: 2600,
      amountFormatted: '€26.00',
      currency: 'EUR',
      decision: 'BLOCK',
      violatedRules: [{ type: 'MAX_PURCHASE_EXCEEDED', message: 'Too expensive' }],
      reason: 'Cart exceeds maximum purchase limit',
    },
  ],
  total: 2,
};

describe('dashboard grid in a real Chrome', () => {
  jest.setTimeout(180000);

  let server: Server;
  let baseUrl: string;
  let browser: any;

  beforeAll(async () => {
    if (unavailable) return;
    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** Opens the dashboard with the data endpoints stubbed by the given fixtures. */
  async function openDashboard(fixtures: {
    orders: unknown;
    events: unknown;
    delayMs?: number;
    devGridPath?: string | null;
  }) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const consoleMessages: string[] = [];
    page.on('console', (m: any) => consoleMessages.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e: any) => consoleMessages.push(`pageerror: ${e.message}`));

    // Serve the unminified AG Grid build (same version) so the colDef property
    // validator is present and can actually warn about an invalid property.
    if (fixtures.devGridPath) {
      const devGrid = fs.readFileSync(fixtures.devGridPath, 'utf8');
      await page.route('**/ag-grid-community@33.0.0/dist/ag-grid-community.min.js', (route: any) =>
        route.fulfill({ status: 200, contentType: 'application/javascript', body: devGrid })
      );
    }

    const delay = fixtures.delayMs || 0;
    const fulfill = (json: unknown) => async (route: any) => {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(json),
      });
    };

    await page.route('**/api/orders/stats', fulfill({ total: 3, aiAssisted: 2, aiAssistedPercentage: 67, revenueMinor: 1600 }));
    await page.route('**/api/policy-events/stats', fulfill({ total: 2, blocked: 1 }));
    await page.route('**/api/orders', fulfill(fixtures.orders));
    await page.route('**/api/policy-events**', fulfill(fixtures.events));

    await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return { page, consoleMessages };
  }

  const skip = unavailable ? test.skip : test;

  skip(`loads AG Grid from the CDN without an invalid colDef property (${unavailable || 'chrome ready'})`, async () => {
    const { page, consoleMessages } = await openDashboard({ orders: ORDER_FIXTURE, events: EVENT_FIXTURE });

    await page.waitForSelector('#ordersGrid .ag-root', { timeout: 45000 });
    // AG Grid creates the grid asynchronously; wait until it is really up.
    const gridReady = await page
      .waitForFunction(() => !!document.querySelector('#ordersGrid .ag-cell'), { timeout: 45000 })
      .then(() => true)
      .catch(() => false);

    if (!gridReady) {
      // Most likely the CDN is unreachable in this environment.
      throw new Error(
        `AG Grid did not render cells; console said: ${consoleMessages.slice(0, 5).join(' | ') || '(nothing)'}`
      );
    }

    // The two warnings this task is about must be gone.
    expect(consoleMessages.join('\n')).not.toMatch(/invalid colDef property/i);
    expect(consoleMessages.join('\n')).not.toMatch(/getCellAria/);
    expect(consoleMessages.join('\n')).not.toMatch(/`showLoadingOverlay` is deprecated/);

    await page.close();
  });

  skip('renders the descriptive aria-label on the real grid cells', async () => {
    const { page } = await openDashboard({ orders: ORDER_FIXTURE, events: EVENT_FIXTURE });
    await page.waitForFunction(() => document.querySelectorAll('#ordersGrid .ag-cell').length > 0, {
      timeout: 45000,
    });

    const labels = await page.evaluate(() => {
      const pick = (root: string, colId: string) =>
        Array.from(document.querySelectorAll(`${root} [col-id="${colId}"]`))
          .map((el) => el.getAttribute('aria-label'))
          .filter(Boolean);
      return {
        origin: pick('#ordersGrid', 'origin'),
        status: pick('#ordersGrid', 'status'),
        agent: pick('#eventsGrid', 'agent'),
        decision: pick('#eventsGrid', 'decision'),
      };
    });

    // FIX-04 (PP18): all three origins must be labelled distinctly — an external
    // MCP agent, the storefront chat assistant and a purely human cart.
    expect(labels.origin).toEqual(
      expect.arrayContaining(['Origin: AI agent', 'Origin: AI assisted', 'Origin: Human'])
    );
    expect(labels.status).toEqual(expect.arrayContaining(['Status: PAID', 'Status: PENDING']));
    expect(labels.agent).toEqual(expect.arrayContaining(['Origin: AI agent', 'Origin: Human']));
    expect(labels.decision).toEqual(
      expect.arrayContaining(['Decision: Require confirmation', 'Decision: Blocked'])
    );

    // Sorting rebuilds the cell DOM. If any AG Grid code owned the aria-label it
    // would be wiped here — re-asserting proves the renderer is the only writer.
    await page.click('#ordersGrid .ag-header-cell[col-id="status"] .ag-header-cell-label');
    await page.waitForTimeout(800);
    const afterSort = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#ordersGrid [col-id="status"]'))
        .map((el) => el.getAttribute('aria-label'))
        .filter(Boolean)
        .sort()
    );
    expect(afterSort).toEqual(['Status: PAID', 'Status: PAID', 'Status: PENDING']);

    await page.close();
  });

  skip('shows the loading overlay, then hides it when rows arrive', async () => {
    const { page } = await openDashboard({ orders: ORDER_FIXTURE, events: EVENT_FIXTURE, delayMs: 2500 });

    // While the first request is still in flight the `loading: true` option must
    // have produced the loading overlay.
    await page.waitForSelector('#ordersGrid .ag-overlay-loading-wrapper', { timeout: 30000 });

    await page.waitForFunction(() => document.querySelectorAll('#ordersGrid .ag-cell').length > 0, {
      timeout: 45000,
    });

    const loadingVisible = await page.evaluate(() => {
      const el = document.querySelector('#ordersGrid .ag-overlay-loading-wrapper');
      return !!el && (el as HTMLElement).offsetParent !== null;
    });
    expect(loadingVisible).toBe(false);

    await page.close();
  });

  skip('shows AG Grid\'s no-rows overlay on its own when the data is empty', async () => {
    const { page } = await openDashboard({
      orders: { orders: [], total: 0, returned: 0 },
      events: { events: [], total: 0 },
    });

    await page.waitForSelector('#ordersGrid .ag-overlay-no-rows-wrapper', { timeout: 45000 });
    const text = await page.evaluate(
      () => document.querySelector('#ordersGrid .ag-overlay-no-rows-wrapper')?.textContent || ''
    );
    expect(text).toMatch(/no data/i);

    await page.close();
  });

  skip('logs no invalid-colDef or deprecated-overlay warning under the unminified AG Grid build', async () => {
    const devGridPath = await ensureDevGridBundle();
    if (!devGridPath) {
      // FAIL, do not skip. This assertion is the only thing that can prove the
      // colDef validator accepted our definitions, and the production bundle
      // cannot log the warning at all. Reporting "green" here without having
      // run the check is exactly the failure mode this suite exists to prevent.
      throw new Error(
        `Cannot verify: the unminified AG Grid 33 build could not be fetched from ${DEV_GRID_URL} ` +
          `(cache: ${DEV_GRID_CACHE}). This test cannot pass without it. ` +
          `Pre-populate the cache or provide network access.`
      );
    }

    const { page, consoleMessages } = await openDashboard({
      orders: ORDER_FIXTURE,
      events: EVENT_FIXTURE,
      devGridPath,
    });

    // Rows are required: AG Grid defers colDef validation until data-type
    // inference has run, which needs actual row data.
    await page.waitForFunction(() => document.querySelectorAll('#ordersGrid .ag-cell').length > 0, {
      timeout: 45000,
    });
    await page.waitForTimeout(1500);

    const joined = consoleMessages.join('\n');
    expect(joined).not.toMatch(/invalid colDef property/i);
    expect(joined).not.toMatch(/`showLoadingOverlay` is deprecated/i);

    // Positive control: prove this page's AG Grid build really does emit the
    // warning when a colDef carries an unsupported property, so the assertion
    // above cannot pass just because the validator is absent.
    const control = await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'controlGrid';
      host.style.width = '400px';
      host.style.height = '200px';
      document.body.appendChild(host);
      const anyWin = window as any;
      anyWin.__controlGrid = anyWin.agGrid.createGrid(host, {
        columnDefs: [{ field: 'x', getCellAria: () => ({}) }],
        rowData: [{ x: 1 }],
      });
      return true;
    });
    expect(control).toBe(true);
    await page.waitForTimeout(1500);
    expect(consoleMessages.join('\n')).toMatch(/invalid colDef property 'getCellAria'/);

    await page.close();
  });
});

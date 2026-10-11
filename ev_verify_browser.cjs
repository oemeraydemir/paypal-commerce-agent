/**
 * Real-browser verification of the Recovery-06 CSP fix.
 *
 * Proves (with a real Chrome engine, not jsdom):
 *  1. /dashboard redirects to /dashboard.html and the page loads.
 *  2. AG Grid (CDN script) loads and ACTUALLY RENDERS rows (not just "the file loaded").
 *  3. /api/policy-events polling runs on a ~5s interval.
 *  4. No CSP violation is reported to the console / securitypolicyviolation event.
 *  5. /dashboard.js is served 200 with JS content-type.
 *  6. The checkout return + cancel inline redirect scripts are NOT blocked by CSP
 *     (proven by the 1.2s setTimeout actually firing and revealing the fallback link).
 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:3000';
const PROXY = process.env.HTTP_PROXY || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function line(s) { console.log(s); }

(async () => {
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
  if (PROXY) {
    args.push(`--proxy-server=${PROXY}`);
    args.push('--proxy-bypass-list=localhost;127.0.0.1;<-loopback>');
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args,
    defaultViewport: { width: 1440, height: 1000 },
  });

  const results = {};

  // ---------------------------------------------------------------- dashboard
  const page = await browser.newPage();
  const consoleMsgs = [];
  const pageErrors = [];
  const cspEvents = [];
  const netRequests = [];

  page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('request', (r) => netRequests.push({ url: r.url(), t: Date.now() }));
  page.on('requestfailed', (r) =>
    netRequests.push({ url: r.url(), t: Date.now(), failed: r.failure()?.errorText })
  );

  // Record securitypolicyviolation at the earliest possible moment.
  await page.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push({
        directive: e.violatedDirective,
        blockedURI: e.blockedURI,
        source: e.sourceFile,
        line: e.lineNumber,
      });
    });
  });

  const navResp = await page.goto(`${BASE}/dashboard`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  const chain = navResp.request().redirectChain().map((r) => `${r.response()?.status()} ${r.url()}`);
  results.navStatus = navResp.status();
  results.navUrl = page.url();
  results.redirectChain = chain;

  const cspHeader = navResp.headers()['content-security-policy'] || '';
  results.cspHeader = cspHeader;

  // /dashboard.js response
  const jsResp = await page.waitForResponse(
    (r) => r.url().endsWith('/dashboard.js'),
    { timeout: 20000 }
  ).catch(() => null);
  results.dashboardJsStatus = jsResp ? jsResp.status() : null;
  results.dashboardJsType = jsResp ? jsResp.headers()['content-type'] : null;

  // AG Grid CDN script
  const cdnResp = await page
    .waitForResponse((r) => r.url().includes('ag-grid-community.min.js'), { timeout: 30000 })
    .catch(() => null);
  results.agGridCdnStatus = cdnResp ? cdnResp.status() : null;

  // Wait for the grid to actually render rows.
  await page
    .waitForFunction(() => document.querySelectorAll('.ag-row').length > 0, { timeout: 20000 })
    .catch(() => {});
  await sleep(1500);

  const dom = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      hasAgRoot: !!q('.ag-root'),
      hasAgHeader: !!q('.ag-header'),
      hasAgHeaderCell: document.querySelectorAll('.ag-header-cell').length,
      hasAgCenterColsContainer: !!q('.ag-center-cols-container'),
      agRowCount: document.querySelectorAll('.ag-row').length,
      firstRowText: (q('.ag-center-cols-container .ag-row')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      decisionBadges: Array.from(document.querySelectorAll('.badge')).map((b) => b.textContent.trim()),
      totalRequests: document.getElementById('totalRequestsValue')?.textContent,
      allowed: document.getElementById('allowedValue')?.textContent,
      blocked: document.getElementById('blockedValue')?.textContent,
      spent: document.getElementById('spentValue')?.textContent,
      lastUpdated: document.getElementById('lastUpdatedText')?.textContent,
      windowCsp: window.__csp,
    };
  });
  Object.assign(results, dom);

  // ---- polling interval: watch /api/policy-events for ~13s
  const pollStart = Date.now();
  await sleep(13000);
  const pollTs = netRequests
    .filter((r) => r.url.includes('/api/policy-events') && !r.failed)
    .map((r) => r.t)
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < pollTs.length; i++) gaps.push(pollTs[i] - pollTs[i - 1]);
  results.policyEventsPollCount = pollTs.length;
  results.policyEventsPollGapsMs = gaps;
  results.pollWindowMs = Date.now() - pollStart;

  results.consoleErrors = consoleMsgs.filter((m) => m.type === 'error').map((m) => m.text);
  results.consoleAll = consoleMsgs.map((m) => `${m.type}: ${m.text}`);
  results.pageErrors = pageErrors;
  results.cspFromEvent = cspEvents;
  results.cspViolationConsole = consoleMsgs
    .filter((m) => /content security policy|refused to|violates the following/i.test(m.text))
    .map((m) => m.text);
  results.windowCsp = dom.windowCsp;

  await page.close();

  // ------------------------------------------------------- checkout return/cancel
  async function checkCheckout(kind) {
    const p = await browser.newPage();
    const msgs = [];
    const errs = [];
    p.on('console', (m) => msgs.push({ type: m.type(), text: m.text() }));
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.evaluateOnNewDocument(() => {
      window.__csp = [];
      window.__redirectAttempted = null;
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__csp.push({ directive: e.violatedDirective, blockedURI: e.blockedURI });
      });
      // Neutralise the app-scheme navigation so the DOM stays inspectable, but
      // RECORD it: if the inline script runs, __redirectAttempted gets set.
      try {
        Location.prototype.replace = function (u) { window.__redirectAttempted = String(u); };
        Location.prototype.assign = function (u) { window.__redirectAttempted = String(u); };
      } catch (e) { /* ignore */ }
    });
    const resp = await p.goto(`${BASE}/api/checkout/${kind}?token=SMOKE_TOKEN_123`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    const header = resp ? resp.headers()['content-security-policy'] || '' : '';
    const html = resp ? await resp.text() : '';
    // The inline script does: window.location.replace(custom-scheme) + a 1200ms
    // setTimeout that reveals #fallback-message. If CSP blocked the inline script,
    // neither the redirect attempt nor the setTimeout would run.
    await sleep(2200);
    const st = await p.evaluate(() => {
      const el = document.getElementById('fallback-message');
      return {
        fallbackHidden: el ? el.hidden : null,
        fallbackVisible: el ? !el.hidden : null,
        redirectAttempted: window.__redirectAttempted,
        url: window.location.href,
        csp: window.__csp,
      };
    });
    // Extract the nonce from the inline script tag and the header.
    const nonceMatch = /<script\s+nonce="([^"]+)"/.exec(html);
    const headerNonce = /'nonce-([^']+)'/.exec(header);
    await p.close();
    return {
      status: resp ? resp.status() : null,
      cspHeader: header,
      inlineScriptNonce: nonceMatch ? nonceMatch[1] : null,
      headerNonce: headerNonce ? headerNonce[1] : null,
      nonceMatchesHeader: !!nonceMatch && !!headerNonce && nonceMatch[1] === headerNonce[1],
      redirectAttempted: st.redirectAttempted,
      inlineScriptRan: st.fallbackVisible === true && !!st.redirectAttempted,
      fallbackHidden: st.fallbackHidden,
      cspViolations: st.csp,
      consoleErrors: msgs.filter((m) => m.type === 'error').map((m) => m.text),
      pageErrors: errs,
    };
  }

  results.checkoutReturn = await checkCheckout('return');
  results.checkoutCancel = await checkCheckout('cancel');

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

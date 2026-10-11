/**
 * Recovery-06 CSP fix — real-browser (headless Chrome) verification, v2.
 * Robust network capture + checkout redirect proof.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:3000';
const PROXY = process.env.HTTP_PROXY || '';
const OUT = process.env.OUT || 'C:/Projects/FinCan/paypal-commerce-agent/ev2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
  if (PROXY) { args.push(`--proxy-server=${PROXY}`); args.push('--proxy-bypass-list=localhost;127.0.0.1;<-loopback>'); }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args, defaultViewport: { width: 1440, height: 1000 } });
  const results = { base: BASE, chrome: await browser.version() };

  // ------------------------------------------------------------ dashboard
  const page = await browser.newPage();
  const consoleMsgs = [], pageErrors = [], responses = [], pollTs = [];
  page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('response', (r) => {
    const u = r.url();
    if (u.endsWith('/dashboard.js') || u.includes('ag-grid-community') || u.includes('/api/policy-events')) {
      responses.push({ url: u, status: r.status(), type: r.headers()['content-type'] });
      if (u.includes('/api/policy-events?')) pollTs.push(Date.now());
    }
  });
  page.on('requestfailed', (r) => responses.push({ url: r.url(), failed: r.failure()?.errorText }));

  await page.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ directive: e.violatedDirective, blockedURI: e.blockedURI, source: e.sourceFile, line: e.lineNumber }));
  });

  const navResp = await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  results.navStatus = navResp.status();
  results.navUrl = page.url();
  results.redirectChain = navResp.request().redirectChain().map((r) => `${r.response()?.status()} ${r.url()}`);
  results.cspHeader = navResp.headers()['content-security-policy'] || '';

  const gridRendered = await page.waitForFunction(() => document.querySelectorAll('.ag-row').length > 0, { timeout: 25000 }).then(() => true).catch(() => false);
  await sleep(1500);
  results.gridRendered = gridRendered;
  results.dom = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      hasAgRoot: !!q('.ag-root'), hasAgHeader: !!q('.ag-header'),
      agHeaderCells: document.querySelectorAll('.ag-header-cell').length,
      hasCenterCols: !!q('.ag-center-cols-container'),
      agRowCount: document.querySelectorAll('.ag-row').length,
      firstRowText: (q('.ag-center-cols-container .ag-row')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      badgeCount: document.querySelectorAll('.badge').length,
      totalRequests: q('#totalRequestsValue')?.textContent, allowed: q('#allowedValue')?.textContent,
      blocked: q('#blockedValue')?.textContent, spent: q('#spentValue')?.textContent,
      lastUpdated: q('#lastUpdatedText')?.textContent, windowCsp: window.__csp,
    };
  });
  try { await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true }); } catch (e) { results.dashboardShotErr = String(e.message || e); }

  await sleep(14000);
  const sorted = pollTs.slice().sort((a, b) => a - b);
  const gaps = []; for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  results.polling = { count: sorted.length, gapsMs: gaps, avgGapMs: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null };
  results.network = {
    dashboardJs: responses.filter((r) => r.url.endsWith('/dashboard.js')),
    agGrid: responses.filter((r) => r.url.includes('ag-grid-community')),
    policyEvents: responses.filter((r) => r.url.includes('/api/policy-events')),
    failed: responses.filter((r) => r.failed),
  };
  results.consoleErrors = consoleMsgs.filter((m) => m.type === 'error').map((m) => m.text);
  results.cspViolationConsole = consoleMsgs.filter((m) => /content security policy|refused to (execute|load)|violates the following/i.test(m.text)).map((m) => m.text);
  results.pageErrors = pageErrors;
  await page.close();

  // ---------------------------------------------------- checkout return/cancel
  async function checkCheckout(kind) {
    // 1) Fetch raw HTML + header outside the browser (reliable nonce check).
    const res = await fetch(`${BASE}/api/checkout/${kind}?token=SMOKE_TOKEN_123`);
    const html = await res.text();
    const header = res.headers.get('content-security-policy') || '';
    const tagNonce = (/<script\s+nonce="([^"]+)"/.exec(html) || [])[1] || null;
    const headNonce = (/'nonce-([^']+)'/.exec(header) || [])[1] || null;

    // 2) Load in the browser and watch for the app-scheme redirect attempt.
    const p = await browser.newPage();
    const msgs = [], errs = [];
    p.on('console', (m) => msgs.push({ type: m.type(), text: m.text() }));
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.evaluateOnNewDocument(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ directive: e.violatedDirective, blockedURI: e.blockedURI }));
    });
    let navErr = null;
    try {
      await p.goto(`${BASE}/api/checkout/${kind}?token=SMOKE_TOKEN_123`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) { navErr = String(e.message || e); }
    await sleep(1800);
    const st = await p.evaluate(() => ({ csp: window.__csp, url: window.location.href, bodyText: (document.body?.innerText || '').slice(0, 160) }));
    try { await p.screenshot({ path: `${OUT}/checkout_${kind}.png`, fullPage: true }); } catch (e) { /* non-fatal */ }
    await p.close();

    const schemeMsgs = msgs.filter((m) => /paypalcommerceagent:\/\//.test(m.text));
    return {
      httpStatus: res.status,
      inlineScriptNoncePresent: !!tagNonce,
      headerNoncePresent: !!headNonce,
      nonceMatchesHeader: !!tagNonce && !!headNonce && tagNonce === headNonce,
      inlineScriptExecuted: schemeMsgs.length > 0,      // Chrome tried to open the app scheme => the inline script ran
      schemeRedirectAttempt: schemeMsgs.map((m) => m.text),
      cspViolations: st.csp,
      cspBlockedInlineConsole: msgs.filter((m) => /refused to execute inline|content security policy/i.test(m.text)).map((m) => m.text),
      consoleErrors: msgs.filter((m) => m.type === 'error').map((m) => m.text),
      pageErrors: errs, navErr,
    };
  }

  results.checkoutReturn = await checkCheckout('return');
  results.checkoutCancel = await checkCheckout('cancel');

  await browser.close();
  fs.writeFileSync(`${OUT}/ev2_browser_result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

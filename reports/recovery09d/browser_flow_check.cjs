/**
 * Recovery 10A — real-browser (headless Chrome) storefront flow verification.
 * Uses puppeteer-core from the managed node workspace; drives the local server.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.OUT || 'C:/Projects/FinCan/recovery09d';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const results = { base: BASE, steps: {} };
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    defaultViewport: { width: 1440, height: 1000 },
  });
  results.chrome = await browser.version();

  function wire(page) {
    const c = { console: [], errors: [], failed: [], navigations: [], responses: [], captureAttempts: [] };
    page.on('console', (m) => c.console.push({ type: m.type(), text: m.text() }));
    page.on('pageerror', (e) => c.errors.push(String(e)));
    page.on('requestfailed', (r) => c.failed.push({ url: r.url(), err: r.failure()?.errorText }));
    page.on('request', (r) => {
      const u = r.url();
      if (/\/api\/orders\/[^/]+\/capture/.test(u)) c.captureAttempts.push({ url: u, method: r.method() });
    });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) c.navigations.push(f.url()); });
    page.on('response', (r) => {
      const u = r.url();
      if (u.endsWith('/app.js') || u.includes('/api/catalog') || u.includes('/api/health')) {
        c.responses.push({ url: u, status: r.status(), type: r.headers()['content-type'] });
      }
    });
    page.evaluateOnNewDocument(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        window.__csp.push({ directive: e.violatedDirective, blockedURI: e.blockedURI }));
    });
    return c;
  }

  // ---- Step 1: storefront loads, app.js executes, catalog renders -------------
  {
    const p = await browser.newPage();
    const c = wire(p);
    const nav = await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    results.steps.storefront = { httpStatus: nav.status(), csp: nav.headers()['content-security-policy'] || '' };
    const cardsRendered = await p.waitForFunction(
      () => document.querySelectorAll('#catalog .prod').length > 0, { timeout: 15000 }
    ).then(() => true).catch(() => false);
    await sleep(800);
    Object.assign(results.steps.storefront, await p.evaluate(() => {
      const q = (s) => document.querySelector(s);
      return {
        title: document.title,
        h1: q('header h1')?.textContent,
        catalogCards: document.querySelectorAll('#catalog .prod').length,
        firstCard: (q('#catalog .prod')?.innerText || '').replace(/\s+/g, ' ').trim(),
        badgeAI: q('#b-ai')?.textContent, badgePP: q('#b-pp')?.textContent,
        payDisabled: q('#pay')?.disabled,
        emptyCartMsg: (q('#cart')?.innerText || '').trim(),
        windowCsp: window.__csp,
      };
    }));
    results.steps.storefront.cardsRendered = cardsRendered;
    results.steps.storefront.appJsResponse = c.responses.filter((r) => r.url.endsWith('/app.js'));
    results.steps.storefront.catalogResponse = c.responses.filter((r) => r.url.includes('/api/catalog'));
    results.steps.storefront.consoleErrors = c.console.filter((m) => m.type === 'error').map((m) => m.text);
    results.steps.storefront.pageErrors = c.errors;
    try { await p.screenshot({ path: `${OUT}/11a_storefront.png`, fullPage: true }); }
    catch (e) { results.steps.storefront.screenshotError = String(e); }
    await p.close();
  }

  // ---- Step 2: DESKTOP return -> real navigation back to the web app ----------
  {
    const p = await browser.newPage();
    const c = wire(p);
    await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36');
    await p.goto(`${BASE}/api/checkout/return?token=ORDER-9`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);
    const dr = {
      finalUrl: p.url(),
      navigations: c.navigations,
      // F2 fix: measure the actual navigation event. app.js rewrites the URL via history.replaceState('/'),
      // so the post-hoc p.url() is '/'; the navigation to the web link is the correct signal.
      landedOnWebApp: c.navigations.some((u) => /\/\?paypal=success&token=ORDER-9/.test(u)),
      bannerText: await p.evaluate(() => (document.querySelector('#banner')?.innerText || '').trim()),
      consoleErrors: c.console.filter((m) => m.type === 'error').map((m) => m.text),
      pageErrors: c.errors,
    };
    try { await p.screenshot({ path: `${OUT}/11a_desktop_return.png`, fullPage: true }); }
    catch (e) { dr.screenshotError = String(e); }
    results.steps.desktopReturn = dr;
    await p.close();
  }

  // ---- Step 3: DESKTOP cancel -> web app -------------------------------------
  {
    const p = await browser.newPage();
    const c = wire(p);
    await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36');
    await p.goto(`${BASE}/api/checkout/cancel?token=ORDER-9`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);
    results.steps.desktopCancel = {
      finalUrl: p.url(),
      landedOnWebApp: c.navigations.some((u) => /\/\?paypal=cancel&token=ORDER-9/.test(u)),
      bannerText: await p.evaluate(() => (document.querySelector('#banner')?.innerText || '').trim()),
      pageErrors: c.errors,
    };
    await p.close();
  }

  // ---- Step 4: MOBILE return -> app deep link (not the web app) ---------------
  {
    const p = await browser.newPage();
    const c = wire(p);
    await p.setUserAgent(MOBILE_UA);
    await p.goto(`${BASE}/api/checkout/return?token=ORDER-9`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1800);
    const mr = await p.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find((x) => /Continue in the browser instead/.test(x.textContent));
      const deep = [...document.querySelectorAll('a')].find((x) => /paypalcommerceagent:\/\//.test(x.getAttribute('href') || ''));
      return {
        bodyLen: (document.body?.innerHTML || '').length,
        docTitle: document.title,
        fallbackLink: a ? { text: a.textContent.trim(), href: a.getAttribute('href') } : null,
        deepLinkHref: deep ? deep.getAttribute('href') : null,
        fallbackMessagePresent: !!document.getElementById('fallback-message'),
      };
    });
    mr.finalUrl = p.url();
    mr.stayedOnCheckout = p.url().includes('/api/checkout/return');
    mr.schemeAutoNavigated = c.navigations.some((u) => u.startsWith('paypalcommerceagent://'));
    mr.captureAttempts = c.captureAttempts;
    mr.consoleErrors = c.console.filter((m) => m.type === 'error').map((m) => m.text);
    mr.pageErrors = c.errors;
    mr.cspViolations = await p.evaluate(() => window.__csp || []);
    results.steps.mobileReturn = mr;
    try { await p.screenshot({ path: `${OUT}/11a_mobile_return.png`, fullPage: true }); }
    catch (e) { mr.screenshotError = String(e); }
    await p.close();
  }

  // ---- Step 5: hostile token is encoded + never executes ----------------------
  {
    const p = await browser.newPage();
    const c = wire(p);
    await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36');
    const evil = '"><script>x</script>';
    await p.goto(`${BASE}/api/checkout/return?token=${encodeURIComponent(evil)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1200);
    results.steps.hostileToken = await p.evaluate(() => ({
      finalUrl: window.location.href,
      injectedScriptExecuted: !!window.x,
      scriptTagsInDom: [...document.querySelectorAll('script')].map((s) => s.src || s.textContent.slice(0, 40)),
      windowCsp: window.__csp,
    }));
    results.steps.hostileToken.pageErrors = c.errors;
    await p.close();
  }

  await browser.close();
  fs.writeFileSync(`${OUT}/11a_browser_flow_result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const URL_ = `${BASE}/api/checkout/cancel?token=ORDER-9`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const out = {};

  // Variant A: JS disabled -> static DOM delivery only
  {
    const p = await browser.newPage();
    await p.setUserAgent(MOBILE_UA);
    await p.setJavaScriptEnabled(false);
    await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await sleep(500);
    out.jsDisabled = await p.evaluate(() => ({ anchorCount: document.querySelectorAll('a').length, bodyLen: (document.body?.innerHTML || '').length }));
    await p.close();
  }

  // Variant B: JS enabled, location.replace stubbed (no real navigation)
  {
    const p = await browser.newPage();
    await p.setUserAgent(MOBILE_UA);
    await p.evaluateOnNewDocument(() => {
      window.__replaceCalls = [];
      try {
        const loc = window.location;
        loc.replace = function (u) { window.__replaceCalls.push(String(u)); };
      } catch (e) { window.__replaceStubErr = String(e); }
    });
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await sleep(1800);
    out.stubbed = await p.evaluate(() => ({
      anchorCount: document.querySelectorAll('a').length,
      anchors: [...document.querySelectorAll('a')].map((a) => ({ text: a.textContent, href: a.getAttribute('href') })),
      bodyLen: (document.body?.innerHTML || '').length,
      replaceCalls: window.__replaceCalls || null,
      stubErr: window.__replaceStubErr || null,
      url: location.href,
    }));
    out.stubbed.pageErrors = errs;
    await p.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

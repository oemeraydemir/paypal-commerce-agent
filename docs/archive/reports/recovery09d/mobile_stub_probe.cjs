const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const URL_ = `${BASE}/api/checkout/cancel?token=ORDER-9`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const p = await browser.newPage();
  await p.setUserAgent(MOBILE_UA);
  await p.evaluateOnNewDocument(() => {
    window.__replaceCalls = [];
    Object.defineProperty(Location.prototype, 'replace', {
      configurable: true, writable: true,
      value: function (u) { window.__replaceCalls.push(String(u)); },
    });
    Object.defineProperty(Location.prototype, 'assign', {
      configurable: true, writable: true,
      value: function (u) { window.__replaceCalls.push(String(u)); },
    });
  });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await sleep(1800);
  const info = await p.evaluate(() => ({
    url: location.href,
    bodyLen: (document.body?.innerHTML || '').length,
    anchors: [...document.querySelectorAll('a')].map((a) => ({ text: a.textContent, href: a.getAttribute('href') })),
    fallbackHidden: document.getElementById('fallback-message')?.hidden,
    replaceCalls: window.__replaceCalls,
  }));
  info.pageErrors = errs;
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

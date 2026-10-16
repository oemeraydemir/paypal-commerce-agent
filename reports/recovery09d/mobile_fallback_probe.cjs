const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const out = {};
  for (const [label, ua] of [['desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/154.0.0.0 Safari/537.36'], ['mobile', MOBILE_UA]]) {
    const p = await browser.newPage();
    await p.setUserAgent(ua);
    await p.goto(`${BASE}/api/checkout/cancel?token=ORDER-9`, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
    await sleep(1600);
    out[label] = await p.evaluate(() => ({
      url: location.href,
      anchors: [...document.querySelectorAll('a')].map((a) => ({ text: a.textContent, href: a.getAttribute('href') })),
      fallbackMessageVisible: !document.getElementById('fallback-message')?.hidden,
    }));
    await p.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

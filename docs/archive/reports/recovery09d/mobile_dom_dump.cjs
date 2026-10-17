const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const p = await browser.newPage();
  await p.setUserAgent(MOBILE_UA);
  await p.goto(`${BASE}/api/checkout/cancel?token=ORDER-9`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => console.log('goto err', String(e).slice(0, 120)));
  await sleep(2000);
  const info = await p.evaluate(() => ({
    url: location.href,
    readyState: document.readyState,
    anchorCount: document.querySelectorAll('a').length,
    allEls: document.querySelectorAll('*').length,
    bodyHTML: (document.body?.innerHTML || '').replace(/\s+/g, ' ').trim().slice(0, 600),
    frames: window.frames.length,
  }));
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

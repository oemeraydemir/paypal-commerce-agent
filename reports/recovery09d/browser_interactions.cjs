const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], defaultViewport: { width: 1440, height: 1000 } });
  const p = await browser.newPage();
  const errs = [], consoleErrors = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await p.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll('#catalog .prod').length > 0, { timeout: 15000 });

  const out = {};

  // 1) Add an item to the cart via the real UI
  await p.click('#catalog .prod .row button');
  await sleep(400);
  out.afterAdd = await p.evaluate(() => ({
    cartItems: document.querySelectorAll('#cart .item').length,
    cartText: (document.querySelector('#cart')?.innerText || '').replace(/\s+/g, ' ').trim(),
    total: document.querySelector('#total')?.textContent,
    payDisabled: document.querySelector('#pay')?.disabled,
  }));

  // 2) Increase quantity with the "+" control
  await p.click('#cart .item .q button:last-child');
  await sleep(300);
  out.afterPlus = await p.evaluate(() => ({
    qty: document.querySelector('#cart .item .q span')?.textContent,
    total: document.querySelector('#total')?.textContent,
  }));

  // 3) Click "Pay with PayPal" (PayPal disabled -> graceful 503 banner)
  await p.click('#pay');
  await sleep(1500);
  out.afterPay = await p.evaluate(() => ({
    banner: (document.querySelector('#banner')?.innerText || '').replace(/\s+/g, ' ').trim(),
    payLabel: document.querySelector('#pay')?.textContent,
    payDisabled: document.querySelector('#pay')?.disabled,
  }));

  // 4) Send an AI chat message (AI disabled -> graceful 503 message)
  await p.type('#msg', 'A vegetarian breakfast for two under €20');
  await p.click('#send');
  await sleep(1500);
  out.afterChat = await p.evaluate(() => ({
    messages: [...document.querySelectorAll('#log .msg')].map((m) => m.className + ' | ' + m.textContent.replace(/\s+/g, ' ').trim()),
  }));

  out.pageErrors = errs;
  out.consoleErrors = consoleErrors;
  try { await p.screenshot({ path: 'C:/Projects/FinCan/recovery09d/11a_interactions.png', fullPage: true }); }
  catch (e) { out.screenshotError = String(e); }
  fs.writeFileSync('C:/Projects/FinCan/recovery11a/11a_interactions.json', JSON.stringify(out, null, 2));
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

'use strict';
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://paypal-commerce-agent.onrender.com';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1400,900'], defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1200));

  const info = await page.evaluate(() => {
    function cs(el, p) { return getComputedStyle(el).getPropertyValue(p).trim(); }
    const out = { bodyBg: cs(document.body, 'background-color'), rootBg: cs(document.documentElement, 'background-color') };
    const sels = ['header a', '.cats button', '.chips button', '.how-n', '.pill.on', '.hero-cta button:not(.primary)', 'footer'];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = '(no element)'; continue; }
      let chain = [];
      let n = el;
      for (let i = 0; i < 4 && n; i++) { chain.push(cs(n, 'background-color') + ' :: ' + n.tagName + (n.className ? '.' + String(n.className).split(' ').join('.') : '')); n = n.parentElement; }
      out[sel] = { fg: cs(el, 'color'), bg: cs(el, 'background-color'), ancestors: chain, text: el.textContent.trim().slice(0, 30) };
    }
    return out;
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();

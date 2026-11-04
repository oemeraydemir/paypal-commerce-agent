'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto('https://paypal-commerce-agent.onrender.com/', { waitUntil: 'networkidle2', timeout: 60000 });
  const out = await page.evaluate(() => {
    const pick = (el) => {
      const cs = getComputedStyle(el);
      return { tag: el.tagName, id: el.id, color: cs.color, bgColor: cs.backgroundColor,
               bgImage: cs.backgroundImage.slice(0, 60) };
    };
    return {
      root: pick(document.documentElement),
      body: pick(document.body),
      footer: pick(document.querySelector('footer')),
      varBg: getComputedStyle(document.documentElement).getPropertyValue('--bg'),
      varMut: getComputedStyle(document.body).getPropertyValue('--mut'),
      bodyClass: document.body.className,
    };
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

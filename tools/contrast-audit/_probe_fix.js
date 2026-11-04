'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox','--disable-gpu','--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto('https://paypal-commerce-agent.onrender.com/', { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1500));
  const out = await page.evaluate(() => {
    const res = {};
    const apply = (css) => {
      const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); return s;
    };
    const read = () => { const c = getComputedStyle(document.body); return c.backgroundColor + ' | ' + c.backgroundImage.slice(0,30); };
    res.before = read();
    let s1 = apply('body{background:var(--bg)!important}'); res.singleVarShorthand = read(); s1.remove();
    let s2 = apply('body{background-color:var(--bg)!important;background-image:var(--mesh)!important;background-attachment:fixed!important}'); res.longhands = read(); s2.remove();
    let s3 = apply('body{background:var(--bg) var(--mesh) fixed!important}'); res.multiVarShorthand = read(); s3.remove();
    return res;
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

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
    const rules = [];
    for (const sheet of document.styleSheets) {
      let rs;
      try { rs = sheet.cssRules; } catch (e) { continue; }
      const href = sheet.href || 'INLINE';
      for (const r of rs) {
        if (r.selectorText && /(^| )body( |,|$|>|\*)/.test(r.selectorText)) {
          const bg = r.style && (r.style.background || r.style.backgroundColor || r.style.backgroundImage);
          if (bg) rules.push({ href: href.split('/').pop(), sel: r.selectorText, bg: r.style.background || ('color='+r.style.backgroundColor+' img='+r.style.backgroundImage) });
        }
      }
    }
    return { count: rules.length, rules };
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

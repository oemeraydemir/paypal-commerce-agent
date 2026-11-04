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
    const cs = getComputedStyle(document.body);
    return {
      bodyBgColor: cs.backgroundColor,
      bodyBgImage: cs.backgroundImage.slice(0,50),
      meshOnBody: cs.getPropertyValue('--mesh').slice(0,60),
      meshOnRoot: getComputedStyle(document.documentElement).getPropertyValue('--mesh').slice(0,60),
      bgOnBody: cs.getPropertyValue('--bg'),
      bgOnRoot: getComputedStyle(document.documentElement).getPropertyValue('--bg'),
      // Try forcing the longhand to see if it sticks:
      test: (() => {
        document.body.style.backgroundColor = 'var(--bg)';
        document.body.style.backgroundImage = 'var(--mesh)';
        const c2 = getComputedStyle(document.body);
        return { bg: c2.backgroundColor, img: c2.backgroundImage.slice(0,50) };
      })(),
    };
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

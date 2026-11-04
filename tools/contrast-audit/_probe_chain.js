'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto('https://paypal-commerce-agent.onrender.com/', { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1500));

  const dump = await page.evaluate(() => {
    function chain(el) {
      const out = [];
      let n = el;
      while (n) {
        const cs = getComputedStyle(n);
        out.push({
          tag: n.tagName.toLowerCase(), id: n.id || '', cls: (n.className || '').toString().slice(0, 30),
          color: cs.color, bg: cs.backgroundColor, bgImage: cs.backgroundImage.slice(0, 40),
        });
        n = n.parentElement;
      }
      return out;
    }
    const foot = document.querySelector('footer');
    const pill = document.querySelector('.pill.on');
    return {
      footerExists: !!foot,
      footerChain: foot ? chain(foot) : null,
      pillExists: !!pill,
      pillChain: pill ? chain(pill) : null,
      pillText: pill ? pill.textContent.trim() : null,
    };
  });
  console.log(JSON.stringify(dump, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

// Probe: try to force Flutter web semantics (Tab nav) and read rendered text
// from the DOM/accessibility tree for the en-US page.
const { chromium } = require('playwright-core');
const CHROME = 'C:/Users/o_ayd/.agent-browser/browsers/chrome-156.0.8078.47/chrome.exe';
const URL = 'http://127.0.0.1:8090/';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ locale: 'en-US' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });

  await page.waitForTimeout(12000);

  // Nudge keyboard navigation to make Flutter create its semantics DOM.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2000);

  const flattened = await page.evaluate(() => {
    const out = [];
    const walk = (n) => {
      if (!n) return;
      const label = n.getAttribute && n.getAttribute('aria-label');
      const text = n.textContent;
      if (label) out.push(`label=${label}`);
      const kids = n.shadowRoot ? n.shadowRoot.querySelectorAll('*') : [];
      kids.forEach((k) => walk(k));
    };
    walk(document.body);
    return out;
  });

  let a11y = null;
  try { a11y = await page.accessibility.snapshot(); } catch (e) { a11y = { error: String(e) }; }

  console.log('PAGE ERRORS:', errors.length ? errors : '(none)');
  console.log('SEMANTIC LABELS:', flattened.slice(0, 60));
  console.log('A11Y JSON len:', JSON.stringify(a11y).length);
  console.log('A11Y sample:', JSON.stringify(a11y).slice(0, 800));
  await browser.close();
})();

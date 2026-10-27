// Probe: inspect Flutter's rendered surface (canvas / glass pane) on web to
// confirm a frame was laid out, plus capture page errors/console.
const { chromium } = require('playwright-core');
const CHROME = 'C:/Users/o_ayd/.agent-browser/browsers/chrome-156.0.8078.47/chrome.exe';
const URL = 'http://127.0.0.1:8090/';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ locale: 'en-US' });
  const logs = [];
  const errors = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(15000);

  const info = await page.evaluate(() => {
    const view = document.querySelector('flutter-view');
    const pane = view && view.shadowRoot ? view.shadowRoot.querySelector('flt-glass-pane') : null;
    const canvas = pane ? pane.querySelector('canvas') : null;
    let canvasSize = null;
    if (canvas) {
      const r = canvas.getBoundingClientRect();
      canvasSize = { w: r.width, h: r.height, css: canvas.style.width, cssH: canvas.style.height };
    }
    const bodyChildren = document.body ? document.body.children.length : 0;
    return {
      viewPresent: !!view,
      shadowRoot: view ? !!view.shadowRoot : false,
      panePresent: !!pane,
      canvasPresent: !!canvas,
      canvasSize,
      bodyChildren,
      bodyHTMLlen: document.body ? document.body.innerHTML.length : 0,
    };
  });

  // grep key console entries
  const bad = logs.filter((l) => l.includes('LocaleDataException') || l.includes('No MaterialLocalizations'));
  console.log('CANVAS/FRAME INFO:', JSON.stringify(info));
  console.log('LOCALE/MATERIAL ERRORS IN CONSOLE:', bad.length ? bad : '(none)');
  console.log('PAGE ERRORS:', errors.length ? errors : '(none)');
  console.log('CONSOLE ERROR COUNT:', logs.filter((l) => l.startsWith('[error]')).length);
  await browser.close();
})();

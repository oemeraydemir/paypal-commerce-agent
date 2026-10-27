// Real-browser verification of the built Flutter web app (debug) in BOTH
// locales (en-US and tr-TR). Captures console/page/network events, waits for
// the Flutter first-frame event, and reports any LocaleDataException or
// MaterialLocalizations error. No result is faked; BLOCKED/errors are printed.
const { chromium } = require('playwright-core');

const CHROME = 'C:/Users/o_ayd/.agent-browser/browsers/chrome-156.0.8078.47/chrome.exe';
const URL = 'http://127.0.0.1:8090/';

async function checkLocale(browser, locale) {
  const context = await browser.newContext({ locale });
  const page = await context.newPage();

  const consoleLogs = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => failedRequests.push(`${req.url()} :: ${req.failure() && req.failure().errorText}`));

  // Watch for the engine's first-frame event.
  await page.evaluate(() => {
    window.__firstFrame = false;
    window.addEventListener('flutter-first-frame', () => { window.__firstFrame = true; });
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });

  let bodyText = '';
  let hasView = false;
  let firstFrame = false;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    bodyText = await page.evaluate(() => document.body ? document.body.innerText : '');
    hasView = await page.evaluate(() => !!document.querySelector('flutter-view'));
    firstFrame = await page.evaluate(() => !!window.__firstFrame);
    if (firstFrame) break;
  }

  let a11y = '';
  try {
    a11y = JSON.stringify(await page.accessibility.snapshot());
  } catch (e) {
    a11y = `(a11y error: ${e})`;
  }

  const shotPath = `build/web/__verify_${locale.replace('-', '_')}.png`;
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log(`SCREENSHOT_SAVED=${shotPath}`);

  const joined = [...consoleLogs, ...pageErrors].join('\n');
  const localeDataException = joined.includes('LocaleDataException') || joined.includes('Locale data has not been initialized');
  const materialLoc = joined.includes('No MaterialLocalizations');
  const hasCafe = bodyText.includes('AI Café') || a11y.includes('AI Café');

  console.log(`\n===== LOCALE: ${locale} =====`);
  console.log('CONSOLE ERRORS/WARNINGS:');
  consoleLogs.filter((l) => l.startsWith('[error]') || l.startsWith('[warning]')).slice(0, 40).forEach((l) => console.log(l));
  console.log('PAGE ERRORS:', pageErrors.length ? pageErrors.join('\n') : '(none)');
  console.log('FAILED REQUESTS:', failedRequests.length ? failedRequests.slice(0, 8).join('\n') : '(none)');
  console.log('CHECKS: bodyLen=%d flutterView=%s firstFrame=%s hasCafe=%s localeDataException=%s materialLocalizations=%s',
      bodyText.length, hasView, firstFrame, hasCafe, localeDataException, materialLoc);

  await context.close();
  const ok = (firstFrame || hasCafe) && !localeDataException && !materialLoc;
  return { locale, ok, localeDataException, materialLoc, firstFrame, hasView, hasCafe };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const en = await checkLocale(browser, 'en-US');
  const tr = await checkLocale(browser, 'tr-TR');
  await browser.close();

  console.log('\n===== SUMMARY =====');
  for (const r of [en, tr]) {
    console.log(`${r.locale}: ${r.ok ? 'PASS' : 'FAIL'} (firstFrame=${r.firstFrame}, view=${r.hasView}, cafe=${r.hasCafe}, localeExc=${r.localeDataException}, matLoc=${r.materialLoc})`);
  }
  process.exit(en.ok && tr.ok ? 0 : 1);
})();

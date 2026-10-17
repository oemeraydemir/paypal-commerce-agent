#!/usr/bin/env node
/* Exploratory: load the Flutter web build and screenshot it so the chat input
 * can be located before driving it. */
const path = require('path');
const { chromium } = require('playwright-core');

const URL = process.env.APP_URL || 'http://127.0.0.1:8080/';
const OUT = path.join(__dirname, '..', 'flutter-rulebased');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(12000);

  await page.screenshot({ path: path.join(OUT, '00-initial.png') });

  const info = await page.evaluate(() => ({
    title: document.title,
    canvases: document.querySelectorAll('canvas').length,
    flutterView: document.querySelectorAll('flutter-view').length,
    inputs: Array.from(document.querySelectorAll('input,textarea')).map((e) => ({
      tag: e.tagName,
      type: e.getAttribute('type'),
      cls: e.className,
      rect: e.getBoundingClientRect().toJSON(),
    })),
    bodyText: (document.body.innerText || '').slice(0, 400),
  }));

  console.log(JSON.stringify({ info, logs: logs.slice(0, 40) }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});

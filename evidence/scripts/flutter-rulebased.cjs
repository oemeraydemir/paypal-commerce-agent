#!/usr/bin/env node
/*
 * Captures visual evidence that the Flutter client renders the rule-based
 * fallback truthfully (chip on the bubble + "Rule-based cart" title).
 *
 * Requirements: a backend whose /api/ai/chat answers mode="rule-based", and the
 * Flutter web build served on APP_URL. See evidence/README.md for the exact
 * commands used to produce the run these images came from.
 */
const path = require('path');
const { chromium } = require('playwright-core');

const URL = process.env.APP_URL || 'http://127.0.0.1:8080/';
const OUT = path.join(__dirname, '..', 'flutter-rulebased');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MESSAGE = process.env.CHAT_MESSAGE || 'I want coffee and a croissant';

// The chat composer sits at the bottom of the layout; the send button is the
// circular button on the right edge of that row.
const INPUT_POINT = { x: 480, y: 856 };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

  // Record the real chat response the app received, so the screenshot can be
  // tied to an actual mode="rule-based" payload instead of an assumption.
  let chatExchange = null;
  page.on('response', async (res) => {
    if (!res.url().includes('/api/ai/chat')) return;
    try {
      const body = await res.json();
      chatExchange = {
        status: res.status(),
        mode: body.mode,
        checkoutReady: body.checkoutReady,
        preparedCart: body.preparedCart
          ? {
              policyDecision: body.preparedCart.policyDecision,
              requiresExplicitApproval: body.preparedCart.requiresExplicitApproval,
              totalFormatted: body.preparedCart.totalFormatted,
            }
          : null,
      };
    } catch {
      chatExchange = { status: res.status(), body: '<unparseable>' };
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(OUT, '01-empty-chat.png') });

  // Focus the composer (Flutter creates a hidden <input> on focus), then type.
  await page.mouse.click(INPUT_POINT.x, INPUT_POINT.y);
  await page.waitForTimeout(800);
  await page.keyboard.type(MESSAGE, { delay: 30 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '02-typed.png') });
  await page.keyboard.press('Enter');

  // The backend has to exhaust the AI provider before falling back, so allow time.
  await page.waitForTimeout(20000);
  await page.screenshot({ path: path.join(OUT, '03-rulebased-reply.png'), fullPage: true });

  // Turn on Flutter's semantics tree so the rendered text becomes real DOM and
  // can be asserted rather than only eyeballed in the screenshot.
  let semantics = null;
  const placeholder = await page.$('flt-semantics-placeholder, [aria-label="Enable accessibility"]');
  if (placeholder) {
    await placeholder.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    semantics = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('flt-semantics, [role]'));
      const text = nodes
        .map((n) => n.getAttribute('aria-label') || n.textContent || '')
        .filter(Boolean)
        .join(' | ');
      return {
        nodeCount: nodes.length,
        hasRuleBasedAnswer: /Rule-based answer/i.test(text),
        hasRuleBasedCart: /Rule-based cart/i.test(text),
        hasAiPreparedCart: /AI-prepared cart/i.test(text),
        excerpt: text.slice(0, 1200),
      };
    });
    await page.screenshot({ path: path.join(OUT, '04-semantics-on.png'), fullPage: true });
  }

  console.log(
    JSON.stringify(
      {
        url: URL,
        message: MESSAGE,
        chrome: await browser.version(),
        chatExchange,
        semantics,
        consoleErrors: logs.filter((l) => l.startsWith('error') || l.startsWith('pageerror')).slice(0, 20),
      },
      null,
      2
    )
  );
  await browser.close();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});

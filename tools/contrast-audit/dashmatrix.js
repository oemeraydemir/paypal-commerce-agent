'use strict';
// Verifies dashboard text contrast in all four OS-theme x manual-toggle states.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

// NOTE: `PUBLIC` is a built-in Windows env var (C:\Users\Public) — do not use it.
const ROOT = process.env.AICAFE_PUBLIC || 'C:/Users/o_ayd/Desktop/AiCafe_wt_barista/source/apps/backend/public';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function lum(rgb) {
  const c = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function rgb(s) { const m = String(s).match(/(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/); return m ? [+m[1], +m[2], +m[3]] : null; }

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'dashboard.html' : decodeURIComponent(req.url.split('?')[0]));
  const ok = p.replace(/\\/g, '/').startsWith(ROOT) && fs.existsSync(p) && !fs.statSync(p).isDirectory();
  if (process.env.DEBUG) console.error('REQ', req.url, '->', p, 'ok=', ok);
  if (!ok) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise((r) => server.listen(8095, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1400, height: 900 },
  });
  const out = [];
  for (const os of ['light', 'dark']) {
    for (const wanted of ['light', 'dark']) {
      const page = await browser.newPage();
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: os }]);
      const resp = await page.goto('http://127.0.0.1:8095/dashboard.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (process.env.DEBUG) console.error('HTTP', resp && resp.status(), (await page.content()).slice(0, 220));
      await new Promise((r) => setTimeout(r, 1200));
      const state = await page.evaluate((wanted) => {
        const isDark = document.body.classList.contains('dark');
        if (wanted === 'dark' && !isDark) document.getElementById('themeToggle')?.click();
        if (wanted === 'light' && isDark) document.getElementById('themeToggle')?.click();
        const pick = (sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return { fg: c.color, bg: c.backgroundColor }; };
        return {
          dark: document.body.classList.contains('dark'),
          statValue: pick('#totalOrdersValue'),
          statLabel: pick('.stat-label'),
          statCard: pick('.stat-card'),
          heading: pick('h1'),
          body: pick('body'),
          opsMuted: pick('.ops-muted'),
        };
      }, wanted);
      // effective background = nearest non-transparent card background
      if (!state.statCard || !state.statValue) { console.error('MISSING ELEMENTS', JSON.stringify(state)); throw new Error('dashboard markup not found'); }
      const bg = rgb(state.statCard.bg) || rgb(state.body.bg) || [255, 255, 255];
      const fg = rgb(state.statValue.fg) || [0, 0, 0];
      const r = ratio(fg, bg);
      out.push({ os, toggle: wanted, bodyDark: state.dark, statFg: state.statValue.fg, cardBg: state.statCard.bg, contrast: +r.toFixed(2), pass: r >= 4.5 });
      await page.close();
    }
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); server.close(); process.exit(1); });

'use strict';
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'https://paypal-commerce-agent.onrender.com';

function lum(c) {
  const f = (x) => {
    x = x / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function parseRgb(s) {
  const m = String(s).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}
function contrast(a, b) {
  const l1 = lum(a), l2 = lum(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
// blend over white/dark -> return opaque rgb used for bg
function toOpaque(c, fallback) {
  if (!c) return fallback;
  const a = c[3] === undefined ? 1 : c[3];
  if (a >= 0.99) return [c[0], c[1], c[2]];
  const base = fallback || [255, 255, 255];
  return [
    Math.round(c[0] * a + base[0] * (1 - a)),
    Math.round(c[1] * a + base[1] * (1 - a)),
    Math.round(c[2] * a + base[2] * (1 - a)),
  ];
}

async function scan(page, label) {
  const report = await page.evaluate(() => {
    function lum(c) {
      const f = (x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    }
    function parseRgb(s) {
      const m = String(s).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    }
    function contrast(a, b) {
      const l1 = lum(a), l2 = lum(b);
      const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    }
    function opaque(c, fb) {
      if (!c) return fb;
      const a = c[3] === undefined ? 1 : c[3];
      if (a >= 0.99) return [c[0], c[1], c[2]];
      return [
        Math.round(c[0] * a + fb[0] * (1 - a)),
        Math.round(c[1] * a + fb[1] * (1 - a)),
        Math.round(c[2] * a + fb[2] * (1 - a)),
      ];
    }
    function bg(el) {
      // Collect backgrounds from the element up to <html> (top-down order).
      const layers = [];
      let n = el;
      while (n) { layers.push(parseRgb(getComputedStyle(n).backgroundColor)); n = n.parentElement; }
      // Find the deepest opaque layer to use as the base.
      let base = null, baseIndex = -1;
      for (let i = layers.length - 1; i >= 0; i--) {
        if (layers[i] && layers[i][3] > 0.98) { base = layers[i]; baseIndex = i; break; }
      }
      if (!base) base = [255, 255, 255];
      let acc = [base[0], base[1], base[2]];
      // Composite layers from root toward the element (rootmost first).
      for (let i = layers.length - 1; i >= 0; i--) {
        const c = layers[i];
        if (!c) continue;
        const a = c[3];
        acc = [Math.round(acc[0] * (1 - a) + c[0] * a), Math.round(acc[1] * (1 - a) + c[1] * a), Math.round(acc[2] * (1 - a) + c[2] * a)];
      }
      return acc;
    }
    const out = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      // Skip elements whose own background is a gradient (or an image): the text
      // colour is intentionally paired with it and we cannot measure it flatly.
      if (cs.backgroundImage && cs.backgroundImage !== 'none') continue;
      // Also skip text that visually sits on a gradient painted by a CONTAINER
      // ancestor (e.g. the .hero coral gradient). We can't measure a gradient
      // flatly. The body's `--mesh` is a subtle decorative layer and is excluded
      // on purpose (body/html are skipped below), so it never triggers this.
      {
        let n = el.parentElement;
        let onGradient = false;
        while (n && n.tagName !== 'BODY' && n.tagName !== 'HTML') {
          const ncs = getComputedStyle(n);
          if (ncs.backgroundImage && ncs.backgroundImage !== 'none') { onGradient = true; break; }
          if (ncs.backgroundColor && ncs.backgroundColor !== 'rgba(0, 0, 0, 0)' && ncs.backgroundColor !== 'transparent') break;
          n = n.parentElement;
        }
        if (onGradient) continue;
      }
      const rects = el.getClientRects();
      if (!rects.length) continue;
      // must have direct text
      let directText = '';
      for (const node of el.childNodes) if (node.nodeType === 3) directText += node.textContent;
      const text = directText.trim();
      if (!text) continue;
      const fg = parseRgb(cs.color);
      if (!fg) continue;
      const b = bg(el);
      const ratio = contrast(fg.slice(0, 3), b);
      const own = parseRgb(cs.backgroundColor);
      if (ratio < 4.5) {
        out.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          cls: (el.className && el.className.toString()) || '',
          text: directText.trim().slice(0, 40),
          fg: cs.color,
          bg: 'rgb(' + b.join(', ') + ')',
          ownBG: own ? cs.backgroundColor : '(transparent)',
          size: cs.fontSize,
          weight: cs.fontWeight,
          ratio: Math.round(ratio * 100) / 100,
        });
      }
    }
    out.sort((a, b) => a.ratio - b.ratio);
    return out.slice(0, 40);
  });

  console.log('\n========== ' + label + ' (' + report.length + ' low-contrast elements) ==========');
  for (const r of report) {
    console.log(`[${r.ratio}] <${r.tag}>#${r.id}.${r.cls} fg=${r.fg} bg=${r.bg} text="${r.text}"`);
  }
}

(async () => {
  // THEME env selects the OS colour scheme to emulate. The dashboard uses a manual
  // toggle, so for a dark audit we click it; for a light audit we leave it off.
  const THEME = process.env.THEME || 'dark';
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });

  // Storefront, forced to THEME
  {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: THEME }]);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 1500));
    await scan(page, 'STOREFRONT / (' + THEME + ')');
    await page.close();
  }

  // Dashboard: load; toggle to dark only when auditing the dark scheme
  {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: THEME }]);
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2500));
    // try to enable dark theme via toggle (only meaningful for the dark audit)
    const toggled = await page.evaluate(() => {
      const btn = document.getElementById('themeToggle');
      if (btn && THEME === 'dark') { btn.click(); return true; }
      return false;
    }).catch(() => false);
    await new Promise(r => setTimeout(r, 1200));
    await scan(page, 'DASHBOARD /dashboard (' + THEME + ', toggled=' + toggled + ')');
    await page.close();
  }

  await browser.close();
})();

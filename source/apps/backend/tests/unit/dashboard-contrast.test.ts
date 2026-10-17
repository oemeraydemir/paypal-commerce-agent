// Reproducible WCAG 2.x contrast check for the dashboard badges.
// Badge backgrounds are translucent tints, so the text is measured against the tint
// BLENDED over the panel it sits on (not against the bare panel colour).
import fs from 'fs';
import path from 'path';

// Strip CSS comments so they cannot bleed into selectors.
const html = fs
  .readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as RGB;
};
const lum = ([r, g, b]: RGB) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const blend = (fg: RGB, a: number, bg: RGB): RGB =>
  fg.map((c, i) => Math.round(a * c + (1 - a) * bg[i])) as RGB;

// Panels a badge can sit on (grid cell / detail panel), per theme.
const PANELS = { light: ['#ffffff', '#f8fafc'], dark: ['#1b2530', '#16202b'] };

function badgeRules(dark: boolean) {
  const out: { name: string; text: RGB; tint: RGB; alpha: number }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const selectors = m[1].split(',').map((s) => s.trim());
    const body = m[2];
    const bg = /background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(body);
    const col = /(?:^|[;\s])color:\s*(#[0-9a-fA-F]{6})/.exec(body);
    if (!bg || !col) continue;
    for (const sel of selectors) {
      const isDark = sel.startsWith('body.dark ');
      const mm = /\.(badge-[a-z]+)$/.exec(sel);
      if (!mm || isDark !== dark) continue;
      out.push({
        name: mm[1],
        text: hex(col[1]),
        tint: [Number(bg[1]), Number(bg[2]), Number(bg[3])],
        alpha: Number(bg[4]),
      });
    }
  }
  return out;
}

describe.each([['light', false], ['dark', true]] as const)('badge text contrast (%s theme)', (theme, dark) => {
  const rules = badgeRules(dark);

  test('every badge variant is covered by the check', () => {
    const names = rules.map((r) => r.name).sort();
    const expected = dark
      ? ['badge-ai', 'badge-allow', 'badge-block', 'badge-cancelled', 'badge-confirm', 'badge-human', 'badge-neutral', 'badge-paid']
      : ['badge-ai', 'badge-allow', 'badge-block', 'badge-cancelled', 'badge-confirm', 'badge-neutral', 'badge-paid'];
    expect(names).toEqual(expected);
  });

  test.each(PANELS[theme])('all badge text is >= 4.5:1 (small text) on panel %s', (panel) => {
    for (const r of rules) {
      const bg = blend(r.tint, r.alpha, hex(panel));
      const got = ratio(r.text, bg);
      expect({ badge: r.name, ok: got >= 4.5, got: Number(got.toFixed(2)) }).toEqual({
        badge: r.name,
        ok: true,
        got: Number(got.toFixed(2)),
      });
    }
  });
});

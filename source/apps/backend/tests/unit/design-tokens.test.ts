/**
 * Shared design tokens: one JSON source -> web CSS + Flutter Dart.
 * Guards (1) generated files are not stale, (2) every text/background pair used by the UI
 * meets WCAG AA, (3) category tints agree with the art manifest used by web and Flutter.
 */
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const gen = require('../../../../tools/gen-design-tokens.js') as {
  render: () => { css: string; dart: string; tokens: any };
  OUT_CSS: string;
  OUT_DART: string;
};

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('design tokens', () => {
  const { css, dart, tokens } = gen.render();

  it('committed tokens.css is in sync with design/tokens.json (run `npm run tokens`)', () => {
    expect(fs.readFileSync(gen.OUT_CSS, 'utf8').replace(/\r\n/g, '\n')).toBe(css.replace(/\r\n/g, '\n'));
  });

  it('committed Flutter tokens.g.dart is in sync with design/tokens.json (run `npm run tokens`)', () => {
    expect(fs.readFileSync(gen.OUT_DART, 'utf8').replace(/\r\n/g, '\n')).toBe(dart.replace(/\r\n/g, '\n'));
  });

  it('palette is the iOS system palette (accent / mint / peach / lavender / sky)', () => {
    expect(JSON.stringify(tokens).toLowerCase()).not.toContain('#0a60ff');
    for (const k of ['coral', 'mint', 'peach', 'lavender', 'sky']) expect(tokens.light[k]).toMatch(/^#[0-9A-F]{6}$/i);
  });

  const pairsFor = (p: any, mode: 'light' | 'dark'): Array<[string, string, string, number]> => [
    ['ink on canvas', p.ink, p.canvas, 4.5],
    ['ink on surface', p.ink, p.surface, 4.5],
    ['muted on surface', p.muted, p.surface, 4.5],
    ['muted on canvas', p.muted, p.canvas, 4.5],
    ['coralStrong on surface (links/prices)', p.coralStrong, p.surface, 4.5],
    // CTA label: white on the (dark) gradient ends in light mode, black on the light blue in dark mode.
    ['button label on gradient start (CTA)', mode === 'light' ? '#FFFFFF' : '#000000', mode === 'light' ? tokens.gradient.from : tokens.gradient.fromDark, 4.5],
    ['button label on gradient end (CTA)', mode === 'light' ? '#FFFFFF' : '#000000', mode === 'light' ? tokens.gradient.to : tokens.gradient.toDark, 4.5],
    ['mintInk on mint', p.mintInk, p.mint, 4.5],
    ['peachInk on peach', p.peachInk, p.peach, 4.5],
    ['lavenderInk on lavender', p.lavenderInk, p.lavender, 4.5],
    ['skyInk on sky', p.skyInk, p.sky, 4.5],
    ['ok on surface', p.ok, p.surface, 4.5],
    ['warn on surface', p.warn, p.surface, 4.5],
    ['bad on surface', p.bad, p.surface, 4.5],
  ];

  for (const mode of ['light', 'dark'] as const) {
    for (const [label, fg, bg, min] of pairsFor(tokens[mode], mode)) {
      it(`${mode}: ${label} >= ${min}:1`, () => {
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it('light: white on coralStrong (primary button) >= 4.5:1', () => {
    expect(ratio('#FFFFFF', tokens.light.coralStrong)).toBeGreaterThanOrEqual(4.5);
  });

  it('category tints equal the shared art manifest', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../public/art/manifest.json'), 'utf8'),
    ).tint as Record<string, string>;
    for (const [cat, hex] of Object.entries(manifest)) {
      expect(tokens.category[cat].toLowerCase()).toBe(hex.toLowerCase());
    }
  });
});

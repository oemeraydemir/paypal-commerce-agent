import fs from 'fs';
import path from 'path';
import catalog from '../../src/catalog/data.json';

// Web and Flutter must show the SAME artwork for every catalog product.
const webArt = path.join(__dirname, '../../public/art');
const flutterArt = path.join(__dirname, '../../../flutter_app/assets/products');

describe('product art parity (web <-> Flutter)', () => {
  const ids = (catalog.products as Array<{ id: string; category: string }>);

  it.each(ids.map((p) => [p.id]))('has identical art for %s on both clients', (id) => {
    const web = path.join(webArt, `${id}.jpg`);
    const app = path.join(flutterArt, `${id}.jpg`);
    expect(fs.existsSync(web)).toBe(true);
    expect(fs.existsSync(app)).toBe(true);
    expect(fs.readFileSync(web).equals(fs.readFileSync(app))).toBe(true);
  });

  it('has a category fallback tile for every category on both clients', () => {
    for (const c of new Set(ids.map((p) => p.category))) {
      expect(fs.existsSync(path.join(webArt, `cat_${c}.jpg`))).toBe(true);
      expect(fs.existsSync(path.join(flutterArt, `cat_${c}.jpg`))).toBe(true);
    }
  });

  it('keeps category tints identical in web theme.css and Flutter product_art.dart', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../public/theme.css'), 'utf8');
    const dart = fs.readFileSync(path.join(__dirname, '../../../flutter_app/lib/utils/product_art.dart'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(webArt, 'manifest.json'), 'utf8')).tint as Record<string, string>;
    for (const [cat, hex] of Object.entries(manifest)) {
      expect(css.toLowerCase()).toContain(`--t-${cat}: ${hex.toLowerCase()}`);
      expect(dart.toLowerCase()).toContain(`'${cat}': color(0xff${hex.slice(1).toLowerCase()})`);
    }
  });
});

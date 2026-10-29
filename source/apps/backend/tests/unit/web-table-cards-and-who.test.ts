import fs from 'fs';
import path from 'path';
import vm from 'vm';

class El {
  children: El[] = []; className = ''; private text = ''; parent: El | null = null; attrs: Record<string, string> = {};
  onclick: (() => void) | null = null; value = ''; disabled = false; scrollTop = 0; scrollHeight = 0;
  constructor(readonly tag = 'div') {}
  set textContent(v: string) { this.text = v; this.children = []; }
  get textContent(): string { return this.text + this.children.map((c) => c.textContent).join(''); }
  get lastChild() { return this.children[this.children.length - 1]; }
  appendChild(c: El) { c.parent = this; this.children.push(c); return c; }
  setAttribute(n: string, v: string) { this.attrs[n] = v; }
  getAttribute(n: string) { return this.attrs[n] ?? null; }
  remove() {}
  querySelectorAll(sel: string): El[] {
    return this.children.flatMap((c) => [...(c.className.split(' ').includes(sel.slice(1)) ? [c] : []), ...c.querySelectorAll(sel)]);
  }
}

function load() {
  const els = new Map<string, El>();
  const get = (id: string) => { if (!els.has(id)) els.set(id, new El()); return els.get(id)!; };
  const document = {
    getElementById: get, createElement: (t: string) => new El(t), createElementNS: (_n: string, t: string) => new El(t),
    createTextNode: (t: string) => { const n = new El('#text'); n.textContent = t; return n; },
  };
  const i18n = { lang: 'en', t: (k: string) => k };
  const ctx: any = {
    document, window: { i18n }, console, Intl, URLSearchParams,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: () => 0, clearTimeout: () => {},
  };
  const src = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  const inst = src.replace(/\n  boot\(\);\n\}\)\(\);\s*$/, '\n  globalThis.t = { renderMarkdown: renderMarkdown, renderReceipt: renderReceipt };\n})();');
  expect(inst).not.toBe(src);
  vm.runInNewContext(inst, ctx);
  return { t: ctx.t, get };
}

describe('storefront: tables as cards, and who-did-what on the receipt', () => {
  test('a markdown table becomes one card per row, with column labels', () => {
    const { t } = load();
    const box = new El();
    t.renderMarkdown(box, '| Product | Qty | Price |\n| --- | --- | --- |\n| Toast | 2 | €17.00 |\n| Pancakes | 2 | €18.00 |');
    const cards = box.querySelectorAll('.card');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Toast');
    expect(cards[0].textContent).toContain('Qty');
    expect(cards[0].textContent).toContain('€17.00');
    expect(cards[1].textContent).toContain('Pancakes');
  });

  test('lines starting with a pipe but without a separator row stay plain text', () => {
    const { t } = load();
    const box = new El();
    t.renderMarkdown(box, '| just | a line |');
    expect(box.querySelectorAll('.card')).toHaveLength(0);
    expect(box.textContent).toContain('just');
  });

  test('the receipt always says the AI cannot move money and that the shopper paid', () => {
    const { t, get } = load();
    t.renderReceipt({ orderId: '', items: [], totalText: '€1.00', maskedId: 'X', decision: 'ALLOW', status: 'PAID' });
    const text = get('receipt').textContent;
    expect(text).toContain('who.you');
    expect(text).toContain('who.cannot');
    expect(text).not.toContain('who.ai');
  });
});

describe('storefront: receipt QR', () => {
  test('qr.js and the verify page ship with the storefront and use no inline script', () => {
    const pub = path.join(__dirname, '../../public');
    expect(fs.readFileSync(path.join(pub, 'index.html'), 'utf8')).toContain('/qr.js');
    const verify = fs.readFileSync(path.join(pub, 'verify.html'), 'utf8');
    expect(verify).toContain('src="/verify.js"');
    expect(verify).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(fs.readFileSync(path.join(pub, 'verify.js'), 'utf8')).not.toMatch(/innerHTML/);
  });

  test('the receipt still renders without the QR library (it is an extra, never a blocker)', () => {
    const { t } = load();
    expect(() => t.renderReceipt({ orderId: 'o1', items: [], totalText: '€1.00', maskedId: 'ab••ef', decision: 'AUTO_ALLOW' })).not.toThrow();
  });

  test('the share link fits a small, scannable QR code (not a dense one)', () => {
    const ctx: any = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/qr.js'), 'utf8') + '\nglobalThis.qrcode = qrcode;', ctx);
    const link = 'https://aicafe.onrender.com/verify.html#' + '0b9d6f1e-7a3c-4c52-9f0e-1d2a3b4c5d6e' + '.' + 'A'.repeat(86);
    const q = ctx.qrcode(0, 'M'); q.addData(link); q.make();
    expect(q.getModuleCount()).toBeLessThanOrEqual(65);
    expect(q.createDataURL(4, 4)).toMatch(/^data:image\/gif;base64,/);
  });
});

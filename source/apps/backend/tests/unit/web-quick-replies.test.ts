import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { extractQuickReplies } from '../../src/ai/quick-replies';

const table = '| Option | Items | Total |\n| --- | --- | --- |\n| 1️⃣ Toast | 2 toast | €17 |\n| 2️⃣ Pancakes | 2 pancakes | €18 |';

// Minimal DOM double; real app.js rendering/ask code is executed, not copied.
class Element {
  children: Element[] = [];
  parent: Element | null = null;
  attrs: Record<string, string> = {};
  className = '';
  value = '';
  disabled = false;
  scrollTop = 0;
  scrollHeight = 0;
  onclick: (() => void) | null = null;
  private text = '';
  constructor(readonly tagName = 'div') {}
  set textContent(value: string) { this.text = value; this.children = []; }
  get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
  get lastChild(): Element { return this.children[this.children.length - 1]; }
  appendChild(child: Element): Element { child.parent = this; this.children.push(child); return child; }
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  getAttribute(name: string) { return this.attrs[name] ?? null; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap((child) => [
      ...(child.className.split(' ').includes(selector.slice(1)) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}

function harness() {
  const elements = new Map<string, Element>();
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  };
  const document = {
    getElementById: get,
    createElement: (tag: string) => new Element(tag),
    createElementNS: (_ns: string, tag: string) => new Element(tag),
    createTextNode: (text: string) => { const node = new Element('#text'); node.textContent = text; return node; },
  };
  const i18n = { lang: 'en', t: (key: string) => `${i18n.lang}:${key}` };
  const context: any = {
    document, window: { i18n }, console, Intl, URLSearchParams,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: () => 0, clearTimeout: () => {},
  };
  const original = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  const instrumented = original.replace(/\n  boot\(\);\n\}\)\(\);\s*$/, `
  globalThis.testApp = { extractQuickReplies: extractQuickReplies, say: say, ask: ask,
    refreshQuickReplies: refreshQuickReplies, setApi: function (fn) { api = fn; } };
})();`);
  expect(instrumented).not.toBe(original);
  vm.runInNewContext(instrumented, context);
  return { app: context.testApp, get, i18n };
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('Issue 1: Web quick replies', () => {
  test.each([
    table,
    'Options:\n1. Toast\n2. Pancakes',
    'Seçenekler:\n1) Tost\n2) Krep',
    '**Option 1: Toast**\n**Option 2: Pancakes**',
    '1️⃣ Toast\n2️⃣ Pancakes',
    '1. Review cart\n2. Pay',
    'Options:\n1. A\n3. B',
    'Options:\n1. A\n1. B',
    'Options:\n1. A\n2. B\n3. C\n4. D\n5. E',
    '```\nOptions:\n1. A\n2. B\n```',
  ])('Web and backend parsers agree: %s', (raw) => {
    const { app } = harness();
    expect(JSON.parse(JSON.stringify(app.extractQuickReplies(raw)))).toEqual(extractQuickReplies(raw));
  });

  test('one click posts only the selected number through the existing chat path', async () => {
    const { app, get } = harness();
    let resolve!: (result: any) => void;
    const api = jest.fn((_path: string, _options: any) => new Promise((done) => { resolve = done; }));
    app.setApi(api);
    app.say('a', table);
    const buttons = get('log').querySelectorAll('.quick-reply');
    expect(buttons.map((button) => button.textContent)).toEqual(['1. Toast', '2. Pancakes']);
    expect(buttons.every((button) => !button.disabled)).toBe(true);
    buttons[1].onclick!();
    buttons[1].onclick!(); // synchronous double-click is ignored
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][0]).toBe('/api/ai/chat');
    expect(JSON.parse((api.mock.calls[0] as any)[1].body).message).toBe('2');
    expect(buttons.every((button) => button.disabled)).toBe(true);
    resolve({ response: table });
    await flush();
    const all = get('log').querySelectorAll('.quick-reply');
    expect(all.slice(0, 2).every((button) => button.disabled)).toBe(true);
    expect(all.slice(2).every((button) => !button.disabled)).toBe(true);
    buttons[0].onclick!(); // stale closure is ignored even after response
    expect(api).toHaveBeenCalledTimes(1);
  });

  test('typed follow-up invalidates old choices, including on API failure', async () => {
    const { app, get } = harness();
    const api = jest.fn().mockRejectedValue(new Error('offline'));
    app.setApi(api);
    app.say('a', table);
    const buttons = get('log').querySelectorAll('.quick-reply');
    app.ask('Something else');
    await flush();
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(get('send').disabled).toBe(false);
  });

  test('option names are text nodes, never parsed as HTML', () => {
    const { app, get } = harness();
    app.say('a', 'Options:\n1. <img src=x onerror=alert(1)>\n2. Tea');
    const button = get('log').querySelectorAll('.quick-reply')[0];
    expect(button.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(button.children).toHaveLength(0);
  });

  test('language switch refreshes hint and accessible names', () => {
    const { app, get, i18n } = harness();
    app.say('a', table);
    i18n.lang = 'tr';
    app.refreshQuickReplies();
    expect(get('log').querySelectorAll('.quick-reply-hint')[0].textContent).toBe('tr:options.hint');
    expect(get('log').querySelectorAll('.quick-reply')[0].getAttribute('aria-label')).toBe('tr:options.select 1: Toast');
  });

  test('user messages and ordinary instructions never get quick replies', () => {
    const { app, get } = harness();
    app.say('u', table);
    app.say('a', '1. Review cart\n2. Pay');
    expect(get('log').querySelectorAll('.quick-reply')).toHaveLength(0);
  });
});

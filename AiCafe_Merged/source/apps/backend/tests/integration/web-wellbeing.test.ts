/// <reference lib="dom" />
import http from 'http';
import { AddressInfo } from 'net';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createApp } from '../../src/app';
import { resetSessionState } from '../helpers/session';

jest.setTimeout(30_000);
let server: http.Server; let base = ''; const doms: JSDOM[] = [];
beforeAll(async () => { server = http.createServer(createApp()); await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { doms.forEach((d) => d.window.close()); await new Promise<void>((r) => server.close(() => r())); });
beforeEach(() => resetSessionState());

async function open(storage: Record<string, string>) {
  const dom = await JSDOM.fromURL(base + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w: any) { w.fetch = (u: string, o?: any) => fetch(new URL(u, base).toString(), o); Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v)); },
  });
  doms.push(dom); return dom;
}
async function waitFor<T>(fn: () => T | null | undefined | false, what: string, ms = 8000): Promise<T> {
  const t0 = Date.now();
  for (;;) { let v: any; try { v = fn(); } catch { v = undefined; } if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await new Promise((r) => setTimeout(r, 25)); }
}

describe('web wellbeing card', () => {
  test('shows server evaluation, unknown ingredient data and non-medical notice', async () => {
    const dom = await open({ 'aicafe.onboarded': 'true', 'aicafe.cart': JSON.stringify({ coffee: 1 }), 'aicafe.allergens': JSON.stringify(['gluten']) });
    const diet = dom.window.document.getElementById('diet') as HTMLSelectElement;
    diet.value = 'vegan'; diet.dispatchEvent(new dom.window.Event('change'));
    const box = await waitFor(() => { const b = dom.window.document.getElementById('wellbeing'); return b && !b.hidden && b.querySelector('li') && b; }, 'wellbeing card');
    const text = box.textContent || '';
    expect(text).toMatch(/UNKNOWN/i);
    expect(text).toMatch(/Missing information/i);
    expect(text).toMatch(/not medical advice/i);
    expect(text.toLowerCase()).not.toMatch(/\bsafe\b|suitable/);
    expect(dom.window.document.getElementById('wb-sample')!.textContent).toMatch(/unknown information blocks checkout/i);
  });

  test('allergen concerns are sent only through the authenticated wellbeing profile contract', async () => {
    const dom = await open({ 'aicafe.onboarded': 'true', 'aicafe.cart': JSON.stringify({ coffee: 1 }), 'aicafe.allergens': JSON.stringify(['peanuts']) });
    const sent: string[] = [];
    const orig = (dom.window as any).fetch;
    (dom.window as any).fetch = (u: string, o?: any) => { if (String(u).includes('wellbeing')) sent.push(String(o?.body || '')); return orig(u, o); };
    const diet = dom.window.document.getElementById('diet') as HTMLSelectElement;
    diet.value = 'vegetarian'; diet.dispatchEvent(new dom.window.Event('change'));
    await waitFor(() => sent.some((b) => b.includes('preferences')), 'wellbeing preferences');
    expect(sent.some((b) => b.includes('peanut'))).toBe(true);
    expect(sent.every((b) => !b.includes('diagnosis') && !b.includes('medical'))).toBe(true);
  });
});

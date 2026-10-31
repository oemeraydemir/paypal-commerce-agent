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
  test('shows sample-data labelling, local-only allergens, and never a safety claim', async () => {
    const dom = await open({ 'aicafe.onboarded': 'true', 'aicafe.cart': JSON.stringify({ coffee: 1 }), 'aicafe.allergens': JSON.stringify(['gluten']) });
    const diet = dom.window.document.getElementById('diet') as HTMLSelectElement;
    diet.value = 'vegan'; diet.dispatchEvent(new dom.window.Event('change'));
    const box = await waitFor(() => { const b = dom.window.document.getElementById('wellbeing'); return b && !b.hidden && b.querySelector('li') && b; }, 'wellbeing card');
    const text = box.textContent || '';
    expect(text).toMatch(/Sample data/i);
    expect(text).toMatch(/not verified/i);
    expect(text).toMatch(/kept on this device/i);
    expect(text).toMatch(/ask the café/i);
    expect(text.toLowerCase()).not.toMatch(/\bsafe\b|suitable|guarantee/);
    expect(dom.window.document.getElementById('wb-sample')!.textContent).toMatch(/not verified/i);
  });

  test('allergens are never sent to the server', async () => {
    const dom = await open({ 'aicafe.onboarded': 'true', 'aicafe.cart': JSON.stringify({ coffee: 1 }), 'aicafe.allergens': JSON.stringify(['peanuts']) });
    const sent: string[] = [];
    const orig = (dom.window as any).fetch;
    (dom.window as any).fetch = (u: string, o?: any) => { if (String(u).includes('wellbeing')) sent.push(String(o?.body || '')); return orig(u, o); };
    const diet = dom.window.document.getElementById('diet') as HTMLSelectElement;
    diet.value = 'vegetarian'; diet.dispatchEvent(new dom.window.Event('change'));
    await waitFor(() => sent.length > 0, 'wellbeing request');
    sent.forEach((b) => { expect(b).not.toMatch(/peanut|allerg/i); });
  });
});

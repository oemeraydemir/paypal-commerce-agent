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
  test('shows per-product merchant facts instead of raw UNKNOWN / Missing information codes', async () => {
    const dom = await open({ 'aicafe.onboarded': 'true', 'aicafe.cart': JSON.stringify({ coffee: 1 }), 'aicafe.allergens': JSON.stringify(['gluten']) });
    const diet = dom.window.document.getElementById('diet') as HTMLSelectElement;
    diet.value = 'vegan'; diet.dispatchEvent(new dom.window.Event('change'));
    const box = await waitFor(() => { const b = dom.window.document.getElementById('wellbeing'); return b && !b.hidden && b.querySelector('li.wb-item') && b; }, 'wellbeing card');
    const text = box.textContent || '';
    // Shopper-selected sensitivities and one result per product.
    expect(text).toMatch(/Sensitivities you selected/i);
    expect(text).toMatch(/Gluten/i);
    expect(text).toMatch(/Fresh Brewed Coffee/i);
    // Coffee is now labelled gluten-free (35f078f), so the card reports a
    // merchant-label result instead of missing information.
    expect(text).toMatch(/No known conflict/i);
    expect(text).toMatch(/The merchant data shows no known Gluten conflict/i);
    // Ingredient facts and cross-contact stay separate; source + limits are shown.
    expect(text).toMatch(/Cross-contact information is not available/i);
    expect(text).toMatch(/Based on the menu information provided by the business/i);
    expect(text).toMatch(/Menu data version/i);
    expect(text).toMatch(/not medical advice/i);
    // No machine codes and no unverified safety verdict.
    expect(text).not.toMatch(/UNKNOWN|Missing information|allergen:gluten|dietary:vegan/i);
    expect(text.toLowerCase()).not.toMatch(/\bsafe\b|suitable|allergen-free|gluten-free product/);
    expect(dom.window.document.getElementById('wb-sample')!.textContent).toMatch(/unknown information blocks checkout/i);

    // A product with no merchant data still gets the honest "cannot verify" wording,
    // never a "safe" verdict and never a raw machine code.
    const unknownDom = await open({ 'aicafe.onboarded': 'true', 'aicafe.cart': JSON.stringify({ latte: 1 }), 'aicafe.allergens': JSON.stringify(['gluten']) });
    const unknownBox = await waitFor(() => { const b = unknownDom.window.document.getElementById('wellbeing'); return b && !b.hidden && b.querySelector('li.wb-item') && b; }, 'wellbeing card with missing data');
    const unknownText = unknownBox.textContent || '';
    expect(unknownText).toMatch(/Gluten information is missing; we cannot verify suitability/i);
    expect(unknownText).not.toMatch(/UNKNOWN|Missing information|allergen:gluten/i);
  });

  test('a confirmed merchant ingredient conflict is attributed to the menu text, and the remove action works', async () => {
    const dom = await open({ 'aicafe.onboarded': 'true', 'aicafe.cart': JSON.stringify({ veg_breakfast: 1 }), 'aicafe.allergens': JSON.stringify(['gluten']) });
    const box = await waitFor(() => { const b = dom.window.document.getElementById('wellbeing'); return b && !b.hidden && b.querySelector('li.wb-item') && b; }, 'wellbeing card with facts');
    const text = box.textContent || '';
    expect(text).toMatch(/The merchant information names Gluten: toast, granola/i);
    expect(text).toMatch(/Cross-contact information is not available/i);
    expect(text).not.toMatch(/UNKNOWN|Missing information|allergen:gluten/i);
    const remove = box.querySelector('button.wb-action') as HTMLButtonElement;
    expect(remove.textContent).toMatch(/Remove from cart/i);
    remove.click();
    await waitFor(() => { const b = dom.window.document.getElementById('wellbeing'); return b && b.hidden; }, 'wellbeing card hidden after removal');
    expect(JSON.parse(dom.window.localStorage.getItem('aicafe.cart') || '{}')).toEqual({});
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

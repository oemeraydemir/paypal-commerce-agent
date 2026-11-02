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

async function open(cart: Record<string, number>) {
  const dom = await JSDOM.fromURL(base + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w: any) {
      w.fetch = (u: string, o?: any) => fetch(new URL(u, base).toString(), o);
      w.localStorage.setItem('aicafe.onboarded', 'true');
      w.localStorage.setItem('aicafe.cart', JSON.stringify(cart));
    },
  });
  doms.push(dom); return dom;
}
async function waitFor<T>(fn: () => T | null | undefined | false, what: string, ms = 8000): Promise<T> {
  const t0 = Date.now();
  for (;;) { let v: any; try { v = fn(); } catch { v = undefined; } if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await new Promise((r) => setTimeout(r, 25)); }
}
const card = (d: JSDOM) => d.window.document.getElementById('policy') as HTMLElement;

describe('spending mandate card', () => {
  test('shows limit, scope, current cart, remaining allowance and the no-raise rules', async () => {
    const d = await open({ coffee: 2 }); // €6.00 of €20.00
    await waitFor(() => /Remaining allowance/.test(card(d).textContent || ''), 'mandate card');
    const text = card(d).textContent || '';
    expect(text).toMatch(/Spending allowance/);
    expect(text).toMatch(/Limit per order\s*€20\.00/);
    expect(text).toMatch(/menu only/i);
    expect(text).toMatch(/Current cart\s*€6\.00/);
    expect(text).toMatch(/Remaining allowance\s*€14\.00/);
    expect(text).toMatch(/Within your allowance/);
    expect(text).toMatch(/cannot be changed by the AI/);
    expect(text).toMatch(/Splitting does not raise it/);
    expect(text).toMatch(/not a payment/i);
  });

  test('above the approval threshold the status asks for explicit approval', async () => {
    const d = await open({ coffee: 4 }); // €12.00 > €10.00
    await waitFor(() => /Needs your explicit approval/.test(card(d).textContent || ''), 'reconfirm status');
  });

  test('over the limit it says stopped / nothing charged and the pay buttons are disabled', async () => {
    const d = await open({ coffee: 8 }); // €24.00 > €20.00
    await waitFor(() => /Over your allowance/.test(card(d).textContent || ''), 'exceeded status');
    expect(card(d).textContent).toMatch(/over by\s*€4\.00/);
    await waitFor(() => (d.window.document.getElementById('pay') as HTMLButtonElement).disabled && (d.window.document.getElementById('split-open') as HTMLButtonElement).disabled, 'buttons disabled');
  });

  test('the split dialog states that the limit applies to the whole order before splitting', async () => {
    const d = await open({ coffee: 2 });
    await waitFor(() => /Remaining allowance/.test(card(d).textContent || ''), 'mandate card');
    const btn = await waitFor(() => { const b = d.window.document.getElementById('split-open') as HTMLButtonElement; return !b.disabled && b; }, 'split enabled');
    btn.click();
    const line = (d.window.document.getElementById('split-mandate') as HTMLElement).textContent || '';
    expect(line).toMatch(/€20\.00 applies to the whole €6\.00 order/);
    expect(line).toMatch(/does not raise it/);
    expect(line).toMatch(/own share in PayPal/);
  });

  test('"How this order works" discloses the AI role, server pricing, sandbox and refund path', async () => {
    const d = await open({});
    const how = d.window.document.getElementById('how') as HTMLElement;
    const t = how.textContent || '';
    expect(t).toMatch(/cannot approve or make a payment/);
    expect(t).toMatch(/calculated by the server/);
    expect(t).toMatch(/no real money is charged/);
    expect(t).toMatch(/refund/i);
    expect(t).toMatch(/not verified by the café/);
  });
});

describe('purchase impact inside the mandate card', () => {
  test('shows the per-person amounts if the cart were split, and no refund row before any refund', async () => {
    const d = await open({ coffee: 2 }); // EUR 6.00
    await waitFor(() => /If split between 2/.test(card(d).textContent || ''), 'impact rows');
    const text = card(d).textContent || '';
    expect(text).toMatch(/If split between 2\s*€3\.00 each/);
    expect(text).toMatch(/If split between 3\s*€2\.00 each/);
    expect(text).not.toMatch(/Refunded so far/);
    // one card only: the impact rows live in the existing mandate card
    expect(d.window.document.querySelectorAll('.pbox').length).toBe(1);
  });

  test('the limit shown stays the whole-order limit whatever the split', async () => {
    const d = await open({ coffee: 1, croissant: 1 });
    await waitFor(() => /If split between 3/.test(card(d).textContent || ''), 'impact rows');
    const text = card(d).textContent || '';
    expect(text).toMatch(/Limit per order\s*€20\.00/);
  });
});

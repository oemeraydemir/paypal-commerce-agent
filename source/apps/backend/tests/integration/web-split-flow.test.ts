/// <reference lib="dom" />
/**
 * Web Split Bill, end to end through the REAL client code (public/app.js, public/split.js,
 * public/qr.js) running in jsdom against the REAL Express app over HTTP.
 *
 * Mocked: the PayPal client (no network). Real: routing, sessions, policy, bill service,
 * order pipeline, the storefront checkout option, the invite QR and the split room page.
 * Browser navigation to PayPal itself is not simulated; the test checks what the page
 * stored right before navigating and then re-opens the page the way PayPal's return does.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { resetSessionState } from '../helpers/session';
import { BillService } from '../../src/bills/service';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), getOrder: jest.fn() },
}));
const createOrder = paypalClient.createOrder as jest.Mock;
const captureOrder = paypalClient.captureOrder as jest.Mock;

jest.setTimeout(60_000);

let server: http.Server;
let base = '';
const doms: JSDOM[] = [];
let ppSeq = 0;
let capSeq = 0;

beforeAll(async () => {
  server = http.createServer(createApp());
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  doms.forEach((d) => d.window.close());
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  resetSessionState();
  BillService.getInstance().reset();
  ppSeq = 0;
  capSeq = 0;
  createOrder.mockReset().mockImplementation(async () => ({
    id: `PP-${++ppSeq}`,
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://paypal.test/approve' }],
  }));
  captureOrder.mockReset().mockImplementation(async () => ({
    id: `PP-${ppSeq}`,
    status: 'COMPLETED',
    purchaseUnits: [
      { payments: { captures: [{ id: `CAP-${++capSeq}`, status: 'COMPLETED', amount: { value: '2.00', currency_code: 'EUR' } }] } },
    ],
  }));
});

async function open(path: string, storage: Record<string, string> = {}): Promise<JSDOM> {
  const dom = await JSDOM.fromURL(base + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(), // "navigation not implemented" etc. stay silent
    beforeParse(window: any) {
      window.fetch = (u: string, o?: any) => fetch(new URL(u, base).toString(), o);
      Object.entries(storage).forEach(([k, v]) => window.localStorage.setItem(k, v));
    },
  });
  doms.push(dom);
  return dom;
}

async function waitFor<T>(fn: () => T | undefined | null | false, what: string, ms = 8000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    let v: any;
    try { v = fn(); } catch { v = undefined; }
    if (v) return v as T;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
const q = (d: JSDOM, sel: string) => d.window.document.querySelector(sel) as HTMLElement | null;
const qa = (d: JSDOM, sel: string) => Array.from(d.window.document.querySelectorAll(sel)) as HTMLElement[];
const ls = (d: JSDOM, k: string) => d.window.localStorage.getItem(k);
const cartJson = JSON.stringify({ coffee: 2 }); // 2 × €3.00 = €6.00 → €2.00 each for 3 people
const base0 = { 'aicafe.onboarded': 'true', 'aicafe.cart': cartJson };

describe('web Split Bill (jsdom + real server)', () => {
  test('full 3-person flow: checkout option → QR invites → joins → every share paid → settled', async () => {
    // 1) Storefront: the Split option sits next to the normal PayPal button.
    const shop = await open('/', base0);
    const splitBtn = await waitFor(() => { const b = q(shop, '#split-open') as HTMLButtonElement; return b && !b.disabled && b; }, 'split button enabled');
    expect(q(shop, '#pay')).not.toBeNull(); // the normal checkout is untouched
    splitBtn.click();
    expect((q(shop, '#split-modal') as HTMLElement).hidden).toBe(false);

    // 2) Choose 3 people: the preview shows 3 equal shares (display-only; the server decides).
    const seg3 = qa(shop, '#split-people button').find((b) => b.textContent!.startsWith('3'))!;
    seg3.click();
    expect(qa(shop, '#split-preview .kv')).toHaveLength(4); // total + 3 people
    q(shop, '#split-go')!.click();
    q(shop, '#split-go')!.click(); // a double click must not create two bills
    const active = await waitFor(() => ls(shop, 'aicafe.split.active'), 'active bill stored');
    const billId = JSON.parse(active).billId as string;
    await new Promise((r) => setTimeout(r, 150));
    expect(BillService.getInstance()['groups'].size).toBe(1);
    const ownerStore = { 'aicafe.session': ls(shop, 'aicafe.session')!, 'aicafe.split.active': active, 'aicafe.cart': cartJson };

    // 3) The same cart can no longer be paid whole (guard) while the split is active.
    const shop2 = await open('/', { ...base0, ...ownerStore });
    await waitFor(() => { const b = q(shop2, '#pay') as HTMLButtonElement; return b && !b.disabled; }, 'pay enabled');
    q(shop2, '#pay')!.click();
    await waitFor(() => (q(shop2, '#banner')?.textContent || '').includes('already being split'), 'guard banner');

    // 4) Organiser room: three shares, QR invite, joined/paid are separate states.
    const room = await open(`/split#b=${billId}`, ownerStore);
    await waitFor(() => qa(room, '.share').length === 3, 'three shares');
    expect(qa(room, '.chip.open')).toHaveLength(2);
    await waitFor(() => q(room, '.invite img'), 'invite QR image');
    const inviteUrl = JSON.parse(room.window.sessionStorage.getItem(`aicafe.split.invite.${billId}`)!).url as string;
    expect(inviteUrl.startsWith(`${base}/join#t=`)).toBe(true);
    expect(inviteUrl).not.toMatch(/session|bearer/i); // a QR never carries session material

    // 5) Guest 1 scans the QR in a fresh browser: joins, sees own share, token leaves the URL.
    const g1 = await open(inviteUrl.replace(base, ''));
    await waitFor(() => q(g1, '.share.mine'), 'guest share');
    expect(g1.window.location.hash.startsWith('#b=')).toBe(true);
    expect(g1.window.location.hash).not.toContain('t=');
    expect(q(g1, '.share.mine .chip')!.className).toContain('joined');

    // The same QR in another browser is refused (single use).
    const reuse = await open(inviteUrl.replace(base, ''));
    await waitFor(() => (q(reuse, '#status')?.textContent || '').includes('already used'), 'single-use message');

    // 6) Guest 1 pays: the page stores the pending order, then PayPal returns to the room.
    const payBtn = await waitFor(() => qa(g1, 'button').find((b) => /Pay my share/.test(b.textContent || '')), 'pay button');
    payBtn.click();
    const pend = await waitFor(() => ls(g1, 'aicafe.pending'), 'pending payment stored');
    expect(JSON.parse(pend)).toMatchObject({ billId });
    expect(createOrder).toHaveBeenCalledTimes(1);
    const guest1Store = { 'aicafe.session': ls(g1, 'aicafe.session')!, 'aicafe.pending': pend, 'aicafe.split.active': ls(g1, 'aicafe.split.active')! };
    const back = await open(`/split#b=${billId}&return=1`, guest1Store);
    const confirm = await waitFor(() => qa(back, 'button').find((b) => /Confirm my payment/.test(b.textContent || '')), 'confirm button');
    confirm.click();
    await waitFor(() => q(back, '.share.mine .chip.paid'), 'guest 1 paid');
    expect(ls(back, 'aicafe.pending')).toBeNull();

    // 7) The organiser's QR rotates to a fresh invite for the next person; guest 2 joins + pays.
    const inv2 = await open(`/split#b=${billId}`, ownerStore);
    await waitFor(() => qa(inv2, '.share').length === 3, 'organiser room again');
    await waitFor(() => q(inv2, '.invite img'), 'organiser invite');
    const url2 = JSON.parse(inv2.window.sessionStorage.getItem(`aicafe.split.invite.${billId}`)!).url as string;
    const g2 = await open(url2.replace(base, ''));
    await waitFor(() => q(g2, '.share.mine'), 'guest 2 share');
    (await waitFor(() => qa(g2, 'button').find((b) => /Pay my share/.test(b.textContent || '')), 'pay 2')).click();
    const pend2 = await waitFor(() => ls(g2, 'aicafe.pending'), 'pending 2');
    const back2 = await open(`/split#b=${billId}&return=1`, { 'aicafe.session': ls(g2, 'aicafe.session')!, 'aicafe.pending': pend2, 'aicafe.split.active': ls(g2, 'aicafe.split.active')! });
    (await waitFor(() => qa(back2, 'button').find((b) => /Confirm my payment/.test(b.textContent || '')), 'confirm 2')).click();
    await waitFor(() => q(back2, '.share.mine .chip.paid'), 'guest 2 paid');

    // 8) Organiser pays the last share → the bill settles and the cart is cleared.
    const own = await open(`/split#b=${billId}`, ownerStore);
    (await waitFor(() => qa(own, 'button').find((b) => /Pay my share/.test(b.textContent || '')), 'owner pay')).click();
    const pend3 = await waitFor(() => ls(own, 'aicafe.pending'), 'pending owner');
    const done = await open(`/split#b=${billId}&return=1`, { ...ownerStore, 'aicafe.pending': pend3 });
    (await waitFor(() => qa(done, 'button').find((b) => /Confirm my payment/.test(b.textContent || '')), 'confirm owner')).click();
    await waitFor(() => q(done, '.success'), 'settled banner');
    expect(qa(done, '.chip.paid')).toHaveLength(3);
    expect(JSON.parse(ls(done, 'aicafe.cart') || 'null')).toBeNull();
    expect(ls(done, 'aicafe.split.active')).toBeNull();
    expect(captureOrder).toHaveBeenCalledTimes(3);
  });

  test('organiser can cancel an untouched split; the cart can then be paid normally again', async () => {
    const shop = await open('/', base0);
    (await waitFor(() => { const b = q(shop, '#split-open') as HTMLButtonElement; return b && !b.disabled && b; }, 'split enabled')).click();
    q(shop, '#split-go')!.click();
    const active = await waitFor(() => ls(shop, 'aicafe.split.active'), 'active');
    const billId = JSON.parse(active).billId as string;
    const room = await open(`/split#b=${billId}`, { 'aicafe.session': ls(shop, 'aicafe.session')!, 'aicafe.split.active': active });
    room.window.confirm = () => true;
    (await waitFor(() => qa(room, 'button').find((b) => /Cancel split bill/.test(b.textContent || '')), 'cancel button')).click();
    await waitFor(() => (q(room, '#room')?.textContent || '').includes('cancelled'), 'cancelled state');
    expect(ls(room, 'aicafe.split.active')).toBeNull();
  });

  test('a split above the spending policy is refused in the storefront, like normal checkout', async () => {
    const shop = await open('/', { 'aicafe.onboarded': 'true', 'aicafe.cart': JSON.stringify({ coffee: 12 }) }); // €36 > €20 limit
    await waitFor(() => qa(shop, '#cart .item').length === 1, 'cart rendered');
    await new Promise((r) => setTimeout(r, 400)); // let the policy preview settle
    const btn = q(shop, '#split-open') as HTMLButtonElement;
    if (!btn.disabled) {
      btn.click();
      q(shop, '#split-go')!.click();
      await waitFor(() => !(q(shop, '#split-err') as HTMLElement).hidden, 'policy error shown');
    }
    expect(ls(shop, 'aicafe.split.active')).toBeNull();
  });
});

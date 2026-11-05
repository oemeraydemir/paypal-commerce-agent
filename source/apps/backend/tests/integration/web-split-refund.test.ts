/// <reference lib="dom" />
/**
 * Cross-feature guarantee: after a Split Bill share is paid (its own normal PayPal
 * order, owned by the participant's session), the customer can request a refund of
 * that share just like any other paid order, and a merchant can approve it.
 *
 * The split is driven through the REAL storefront code (public/app.js + public/split.js)
 * in jsdom against the REAL Express app; refund then goes through the customer refund-request
 * route (same one the Flutter receipt calls) and the merchant approval route.
 */
import http from 'http';
import { AddressInfo } from 'net';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { refundService } from '../../src/refunds/service';
import { resetRefundRouteState } from '../../src/routes/refunds';
import { resetRefundRequestRouteState } from '../../src/routes/refund-requests';
import { resetSessionState } from '../helpers/session';
import { BillService } from '../../src/bills/service';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
    getOrder: jest.fn(),
    getCapture: jest.fn(),
    refundCapture: jest.fn(),
    getRefund: jest.fn(),
  },
}));
const createOrder = paypalClient.createOrder as jest.Mock;
const captureOrder = paypalClient.captureOrder as jest.Mock;
const getCapture = paypalClient.getCapture as jest.Mock;
const refundCapture = paypalClient.refundCapture as jest.Mock;

const KEY = 'merchant-key-0123456789';
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
  process.env.OPS_COPILOT_KEY = KEY;
  resetSessionState();
  BillService.getInstance().reset();
  refundService.reset();
  resetRefundRouteState();
  resetRefundRequestRouteState();
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
  getCapture.mockReset().mockResolvedValue({
    id: 'CAP-1',
    status: 'COMPLETED',
    amount: { currencyCode: 'EUR', value: '2.00' },
    sellerPayableBreakdown: { totalRefundedAmount: { currencyCode: 'EUR', value: '0.00' } },
  });
  refundCapture.mockReset().mockResolvedValue({ id: 'RF-1', status: 'COMPLETED' });
});

async function open(path: string, storage: Record<string, string> = {}): Promise<JSDOM> {
  const dom = await JSDOM.fromURL(base + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
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
const cartJson = JSON.stringify({ coffee: 2 }); // €6.00 → €2.00/share for 3 people
const base0 = { 'aicafe.onboarded': 'true', 'aicafe.cart': cartJson };

test('a paid split share can be refunded by the participant and approved by the merchant', async () => {
  // 1) Owner picks a 3-way split in the storefront; a bill is created.
  const shop = await open('/', base0);
  const splitBtn = await waitFor(() => { const b = q(shop, '#split-open') as HTMLButtonElement; return b && !b.disabled && b; }, 'split button enabled');
  splitBtn.click();
  const seg3 = qa(shop, '#split-people button').find((b) => b.textContent!.startsWith('3'))!;
  seg3.click();
  q(shop, '#split-go')!.click();
  const active = await waitFor(() => ls(shop, 'aicafe.split.active'), 'active bill');
  const billId = JSON.parse(active).billId as string;
  const ownerStore = { 'aicafe.session': ls(shop, 'aicafe.session')!, 'aicafe.split.active': active, 'aicafe.cart': cartJson };

  // 2) Guest joins via the single-use invite and pays their share.
  const room = await open(`/split#b=${billId}`, ownerStore);
  await waitFor(() => q(room, '.invite img'), 'invite QR image');
  const inviteUrl = JSON.parse(room.window.sessionStorage.getItem(`aicafe.split.invite.${billId}`)!).url as string;
  const guest = await open(inviteUrl.replace(base, ''));
  await waitFor(() => q(guest, '.share.mine'), 'guest share');
  expect(q(guest, '.share.mine .chip')!.className).toContain('joined');
  const payBtn = await waitFor(() => qa(guest, 'button').find((b) => /Pay my share/.test(b.textContent || '')), 'pay button');
  payBtn.click();
  const pend = await waitFor(() => ls(guest, 'aicafe.pending'), 'pending payment');
  const shareOrderId = (JSON.parse(pend) as { orderId: string }).orderId;
  const guestSession = ls(guest, 'aicafe.session')!;
  const guestStore = { 'aicafe.session': guestSession, 'aicafe.pending': pend, 'aicafe.split.active': ls(guest, 'aicafe.split.active')! };
  const back = await open(`/split#b=${billId}&return=1`, guestStore);
  const confirm = await waitFor(() => qa(back, 'button').find((b) => /Confirm and pay now/.test(b.textContent || '')), 'confirm button');
  confirm.click();
  await waitFor(() => q(back, '.share.mine .chip.paid'), 'guest share paid');

  // 3) The participant requests a refund of their own share order.
  const gh = { 'X-Session-Id': JSON.parse(guestSession).id, Authorization: `Bearer ${JSON.parse(guestSession).token}`, 'Content-Type': 'application/json' };
  const rr = await fetch(`${base}/api/orders/${shareOrderId}/refund-request`, {
    method: 'POST',
    headers: gh,
    body: JSON.stringify({ reason: 'changed_mind', note: 'No longer need my share' }),
  });
  expect(rr.status).toBe(201);
  const rrBody = await rr.json();
  expect(rrBody.status).toBe('UNDER_REVIEW');

  // A different session cannot refund someone else's share (IDOR guard).
  const other = await (await fetch(base + '/api/sessions', { method: 'POST' })).json();
  const otherH = { 'X-Session-Id': other.sessionId, Authorization: `Bearer ${other.sessionToken}`, 'Content-Type': 'application/json' };
  const forbidden = await fetch(`${base}/api/orders/${shareOrderId}/refund-request`, {
    method: 'POST',
    headers: otherH,
    body: JSON.stringify({ reason: 'other' }),
  });
  expect(forbidden.status).toBe(404);

  // 4) Merchant approves → the refund completes.
  const [rf] = refundService.list();
  expect(rf.proposedBy).toBe('CUSTOMER');
  expect(rf.orderId).toBe(shareOrderId);
  const ok = await fetch(`${base}/api/refunds/${rf.id}/approve`, { method: 'POST', headers: { 'X-Ops-Key': KEY } });
  expect(ok.status).toBe(200);
  expect(refundCapture).toHaveBeenCalledTimes(1);

  const status = await (await fetch(`${base}/api/orders/${shareOrderId}/refund-status`, { headers: gh })).json();
  expect(status.refunds.some((r: any) => r.status === 'REFUNDED')).toBe(true);
});

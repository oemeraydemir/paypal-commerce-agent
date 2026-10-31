/// <reference lib="dom" />
/**
 * Customer refund request through the real storefront: pay (PayPal mocked) → receipt →
 * "Problem with this order?" → request → merchant approves → the customer sees REFUNDED.
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

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn(), refundCapture: jest.fn(), getRefund: jest.fn(), getCapture: jest.fn() },
}));
const KEY = 'merchant-key-0123456789';
jest.setTimeout(40_000);
let server: http.Server; let base = ''; const doms: JSDOM[] = [];
beforeAll(async () => { server = http.createServer(createApp()); await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterAll(async () => { doms.forEach((d) => d.window.close()); await new Promise<void>((r) => server.close(() => r())); });
beforeEach(() => {
  process.env.OPS_COPILOT_KEY = KEY;
  resetSessionState(); refundService.reset(); resetRefundRouteState(); resetRefundRequestRouteState();
  (paypalClient.createOrder as jest.Mock).mockReset().mockResolvedValue({ id: 'PP-1', status: 'CREATED', links: [{ rel: 'approve', href: 'https://paypal.test/a' }] });
  (paypalClient.captureOrder as jest.Mock).mockReset().mockResolvedValue({
    id: 'PP-1', status: 'COMPLETED',
    purchaseUnits: [{ payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED', amount: { value: '3.00', currency_code: 'EUR' } }] } }],
  });
  (paypalClient.refundCapture as jest.Mock).mockReset().mockResolvedValue({ id: 'RF-1', status: 'COMPLETED' });
});

async function waitFor<T>(fn: () => T | null | undefined | false, what: string, ms = 8000): Promise<T> {
  const t0 = Date.now();
  for (;;) { let v: any; try { v = fn(); } catch { v = undefined; } if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await new Promise((r) => setTimeout(r, 25)); }
}

test('shopper requests a refund from the receipt and sees the merchant decision', async () => {
  const s = await (await fetch(base + '/api/sessions', { method: 'POST' })).json();
  const h = { 'X-Session-Id': s.sessionId, Authorization: `Bearer ${s.sessionToken}`, 'Content-Type': 'application/json' };
  const created = await (await fetch(base + '/api/orders/create', { method: 'POST', headers: { ...h, 'Idempotency-Key': 'k-refund-1' }, body: JSON.stringify({ items: [{ productId: 'coffee', quantity: 1 }] }) })).json();
  expect(created.orderId).toBeTruthy();

  const dom = await JSDOM.fromURL(`${base}/?paypal=success&token=${created.paypalOrderId}`, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    beforeParse(w: any) {
      w.fetch = (u: string, o?: any) => fetch(new URL(u, base).toString(), o);
      w.localStorage.setItem('aicafe.onboarded', 'true');
      w.localStorage.setItem('aicafe.session', JSON.stringify({ id: s.sessionId, token: s.sessionToken }));
      w.localStorage.setItem('aicafe.pending', JSON.stringify({ orderId: created.orderId, paypalOrderId: created.paypalOrderId, total: created.totalFormatted }));
    },
  });
  doms.push(dom);
  const doc = dom.window.document;
  const q = (sel: string) => doc.querySelector(sel) as HTMLElement | null;
  const btn = (re: RegExp) => Array.from(doc.querySelectorAll('button')).find((b) => re.test(b.textContent || '')) as HTMLButtonElement | undefined;

  (await waitFor(() => btn(/Confirm/i), 'confirm button')).click();
  const req = await waitFor(() => btn(/Request refund/i), 'refund request button');
  expect(doc.body.textContent).toMatch(/nothing is refunded automatically/i);
  (doc.querySelector('select[aria-label="Reason"]') as HTMLSelectElement).value = 'wrong_item';
  req.click();
  await waitFor(() => /Under review by the café/.test(doc.body.textContent || ''), 'under review status');
  expect(btn(/Request refund/i)).toBeUndefined(); // one open request per order

  const [rf] = refundService.list();
  expect(rf.proposedBy).toBe('CUSTOMER');
  const ok = await fetch(`${base}/api/refunds/${rf.id}/approve`, { method: 'POST', headers: { 'X-Ops-Key': KEY } });
  expect(ok.status).toBe(200);

  (await waitFor(() => btn(/Check status/i), 'check status')).click();
  await waitFor(() => /Refunded/.test(doc.body.textContent || ''), 'refunded status');
  expect(q('#receipt')).not.toBeNull();
});

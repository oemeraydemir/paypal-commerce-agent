import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { createApp } from '../../src/app';
import { paypalClient } from '../../src/paypal/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { resetAutomationStatsForTests } from '../../src/automation/emitter';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: { createOrder: jest.fn(), captureOrder: jest.fn() },
}));

const mockCreateOrder = paypalClient.createOrder as jest.Mock;
const mockCaptureOrder = paypalClient.captureOrder as jest.Mock;
const app = createApp();

const events: any[] = [];
let server: http.Server;
let sess: TestSession;

beforeAll(async () => {
  process.env.AUTOMATION_ALLOW_LOCAL_TARGETS = 'true'; // loopback test receiver; refused in production
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      events.push(JSON.parse(body));
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.AUTOMATION_WEBHOOK_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});

afterAll(async () => {
  delete process.env.AUTOMATION_ALLOW_LOCAL_TARGETS;
  delete process.env.AUTOMATION_WEBHOOK_URL;
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(async () => {
  events.length = 0;
  resetAutomationStatsForTests();
  resetSessionState();
  sess = await newSession(app);
  mockCreateOrder.mockReset();
  mockCaptureOrder.mockReset();
  mockCreateOrder.mockResolvedValue({
    id: 'AUTO_PP_ORDER',
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/mock-approve' }],
  });
  mockCaptureOrder.mockResolvedValue(captureFor('3.00'));
});

// A real PayPal capture carries the captured amount and currency; the settlement gate requires them.
function captureFor(value: string) {
  return {
    id: 'AUTO_PP_ORDER',
    status: 'COMPLETED',
    purchaseUnits: [
      {
        payments: {
          captures: [{ id: 'AUTO_CAPTURE_ID', status: 'COMPLETED', amount: { value, currency_code: 'EUR' } }],
        },
      },
    ],
  };
}

async function waitFor(pred: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
}

describe('automation hooks', () => {
  test('a captured payment announces order.paid exactly once, without secrets', async () => {
    mockCaptureOrder.mockResolvedValue(captureFor('6.00')); // this test buys two items (6.00)
    const created = await request(app)
      .post('/api/orders/create').set(sess.headers).set('Idempotency-Key', 'auto-paid-1')
      .send({ items: [{ productId: 'coffee', quantity: 2 }] });
    expect(created.status).toBe(201);
    const cap = await request(app).post(`/api/orders/${created.body.orderId}/capture`).set(sess.headers);
    expect(cap.status).toBe(200);
    await waitFor(() => events.length >= 1);
    // A second capture is refused and must not announce again.
    await request(app).post(`/api/orders/${created.body.orderId}/capture`).set(sess.headers);
    await new Promise((r) => setTimeout(r, 150));

    const paid = events.filter((e) => e.type === 'order.paid');
    expect(paid).toHaveLength(1);
    expect(paid[0].data).toMatchObject({ orderId: created.body.orderId, totalMinor: 600, currency: 'EUR', itemCount: 2 });
    const raw = JSON.stringify(paid[0]);
    expect(raw).not.toContain(sess.token);
    expect(raw).not.toContain(sess.sessionId);
    expect(raw).not.toContain('AUTO_CAPTURE_ID');
  });

  test('a policy BLOCK announces order.policy_blocked and still answers 403', async () => {
    const res = await request(app)
      .post('/api/orders/create').set(sess.headers).set('Idempotency-Key', 'auto-block-1')
      .send({ items: [{ productId: 'coffee', quantity: 8 }] });
    expect(res.status).toBe(403);
    await waitFor(() => events.length >= 1);
    expect(events.map((e) => e.type)).toEqual(['order.policy_blocked']);
    expect(events[0].data).toMatchObject({ totalMinor: 2400, decision: 'BLOCK' });
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  test('a dead receiver never changes the payment outcome', async () => {
    const saved = process.env.AUTOMATION_WEBHOOK_URL;
    process.env.AUTOMATION_WEBHOOK_URL = 'http://127.0.0.1:9/hook';
    try {
      const created = await request(app)
        .post('/api/orders/create').set(sess.headers).set('Idempotency-Key', 'auto-dead-1')
        .send({ items: [{ productId: 'coffee', quantity: 1 }] });
      const cap = await request(app).post(`/api/orders/${created.body.orderId}/capture`).set(sess.headers);
      expect(cap.status).toBe(200);
      expect(cap.body.status).toBe('PAID');
      await new Promise((r) => setTimeout(r, 700)); // let the failed delivery (2 attempts) finish before teardown
    } finally {
      process.env.AUTOMATION_WEBHOOK_URL = saved;
    }
  });
});

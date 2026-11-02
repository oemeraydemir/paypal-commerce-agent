import http from 'http';
import { AddressInfo } from 'net';
import {
  automationStats,
  emitAutomationEvent,
  resetAutomationStatsForTests,
  signAutomationPayload,
} from '../../src/automation/emitter';

interface Hit { headers: http.IncomingHttpHeaders; body: string }

function receiver(statusFor: (n: number) => number) {
  const hits: Hit[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push({ headers: req.headers, body });
      res.statusCode = statusFor(hits.length);
      res.end('ok');
    });
  });
  return new Promise<{ url: string; hits: Hit[]; close: () => Promise<void> }>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`,
        hits,
        close: () => new Promise((r) => server.close(() => r())),
      })
    )
  );
}

beforeEach(() => {
  resetAutomationStatsForTests();
  delete process.env.AUTOMATION_WEBHOOK_URL;
  delete process.env.AUTOMATION_WEBHOOK_SECRET;
  process.env.AUTOMATION_ALLOW_LOCAL_TARGETS = 'true'; // tests talk to a loopback receiver
});

afterAll(() => {
  delete process.env.AUTOMATION_ALLOW_LOCAL_TARGETS;
});

describe('automation events', () => {
  test('without a URL nothing is sent and nothing throws', async () => {
    await expect(emitAutomationEvent('order.paid', { orderId: 'x' })).resolves.toBeUndefined();
    expect(automationStats()).toMatchObject({ enabled: false, sent: 0, failed: 0 });
  });

  test('a signed JSON envelope is delivered with business facts only', async () => {
    const r = await receiver(() => 200);
    process.env.AUTOMATION_WEBHOOK_URL = r.url;
    process.env.AUTOMATION_WEBHOOK_SECRET = 'a-long-enough-test-secret';
    await emitAutomationEvent('order.paid', { orderId: 'ord_1', totalMinor: 1300, currency: 'EUR' });
    await r.close();
    expect(r.hits).toHaveLength(1);
    const { headers, body } = r.hits[0];
    const env = JSON.parse(body);
    expect(env).toMatchObject({ type: 'order.paid', data: { orderId: 'ord_1', totalMinor: 1300 } });
    expect(env.id).toMatch(/^evt_/);
    expect(headers['x-aicafe-event']).toBe('order.paid');
    const ts = headers['x-aicafe-timestamp'] as string;
    expect(ts).toMatch(/^\d+$/);
    expect(headers['x-aicafe-signature']).toBe(signAutomationPayload(body, ts, 'a-long-enough-test-secret'));
    expect(automationStats()).toMatchObject({ enabled: true, sent: 1, failed: 0 });
  });

  test('a 5xx is retried once; a 4xx is not', async () => {
    const flaky = await receiver((n) => (n === 1 ? 503 : 200));
    process.env.AUTOMATION_WEBHOOK_URL = flaky.url;
    await emitAutomationEvent('refund.completed', { orderId: 'o' });
    await flaky.close();
    expect(flaky.hits).toHaveLength(2);
    expect(automationStats().sent).toBe(1);

    resetAutomationStatsForTests();
    const bad = await receiver(() => 400);
    process.env.AUTOMATION_WEBHOOK_URL = bad.url;
    await emitAutomationEvent('order.policy_blocked', {});
    await bad.close();
    expect(bad.hits).toHaveLength(1);
    expect(automationStats()).toMatchObject({ sent: 0, failed: 1, lastStatus: 400 });
  });

  test('an unreachable receiver is counted as failed and never throws', async () => {
    process.env.AUTOMATION_WEBHOOK_URL = 'http://127.0.0.1:9/hook';
    await expect(emitAutomationEvent('order.paid', {})).resolves.toBeUndefined();
    expect(automationStats()).toMatchObject({ failed: 1, lastStatus: 'error' });
  });

  test('plain http to a non-local host is refused (https only)', async () => {
    process.env.AUTOMATION_WEBHOOK_URL = 'http://example.com/hook';
    expect(automationStats().enabled).toBe(false);
  });

  test('a dedupeKey announces once per process and gives a stable event id', async () => {
    const r = await receiver(() => 200);
    process.env.AUTOMATION_WEBHOOK_URL = r.url;
    await emitAutomationEvent('order.paid', { orderId: 'o1' }, { dedupeKey: 'o1' });
    await emitAutomationEvent('order.paid', { orderId: 'o1' }, { dedupeKey: 'o1' });
    resetAutomationStatsForTests(); // "restart": the process forgets, the id stays the same
    await emitAutomationEvent('order.paid', { orderId: 'o1' }, { dedupeKey: 'o1' });
    await r.close();
    expect(r.hits).toHaveLength(2);
    expect(JSON.parse(r.hits[0].body).id).toBe(JSON.parse(r.hits[1].body).id);
  });
});

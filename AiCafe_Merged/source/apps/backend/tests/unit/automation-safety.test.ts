import dns from 'dns';
import http from 'http';
import { AddressInfo } from 'net';
import {
  automationStats,
  dedupeSizeForTests,
  emitAutomationEvent,
  isForbiddenAddress,
  resetAutomationStatsForTests,
  signAutomationPayload,
  validateAutomationUrl,
  verifyAutomationSignature,
} from '../../src/automation/emitter';

const SECRET = 'a-long-enough-test-secret';

beforeEach(() => {
  resetAutomationStatsForTests();
  delete process.env.AUTOMATION_WEBHOOK_URL;
  delete process.env.AUTOMATION_WEBHOOK_SECRET;
  delete process.env.AUTOMATION_ALLOW_LOCAL_TARGETS;
  jest.restoreAllMocks();
});

describe('forbidden destinations', () => {
  test.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::7f00:1', '2002:7f00:1::1',
  ])('%s is refused', (ip) => {
    expect(isForbiddenAddress(ip)).toBe(true);
  });

  test.each(['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111'])('%s is a public address', (ip) => {
    expect(isForbiddenAddress(ip)).toBe(false);
  });

  test('allowLoopback lifts loopback only, never other private ranges', () => {
    expect(isForbiddenAddress('127.0.0.1', { allowLoopback: true })).toBe(false);
    expect(isForbiddenAddress('::1', { allowLoopback: true })).toBe(false);
    expect(isForbiddenAddress('10.0.0.1', { allowLoopback: true })).toBe(true);
    expect(isForbiddenAddress('169.254.169.254', { allowLoopback: true })).toBe(true);
  });
});

describe('destination URL validation', () => {
  test.each([
    'https://127.0.0.1/hook',
    'https://localhost/hook',
    'https://10.0.0.5/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/hook',
    'https://[::ffff:127.0.0.1]/hook',
    'https://metadata.internal/hook',
    'https://printer.local/hook',
    'http://hooks.example.com/hook',
    'ftp://hooks.example.com/hook',
    'file:///etc/passwd',
    'https://user:pass@hooks.example.com/hook',
    'not a url',
  ])('%s is rejected', (url) => {
    expect(() => validateAutomationUrl(url, false)).toThrow();
  });

  test('a normal https hook is accepted', () => {
    expect(validateAutomationUrl('https://hooks.zapier.com/hooks/catch/1/abc/', false).hostname).toBe('hooks.zapier.com');
  });

  test('loopback http is accepted only when local targets are explicitly allowed', () => {
    expect(() => validateAutomationUrl('http://127.0.0.1:3000/hook', false)).toThrow();
    expect(validateAutomationUrl('http://127.0.0.1:3000/hook', true).port).toBe('3000');
    expect(() => validateAutomationUrl('http://10.0.0.1/hook', true)).toThrow();
  });

  test('local targets can never be enabled in production', async () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.AUTOMATION_ALLOW_LOCAL_TARGETS = 'true';
    process.env.AUTOMATION_WEBHOOK_URL = 'http://127.0.0.1:9/hook';
    try {
      expect(automationStats().enabled).toBe(false);
      expect(automationStats().configError).toBeDefined();
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});

describe('unsafe destinations are never contacted', () => {
  test('a refused URL is counted as rejected, never throws, and the URL is not logged', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env.AUTOMATION_WEBHOOK_URL = 'https://169.254.169.254/hooks/catch/SECRET-TOKEN';
    await expect(emitAutomationEvent('order.paid', { orderId: 'x' })).resolves.toBeUndefined();
    expect(automationStats()).toMatchObject({ enabled: false, configured: true, rejected: 1, sent: 0 });
    expect(warn.mock.calls.flat().join(' ')).not.toContain('SECRET-TOKEN');
    expect(warn.mock.calls.flat().join(' ')).not.toContain('169.254');
  });

  test('DNS rebinding: a public-looking name that resolves to a private address is refused at connect time', async () => {
    let attempts = 0;
    const real = dns.lookup;
    jest.spyOn(dns, 'lookup').mockImplementation(((host: string, opts: any, cb: any) => {
      if (host === 'rebind.example.com') {
        attempts += 1;
        return cb(null, [{ address: '10.0.0.7', family: 4 }]);
      }
      return (real as any)(host, opts, cb);
    }) as any);
    process.env.AUTOMATION_WEBHOOK_URL = 'https://rebind.example.com/hook';
    await emitAutomationEvent('order.paid', { orderId: 'x' });
    expect(attempts).toBeGreaterThan(0);
    expect(automationStats()).toMatchObject({ rejected: 1, sent: 0, lastStatus: 'rejected' });
  });

  test('a name with one public and one private answer is refused (all answers must be allowed)', async () => {
    jest.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: any, cb: any) =>
      cb(null, [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }])) as any);
    process.env.AUTOMATION_WEBHOOK_URL = 'https://mixed.example.com/hook';
    await emitAutomationEvent('order.paid', { orderId: 'x' });
    expect(automationStats()).toMatchObject({ rejected: 1, sent: 0 });
  });

  test('redirects are not followed', async () => {
    let targetHits = 0;
    const target = http.createServer((_q, r) => { targetHits += 1; r.end('hit'); });
    await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
    const redirector = http.createServer((_q, r) => {
      r.statusCode = 302;
      r.setHeader('Location', `http://127.0.0.1:${(target.address() as AddressInfo).port}/internal`);
      r.end();
    });
    await new Promise<void>((r) => redirector.listen(0, '127.0.0.1', r));
    process.env.AUTOMATION_ALLOW_LOCAL_TARGETS = 'true';
    process.env.AUTOMATION_WEBHOOK_URL = `http://127.0.0.1:${(redirector.address() as AddressInfo).port}/hook`;
    await emitAutomationEvent('order.paid', { orderId: 'x' });
    await new Promise<void>((r) => redirector.close(() => r()));
    await new Promise<void>((r) => target.close(() => r()));
    expect(targetHits).toBe(0);
    expect(automationStats()).toMatchObject({ sent: 0, failed: 1, lastStatus: 302 });
  });
});

describe('HMAC with timestamp', () => {
  const body = '{"id":"evt_1","type":"order.paid"}';
  const now = new Date('2026-10-21T12:00:00Z');
  const ts = String(Math.floor(now.getTime() / 1000));

  test('a genuine signature verifies', () => {
    const signature = signAutomationPayload(body, ts, SECRET);
    expect(verifyAutomationSignature({ body, timestamp: ts, signature, secret: SECRET, now }).valid).toBe(true);
  });

  test('the signature covers the timestamp: reusing it with another timestamp fails', () => {
    const signature = signAutomationPayload(body, ts, SECRET);
    const other = String(Number(ts) + 1);
    const v = verifyAutomationSignature({ body, timestamp: other, signature, secret: SECRET, now });
    expect(v).toMatchObject({ valid: false, reason: 'Signature mismatch.' });
  });

  test('a changed body, wrong secret and malformed values are rejected', () => {
    const signature = signAutomationPayload(body, ts, SECRET);
    expect(verifyAutomationSignature({ body: body + ' ', timestamp: ts, signature, secret: SECRET, now }).valid).toBe(false);
    expect(verifyAutomationSignature({ body, timestamp: ts, signature, secret: 'another-secret-value', now }).valid).toBe(false);
    expect(verifyAutomationSignature({ body, timestamp: 'abc', signature, secret: SECRET, now }).valid).toBe(false);
    expect(verifyAutomationSignature({ body, timestamp: undefined, signature, secret: SECRET, now }).valid).toBe(false);
    expect(verifyAutomationSignature({ body, timestamp: ts, signature: 'sha256=' + 'a'.repeat(64), secret: SECRET, now }).valid).toBe(false);
  });

  test('a stale (or future) timestamp is outside the window even with a correct signature', () => {
    const old = String(Number(ts) - 3600);
    const signature = signAutomationPayload(body, old, SECRET);
    expect(verifyAutomationSignature({ body, timestamp: old, signature, secret: SECRET, now })).toMatchObject({
      valid: false,
      reason: 'Timestamp outside the accepted window.',
    });
    const future = String(Number(ts) + 3600);
    expect(verifyAutomationSignature({ body, timestamp: future, signature: signAutomationPayload(body, future, SECRET), secret: SECRET, now }).valid).toBe(false);
  });
});

describe('delivery behaviour', () => {
  function receiver() {
    const hits: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { hits.push({ headers: req.headers, body }); res.end('ok'); });
    });
    return new Promise<{ url: string; hits: typeof hits; close: () => Promise<void> }>((resolve) =>
      server.listen(0, '127.0.0.1', () =>
        resolve({
          url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`,
          hits,
          close: () => new Promise((r) => server.close(() => r())),
        })
      )
    );
  }

  test('what is delivered verifies with the shared secret, and a consumer can drop repeated event ids', async () => {
    process.env.AUTOMATION_ALLOW_LOCAL_TARGETS = 'true';
    const r = await receiver();
    process.env.AUTOMATION_WEBHOOK_URL = r.url;
    process.env.AUTOMATION_WEBHOOK_SECRET = SECRET;
    await emitAutomationEvent('order.paid', { orderId: 'o1' }, { dedupeKey: 'o1' });
    resetAutomationStatsForTests(); // restart: the producer forgets, the event id stays stable
    await emitAutomationEvent('order.paid', { orderId: 'o1' }, { dedupeKey: 'o1' });
    await r.close();
    expect(r.hits).toHaveLength(2);
    const seen = new Set<string>();
    const accepted = r.hits.filter((h) => {
      const v = verifyAutomationSignature({
        body: h.body,
        timestamp: h.headers['x-aicafe-timestamp'] as string,
        signature: h.headers['x-aicafe-signature'] as string,
        secret: SECRET,
      });
      expect(v.valid).toBe(true);
      const id = h.headers['x-aicafe-event-id'] as string;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    expect(accepted).toHaveLength(1);
  });

  test('the in-memory dedupe set is bounded', async () => {
    process.env.AUTOMATION_WEBHOOK_URL = 'https://hooks.example.com/x'; // never contacted: dedupe only needs "configured"
    jest.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: any, cb: any) => cb(new Error('no network in tests'))) as any);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const batch: Promise<void>[] = [];
    for (let i = 0; i < 2300; i++) batch.push(emitAutomationEvent('order.paid', {}, { dedupeKey: `k${i}` }));
    await Promise.all(batch);
    expect(dedupeSizeForTests()).toBeLessThanOrEqual(2000);
  }, 60000);
});

describe('payment code paths are protected', () => {
  test('emitAutomationEvent never throws synchronously, even with an unserialisable payload', async () => {
    process.env.AUTOMATION_ALLOW_LOCAL_TARGETS = 'true';
    process.env.AUTOMATION_WEBHOOK_URL = 'http://127.0.0.1:9/hook';
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    let result: Promise<void> | undefined;
    expect(() => { result = emitAutomationEvent('order.paid', circular); }).not.toThrow();
    await expect(result).resolves.toBeUndefined();
  });
});

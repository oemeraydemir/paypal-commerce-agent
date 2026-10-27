import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

// Sprint 6 RECOVERY-02 / CSP hardening. These assert the NARROW, secure CSP
// (no 'unsafe-inline' for scripts) and that the dynamically rendered checkout
// return/cancel pages carry a per-response nonce so their tiny inline redirect
// still runs. Browser-level execution is NOT exercised here (that would need a
// real browser); these tests prove the header shape and nonce wiring only.
describe('Security headers / CSP (Sprint 6 RECOVERY-02)', () => {
  test('a CSP is set on API responses and forbids inline scripts', async () => {
    const response = await request(app).get('/api/orders');
    expect(response.status).toBe(200);
    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toBeDefined();

    // script-src must NOT include 'unsafe-inline' (the P0 that let injected
    // script run); object-src must remain 'none'.
    expect(csp).toContain('object-src');
    expect(csp).toContain("'none'");
    const scriptSrc = csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain('https://cdn.jsdelivr.net');
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  test('a per-response nonce is present in script-src', async () => {
    const response = await request(app).get('/api/orders');
    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  test('the nonce differs between responses (not a static value)', async () => {
    const first = await request(app).get('/api/orders');
    const second = await request(app).get('/api/orders');
    const nonce1 = (first.headers['content-security-policy'] as string).match(
      /'nonce-([^']+)'/
    )?.[1];
    const nonce2 = (second.headers['content-security-policy'] as string).match(
      /'nonce-([^']+)'/
    )?.[1];
    expect(nonce1).toBeDefined();
    expect(nonce2).toBeDefined();
    expect(nonce1).not.toBe(nonce2);
  });

  test('checkout return page inline redirect carries the response nonce', async () => {
    const response = await request(app)
      .get('/api/checkout/return')
      .query({ token: 'ORDER-1' });
    expect(response.status).toBe(200);
    const csp = response.headers['content-security-policy'] as string;
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeDefined();
    // The single inline <script> on the page is nonce-gated, so it can run.
    expect(response.text).toContain(`<script nonce="${nonce}">`);
    // The page must never itself trigger a capture.
    expect(response.text).not.toContain('capture(');
    expect(response.text).toContain('This page does not capture payment.');
  });

  test('checkout cancel page inline redirect carries the response nonce', async () => {
    const response = await request(app)
      .get('/api/checkout/cancel')
      .query({ token: 'ORDER-1' });
    expect(response.status).toBe(200);
    const csp = response.headers['content-security-policy'] as string;
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeDefined();
    expect(response.text).toContain(`<script nonce="${nonce}">`);
    // Cancellation remains cancellation-only: it links to the cancel deep link,
    // never to success, and never issues a capture.
    expect(response.text).toContain('paypalcommerceagent://checkout/cancel');
    expect(response.text).not.toContain('checkout/success');
    expect(response.text).not.toContain('capture(');
  });

  test('dashboard.html has no inline <script> block (logic is external)', async () => {
    const response = await request(app).get('/dashboard.html');
    expect(response.status).toBe(200);
    // Only src= script tags; no executable inline block.
    const inlineScripts = response.text.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || [];
    expect(inlineScripts).toHaveLength(0);
  });
});

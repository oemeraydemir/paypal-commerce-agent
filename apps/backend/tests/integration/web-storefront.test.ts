import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../../src/app';

const app = createApp();

describe('web storefront', () => {
  test('GET / serves the storefront and loads logic from same-origin app.js (CSP-safe)', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('AI Café');
    expect(res.text).toContain('<script src="/app.js" defer></script>');
    // No inline script: script-src has no 'unsafe-inline'.
    expect(res.text.replace('<script src="/app.js" defer></script>', '')).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).not.toContain("'unsafe-inline' https://cdn");
  });

  test('GET /app.js is served as JavaScript and uses textContent, never innerHTML', async () => {
    const res = await request(app).get('/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    const src = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
    expect(src).not.toMatch(/innerHTML|document\.write|eval\(/);
  });

  test('desktop browsers are auto-sent to the web app; mobile keeps a user-triggered deep link and a visible web fallback', async () => {
    const res = await request(app).get('/api/checkout/return?token=ORDER-9');
    expect(res.status).toBe(200);
    // Desktop branch unchanged: auto-redirect to the web app.
    expect(res.text).toContain('window.location.replace("/?paypal=success&token=ORDER-9")');
    // Mobile must NOT auto-navigate the parent document to the custom scheme (would blank the page).
    expect(res.text).not.toContain('window.location.replace("paypalcommerceagent://checkout/success?token=ORDER-9")');
    // The deep link is still offered as a user-triggered anchor (not an automatic navigation).
    expect(res.text).toContain('href="paypalcommerceagent://checkout/success?token=ORDER-9"');
    // The web fallback is present and visible (no longer gated behind a timed reveal).
    expect(res.text).toContain('Continue in the browser instead');
  });

  test('web return link encodes hostile tokens', async () => {
    const res = await request(app).get('/api/checkout/cancel').query({ token: '"><script>x</script>' });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>x</script>');
    expect(res.text).toContain('/?paypal=cancel&token=%22%3E%3Cscript%3Ex%3C%2Fscript%3E');
  });
});

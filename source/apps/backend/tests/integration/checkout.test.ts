import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

describe('PayPal checkout return links', () => {
  test('return page keeps a user-triggered deep link and a visible web fallback, and never auto-navigates or captures', async () => {
    const response = await request(app)
      .get('/api/checkout/return')
      .query({ token: `ORDER-123</script><script>alert('x')</script>` });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Continue in AI Café to validate the PayPal return');
    expect(response.text).toContain('This page does not capture payment.');
    // Mobile must NOT auto-navigate the parent document to the custom scheme (would blank the page).
    expect(response.text).not.toContain('window.location.replace("paypalcommerceagent://checkout/success');
    // The deep link is still offered as a user-triggered anchor (not an automatic navigation).
    expect(response.text).toContain('href="paypalcommerceagent://checkout/success?token=');
    // The web fallback is present and visible.
    expect(response.text).toContain('Continue in the browser instead');
    expect(response.text).toContain('id="fallback-message"');
    expect(response.text).not.toContain('</script><script>alert');
    expect(response.text).not.toContain('capture(');
  });

  test('cancel page keeps a distinct cancel deep link and never auto-navigates to it', async () => {
    const response = await request(app)
      .get('/api/checkout/cancel')
      .query({ token: 'ORDER-123' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('paypalcommerceagent://checkout/cancel');
    expect(response.text).toContain('No payment was captured');
    // Cancel must NOT auto-navigate the parent document to the custom scheme.
    expect(response.text).not.toContain('window.location.replace("paypalcommerceagent://checkout/cancel?token=ORDER-123")');
    expect(response.text).toContain('href="paypalcommerceagent://checkout/cancel?token=ORDER-123"');
    expect(response.text).not.toContain('checkout/success');
  });

  test('requires a PayPal order token', async () => {
    const response = await request(app).get('/api/checkout/return');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('PayPal order token is required');
  });

  test('rejects a blank or non-string PayPal order token', async () => {
    const blank = await request(app)
      .get('/api/checkout/return')
      .query({ token: '   ' });
    const repeated = await request(app)
      .get('/api/checkout/return?token=ORDER-1&token=ORDER-2');

    expect(blank.status).toBe(400);
    expect(repeated.status).toBe(400);
  });

  test('encodes token data before embedding it into HTML and JavaScript', async () => {
    const response = await request(app)
      .get('/api/checkout/return')
      .query({ token: 'ORDER-123"><script>' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('token=ORDER-123%22%3E%3Cscript%3E');
    expect(response.text).not.toContain('ORDER-123"><script>');
  });
});

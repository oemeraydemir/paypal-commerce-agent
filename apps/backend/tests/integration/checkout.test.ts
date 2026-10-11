import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

describe('PayPal checkout return links', () => {
  test('return page attempts automatic app navigation and keeps an encoded fallback', async () => {
    const response = await request(app)
      .get('/api/checkout/return')
      .query({ token: `ORDER-123</script><script>alert('x')</script>` });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Continue in AI Café to validate the PayPal return');
    expect(response.text).toContain('This page does not capture payment.');
    expect(response.text).toContain(
      "window.location.replace(\"paypalcommerceagent://checkout/success?token=ORDER-123%3C%2Fscript%3E%3Cscript%3Ealert%28%27x%27%29%3C%2Fscript%3E\")"
    );
    expect(response.text).toContain("window.setTimeout(function ()");
    expect(response.text).toContain('id="fallback-message"');
    expect(response.text).toContain('href="paypalcommerceagent://checkout/success?token=');
    expect(response.text).not.toContain('</script><script>alert');
    expect(response.text).not.toContain('capture(');
  });

  test('cancel page remains a distinct cancel deep link and never navigates to success', async () => {
    const response = await request(app)
      .get('/api/checkout/cancel')
      .query({ token: 'ORDER-123' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('paypalcommerceagent://checkout/cancel');
    expect(response.text).toContain('No payment was captured');
    expect(response.text).toContain('window.location.replace("paypalcommerceagent://checkout/cancel?token=ORDER-123")');
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

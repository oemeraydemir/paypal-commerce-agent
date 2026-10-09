import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

describe('PayPal checkout return links', () => {
  test('return page opens the app with the approved PayPal order token', async () => {
    const response = await request(app)
      .get('/api/checkout/return')
      .query({ token: 'ORDER-123' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Payment approved');
    expect(response.text).toContain(
      'paypalcommerceagent://checkout/success?token=ORDER-123'
    );
  });

  test('cancel page opens the app without claiming a payment was captured', async () => {
    const response = await request(app)
      .get('/api/checkout/cancel')
      .query({ token: 'ORDER-123' });

    expect(response.status).toBe(200);
    expect(response.text).toContain('paypalcommerceagent://checkout/cancel');
    expect(response.text).toContain('No payment was captured');
  });

  test('requires a PayPal order token', async () => {
    const response = await request(app).get('/api/checkout/return');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('PayPal order token is required');
  });

  test('escapes the PayPal token before embedding it in the app link', async () => {
    const response = await request(app)
      .get('/api/checkout/return')
      .query({ token: 'ORDER-123"><script>' });

    expect(response.status).toBe(200);
    expect(response.text).toContain(
      'token=ORDER-123%22%3E%3Cscript%3E'
    );
    expect(response.text).not.toContain('ORDER-123"><script>');
  });
});

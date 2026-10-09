/**
 * PAYPAL SANDBOX SMOKE TEST
 *
 * Run: PAYPAL_ENABLED=true npm run test:smoke
 * (provide real PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in the environment or .env)
 *
 * Only tests create → approval URL. Full capture requires buyer approval in browser.
 * This file is excluded from `npm test` so it never runs against the real API by accident.
 */
import { paypalClient } from '../../src/paypal/client';

describe('PayPal Sandbox Smoke Test', () => {
  test('PayPal credentials are valid and can create order', async () => {
    const paypalOrder = await paypalClient.createOrder(
      {
        intent: 'CAPTURE',
        purchaseUnits: [
          {
            amount: {
              currencyCode: 'EUR',
              value: '1.00',
            },
          },
        ],
      },
      `smoke-test-${Date.now()}` // PayPal-Request-Id (FIX #1)
    );

    expect(paypalOrder.id).toBeDefined();
    expect(paypalOrder.status).toBe('CREATED');

    const approvalLink = paypalOrder.links?.find((link: any) => link.rel === 'approve');
    expect(approvalLink?.href).toContain('paypal.com');

    console.log(`✅ PayPal order created: ${paypalOrder.id}`);
    console.log(`🔗 Approval URL: ${approvalLink?.href}`);
    console.log('ℹ️  To complete capture, user must approve in browser');
  }, 10000);
});

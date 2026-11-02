/**
 * PAYPAL SANDBOX SMOKE TEST
 *
 * Run:
 *   PAYPAL_ENABLED=true PAYPAL_CLIENT_ID=<real sandbox id> \
 *   PAYPAL_CLIENT_SECRET=<real sandbox secret> npm run test:smoke
 *
 * This suite is skipped (reported BLOCKED, never PASS) when real sandbox
 * credentials are not configured. It only tests create -> approval URL; a full
 * capture needs buyer approval in a browser. It is excluded from `npm test`.
 */
import { env } from '../../src/config/environment';
import { paypalClient } from '../../src/paypal/client';

const clientId = process.env.PAYPAL_CLIENT_ID;
const hasRealCredentials =
  env.isPayPalEnabled() &&
  typeof clientId === 'string' &&
  clientId.length > 0 &&
  !clientId.startsWith('test-') &&
  typeof process.env.PAYPAL_CLIENT_SECRET === 'string' &&
  process.env.PAYPAL_CLIENT_SECRET.length > 0;

const suite = hasRealCredentials ? describe : describe.skip;

if (!hasRealCredentials) {
  // eslint-disable-next-line no-console
  console.warn(
    '[smoke] BLOCKED: real PayPal sandbox credentials are not configured ' +
      '(PAYPAL_ENABLED=true + PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET). No request was made.'
  );
}

suite('PayPal Sandbox Smoke Test', () => {
  test(
    'PayPal credentials are valid and can create order',
    async () => {
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
        `smoke-test-${Date.now()}`
      );

      expect(paypalOrder.id).toBeDefined();
      expect(paypalOrder.status).toBe('CREATED');

      const approvalLink = paypalOrder.links?.find((link: any) => link.rel === 'approve');
      expect(approvalLink?.href).toContain('paypal.com');

      // eslint-disable-next-line no-console
      console.log(`PayPal sandbox order created: ${paypalOrder.id}`);
    },
    15000
  );
});

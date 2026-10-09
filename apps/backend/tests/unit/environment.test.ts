import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

function loadPayPalEnvironment(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    PAYPAL_ENABLED: 'true',
    PAYPAL_CLIENT_ID: 'test-client-id',
    PAYPAL_CLIENT_SECRET: 'test-client-secret',
    PAYPAL_ENV: 'sandbox',
    ...overrides,
  };
  delete env.PAYPAL_RETURN_URL;
  delete env.PAYPAL_CANCEL_URL;

  const environmentModule = path.resolve(
    __dirname,
    '../../src/config/environment'
  );
  return spawnSync(
    process.execPath,
    [
      '-r',
      path.resolve(__dirname, '../../node_modules/ts-node/register'),
      '-e',
      `const { env } = require(${JSON.stringify(environmentModule)}); process.stdout.write(JSON.stringify({ returnUrl: env.paypal.PAYPAL_RETURN_URL, cancelUrl: env.paypal.PAYPAL_CANCEL_URL }));`,
    ],
    {
      cwd: os.tmpdir(),
      env,
      encoding: 'utf8',
    }
  );
}

describe('sandbox environment configuration', () => {
  test('builds hosted checkout callback URLs from the public backend URL', () => {
    const result = loadPayPalEnvironment({
      RENDER_EXTERNAL_URL: 'https://demo.onrender.com/',
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      returnUrl: 'https://demo.onrender.com/api/checkout/return',
      cancelUrl: 'https://demo.onrender.com/api/checkout/cancel',
    });
  });

  test('rejects a live PayPal environment', () => {
    const result = loadPayPalEnvironment({ PAYPAL_ENV: 'live' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PAYPAL_ENV');
  });
});

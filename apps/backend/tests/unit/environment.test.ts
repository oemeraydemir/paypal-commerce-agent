import { env as _doNotUse } from '../../src/config/environment';

// Hermetic: prevent the real apps/backend/.env from leaking into this suite.
// environment.ts calls `dotenv.config()` at import time; we stub it so the
// per-test controlled `process.env` (with PAYPAL_RETURN_URL/CANCEL_URL cleared)
// is the ONLY source of config. This makes the suite pass identically WITH and
// WITHOUT a real .env present.
jest.mock('dotenv', () => ({
  __esModule: true,
  default: { config: () => ({ parsed: {} }) },
  config: () => ({ parsed: {} }),
}));

// NOTE: This suite previously spawned a child Node process via `spawnSync` to
// evaluate the real config module with a controlled environment. Child-process
// spawning is blocked in some CI / sandbox environments, so those tests could
// never execute their assertions there. We now evaluate the SAME real module
// (src/config/environment.ts) IN-PROCESS with a controlled `process.env`.
// The assertions below are unchanged — only the execution mechanism differs,
// and the real application code is still exercised (no mocking of the logic).

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

  const prev = process.env;
  let result: { status: number; stdout: string; stderr: string };
  jest.resetModules();
  try {
    process.env = env;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../src/config/environment');
    result = {
      status: 0,
      stdout: JSON.stringify({
        returnUrl: mod.env.paypal?.PAYPAL_RETURN_URL,
        cancelUrl: mod.env.paypal?.PAYPAL_CANCEL_URL,
      }),
      stderr: '',
    };
  } catch (e: any) {
    result = {
      status: 1,
      stdout: '',
      // Include the Zod issue path so the "rejects a live environment" assertion
      // can confirm which key was rejected.
      stderr: (e?.message ?? '') + ' ' + (e?.issues ? JSON.stringify(e.issues) : ''),
    };
  } finally {
    process.env = prev;
  }
  return result;
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

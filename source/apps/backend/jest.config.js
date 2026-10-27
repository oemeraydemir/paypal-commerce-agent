/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // Smoke tests hit the REAL PayPal sandbox and need real credentials, so they
  // are excluded from `npm test` and run only via `npm run test:smoke`.
  // Browser tests drive a real Chrome against the real dashboard (AG Grid from
  // the CDN), so they are excluded from `npm test` and run via
  // `npm run test:browser`.
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/tests/smoke/', '/tests/browser/'],
  // Provide dummy-but-valid PayPal config so the orders API believes PayPal is
  // "enabled" under test. The PayPal client itself is mocked in integration
  // tests, so no real SDK call is made. setupFiles run before module imports.
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // No open handles: the idempotency cleanup timer is unref()'d (CRITICAL FIX #3).
  // runInBand keeps output deterministic for the Sprint exit report.
};

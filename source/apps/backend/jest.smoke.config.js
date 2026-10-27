/** @type {import('ts-jest').JestConfigWithTsJest} */
// Dedicated config for the smoke suites. The default `npm test` config ignores
// /tests/smoke/ on purpose (it must never run against real PayPal/PostgreSQL by
// accident). This config discovers them explicitly.
//
// Each smoke suite self-reports BLOCKED (describe.skip + a loud warning) when its
// external prerequisite is missing, so a green run never means "verified".
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/smoke/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // No setupFiles: tests/setup.ts injects dummy PayPal credentials that would
  // make the PayPal smoke test look configured when it is not.
  testTimeout: 60000,
  reporters: ['default', '<rootDir>/scripts/smoke-reporter.js'],
};

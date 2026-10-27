/** @type {import('ts-jest').JestConfigWithTsJest} */
// Separate config for the real-Chrome dashboard test: it is excluded from the
// default `npm test` run because it needs a Chrome binary and the AG Grid CDN.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/browser/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
};

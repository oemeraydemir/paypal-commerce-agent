import { resolveDatabaseSslOptions } from '../../src/persistence/database-ssl';

describe('resolveDatabaseSslOptions', () => {
  test('production defaults to verified TLS', () => {
    expect(resolveDatabaseSslOptions({ nodeEnv: 'production' })).toEqual({
      rejectUnauthorized: true,
    });
  });

  test('development does not enable TLS unless configured', () => {
    expect(resolveDatabaseSslOptions({ nodeEnv: 'development' })).toBeUndefined();
  });

  test('an explicit private-network opt-out disables TLS', () => {
    expect(resolveDatabaseSslOptions({ nodeEnv: 'production', enabled: 'false' })).toBeUndefined();
  });

  test('passes a custom CA while keeping certificate verification enabled', () => {
    expect(resolveDatabaseSslOptions({
      nodeEnv: 'production',
      enabled: 'true',
      ca: '  -----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----  ',
    })).toEqual({
      ca: '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----',
      rejectUnauthorized: true,
    });
  });
});

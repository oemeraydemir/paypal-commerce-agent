import { Client } from 'pg';
import {
  removeConnectionStringSslMode,
  resolveDatabaseSslOptions,
} from '../../src/persistence/database-ssl';

describe('PostgreSQL connection SSL configuration', () => {
  test('production defaults to TLS with certificate verification', () => {
    expect(resolveDatabaseSslOptions({ nodeEnv: 'production' })).toEqual({
      rejectUnauthorized: true,
    });
  });

  test('development does not enable TLS unless configured', () => {
    expect(resolveDatabaseSslOptions({ nodeEnv: 'development' })).toBeUndefined();
  });

  test('a custom CA retains certificate verification', () => {
    expect(
      resolveDatabaseSslOptions({ enabled: 'true', ca: ' test-ca ', rejectUnauthorized: 'true' }),
    ).toEqual({ ca: 'test-ca', rejectUnauthorized: true });
  });

  test('removes sslmode while preserving other connection query parameters', () => {
    const result = removeConnectionStringSslMode(
      'postgres://db.example/app?sslmode=verify-full&application_name=aicafe',
    );
    const parsed = new URL(result);
    expect(parsed.searchParams.has('sslmode')).toBe(false);
    expect(parsed.searchParams.get('application_name')).toBe('aicafe');
  });

  test.each([
    ['Render internal self-signed TLS', 'false'],
    ['external verified TLS', 'true'],
  ])('%s keeps the explicit Pool certificate policy when the URL has sslmode', (_name, verification) => {
    const client = new Client({
      connectionString: removeConnectionStringSslMode(
        'postgres://db.example/app?sslmode=require',
      ),
      ssl: resolveDatabaseSslOptions({ enabled: 'true', rejectUnauthorized: verification }),
    });

    expect((client as any).connectionParameters.ssl.rejectUnauthorized).toBe(
      verification === 'true',
    );
  });

  test('rejects malformed URLs without echoing their contents', () => {
    expect(() => removeConnectionStringSslMode('not-a-url-with-secret')).toThrow(
      'DATABASE_URL must be a valid PostgreSQL URL.',
    );
  });
});

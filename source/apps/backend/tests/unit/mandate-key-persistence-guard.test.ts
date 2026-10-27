/**
 * FIX-05 (verification findings R1/R2/R3): the mandate key must be persistent in production.
 *
 * assertMandateKeyPersistence() is the boot guard: with NODE_ENV=production and no
 * MANDATE_SIGNING_KEY the server must refuse to start (fail closed), because an
 * ephemeral key makes every Cart Mandate issued before the last restart unverifiable.
 * Outside production an ephemeral key stays allowed for local development and tests.
 */
import crypto from 'crypto';
import {
  assertMandateConfig,
  assertMandateKeyPersistence,
  mandateKeyStatus,
  resetMandateKeyForTests,
} from '../../src/mandate/mandate-service';

const saved = { ...process.env };

/** A valid Ed25519 PKCS#8 PEM private key, exactly like `npm run mandate:keygen` produces. */
function freshKeyPem(): string {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}

afterEach(() => {
  for (const k of ['NODE_ENV', 'MANDATE_SIGNING_KEY']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetMandateKeyForTests();
});

describe('assertMandateKeyPersistence (FIX-05)', () => {
  test('production without MANDATE_SIGNING_KEY refuses to start', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MANDATE_SIGNING_KEY;
    resetMandateKeyForTests();

    expect(() => assertMandateKeyPersistence()).toThrow(/MANDATE_SIGNING_KEY is not set/);
    expect(() => assertMandateKeyPersistence()).toThrow(/refusing to start in production/i);
    expect(mandateKeyStatus().keyPersistence).toBe('ephemeral');
  });

  test('production with a configured key starts', () => {
    process.env.NODE_ENV = 'production';
    process.env.MANDATE_SIGNING_KEY = freshKeyPem();
    resetMandateKeyForTests();

    expect(() => assertMandateKeyPersistence()).not.toThrow();
    expect(mandateKeyStatus()).toMatchObject({ ok: true, keyPersistence: 'configured' });
  });

  test('development without a key still boots (ephemeral is allowed outside production)', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.MANDATE_SIGNING_KEY;
    resetMandateKeyForTests();

    expect(() => assertMandateKeyPersistence()).not.toThrow();
    expect(mandateKeyStatus().keyPersistence).toBe('ephemeral');
  });

  test('an unusable key is still fatal through assertMandateConfig in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.MANDATE_SIGNING_KEY = 'not-a-key';
    resetMandateKeyForTests();

    expect(() => assertMandateConfig()).toThrow(/not a valid Ed25519/);
    // The persistence guard must not mask the configuration error.
    expect(() => assertMandateKeyPersistence()).not.toThrow();
  });
});

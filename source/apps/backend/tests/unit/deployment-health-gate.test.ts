/**
 * FIX-05 (verification findings R1/R2/R3): the deployment release gate.
 *
 * Two things must make `npm run verify:deployment` FAIL, no matter how healthy the
 * rest of the service looks:
 *   1. volatile storage (storage.mode !== 'postgres')
 *   2. a Cart Mandate signing key that is not persistent ('ephemeral' or 'invalid')
 *
 * The decision logic is pure (src/deployment/health-gate.ts), so it is tested here
 * against fixture /api/health payloads — no live host required.
 */
import {
  durabilityGatePasses,
  evaluateDurabilityGates,
} from '../../src/deployment/health-gate';

const HEALTHY = {
  status: 'ok',
  storage: { mode: 'postgres', durable: true },
  mandates: { keyPersistence: 'configured' },
};

describe('verify:deployment durability gate (FIX-05)', () => {
  test('a durable deployment with a configured mandate key passes both gates', () => {
    const checks = evaluateDurabilityGates(HEALTHY);
    expect(checks).toHaveLength(2);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(durabilityGatePasses(HEALTHY)).toBe(true);
    expect(checks[0].name).toMatch(/storage is durable/i);
    expect(checks[1].name).toMatch(/Cart Mandate signing key is persistent/i);
  });

  test('volatile in-memory storage FAILS the gate even when everything else is healthy', () => {
    const checks = evaluateDurabilityGates({
      ...HEALTHY,
      storage: { mode: 'memory', durable: false },
    });
    const storage = checks.find((c) => /storage/.test(c.name))!;
    expect(storage.ok).toBe(false);
    expect(storage.detail).toContain('memory');
    expect(storage.detail).toMatch(/do not survive a restart/i);
    expect(durabilityGatePasses({ ...HEALTHY, storage: { mode: 'memory', durable: false } })).toBe(false);
  });

  test('a missing storage block FAILS the gate (never assumed durable)', () => {
    const checks = evaluateDurabilityGates({ status: 'ok', mandates: { keyPersistence: 'configured' } });
    expect(checks[0].ok).toBe(false);
    expect(checks[0].detail).toContain('missing');
  });

  test('an ephemeral mandate key FAILS the gate', () => {
    const checks = evaluateDurabilityGates({
      ...HEALTHY,
      mandates: { keyPersistence: 'ephemeral' },
    });
    const mandates = checks.find((c) => /mandate/i.test(c.name))!;
    expect(mandates.ok).toBe(false);
    expect(mandates.detail).toContain('ephemeral');
    expect(mandates.detail).toMatch(/cannot be verified/i);
  });

  test('an invalid mandate key FAILS the gate and surfaces the reason', () => {
    const checks = evaluateDurabilityGates({
      ...HEALTHY,
      mandates: { keyPersistence: 'invalid', error: 'MANDATE_SIGNING_KEY is set but is not a valid Ed25519 PKCS#8 private key.' },
    });
    const mandates = checks.find((c) => /mandate/i.test(c.name))!;
    expect(mandates.ok).toBe(false);
    expect(mandates.detail).toContain('invalid');
    expect(mandates.detail).toContain('not a valid Ed25519');
  });

  test('an unreachable host (null payload) FAILS both gates', () => {
    const checks = evaluateDurabilityGates(null);
    expect(checks.every((c) => !c.ok)).toBe(true);
    expect(durabilityGatePasses(null)).toBe(false);
    expect(durabilityGatePasses(undefined)).toBe(false);
  });
});

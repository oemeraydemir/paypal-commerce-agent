import crypto from 'crypto';
import { OrderOrigin, OrderStatus, type Order } from '../../src/orders/domain';
import {
  MandateConfigError,
  CANONICALIZATION,
  mandateKeyStatus,
  assertMandateConfig,
  publicKeyDocument,
  resetMandateKeyForTests,
  signCartMandate,
  verifyCartMandate,
} from '../../src/mandate/mandate-service';

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'ord_unit_1',
    sessionId: 'sess_unit_1',
    status: OrderStatus.PAYMENT_PENDING,
    origin: OrderOrigin.AI_AGENT,
    items: [
      { productId: 'b', name: 'B', quantity: 2, unitPriceMinor: 300, lineTotalMinor: 600 },
      { productId: 'a', name: 'A', quantity: 1, unitPriceMinor: 1000, lineTotalMinor: 1000 },
    ],
    totalMinor: 1600,
    currency: 'EUR',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    ...over,
  };
}

afterEach(() => {
  delete process.env.MANDATE_SIGNING_KEY;
  delete process.env.MANDATE_PREVIOUS_PUBLIC_KEYS;
  resetMandateKeyForTests();
});

describe('cart mandate signing', () => {
  test('item order does not change the mandate, and a signed mandate verifies', () => {
    const a = signCartMandate(order());
    const b = signCartMandate(order({ items: [...order().items].reverse() }));
    expect(b).toEqual(a);
    const v = verifyCartMandate(a, () => order(), new Date('2026-10-01T11:00:00Z'));
    expect(v.valid).toBe(true);
    expect(v.checks).toMatchObject({ signature: true, notExpired: true, matchesOrder: true });
  });

  test('expiry is reported but does not forge or invalidate a genuine signature', () => {
    const a = signCartMandate(order());
    const v = verifyCartMandate(a, () => order(), new Date('2026-12-31T00:00:00Z'));
    expect(v.valid).toBe(true);
    expect(v.checks.notExpired).toBe(false);
    expect(v.reason).toMatch(/window has passed/);
  });

  test('a genuine mandate no longer matching the stored order is not valid', () => {
    const a = signCartMandate(order());
    const v = verifyCartMandate(a, () => order({ totalMinor: 9999 }));
    expect(v.valid).toBe(false);
    expect(v.checks.signature).toBe(true);
    expect(v.checks.matchesOrder).toBe(false);
  });

  test('an unknown order id is verifiable by signature alone (matchesOrder = null)', () => {
    const v = verifyCartMandate(signCartMandate(order()), () => undefined);
    expect(v.valid).toBe(true);
    expect(v.checks.matchesOrder).toBeNull();
  });

  test('an unknown kid and a flipped signature are rejected', () => {
    const a = signCartMandate(order());
    const unknown = verifyCartMandate({ ...a, kid: 'deadbeef' }, () => undefined);
    expect(unknown.valid).toBe(false);
    expect(unknown.checks.knownKey).toBe(false);
    const flipped = a.signature.slice(0, -2) + (a.signature.endsWith('AA') ? 'BB' : 'AA');
    expect(verifyCartMandate({ ...a, signature: flipped }, () => undefined).valid).toBe(false);
  });

  test('a configured key survives a "restart"; without one the key is flagged ephemeral', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    process.env.MANDATE_SIGNING_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    resetMandateKeyForTests();
    const first = signCartMandate(order());
    expect(publicKeyDocument().keyPersistence).toBe('configured');
    resetMandateKeyForTests(); // simulated restart with the same configuration
    expect(signCartMandate(order())).toEqual(first);

    delete process.env.MANDATE_SIGNING_KEY;
    resetMandateKeyForTests();
    expect(publicKeyDocument().keyPersistence).toBe('ephemeral');
  });

  test('a non-Ed25519 key is refused without echoing key material', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    process.env.MANDATE_SIGNING_KEY = pem;
    resetMandateKeyForTests();
    expect(() => signCartMandate(order())).toThrow(MandateConfigError);
    const s = mandateKeyStatus();
    expect(s).toMatchObject({ ok: false, keyPersistence: 'invalid' });
    expect(JSON.stringify(s)).not.toContain(pem.split('\n')[1]);
  });

  test('the one-line key printed by `npm run mandate:keygen` (escaped \\n) is accepted', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim();
    process.env.MANDATE_SIGNING_KEY = pem.replace(/\n/g, '\\n');
    resetMandateKeyForTests();
    expect(publicKeyDocument().keyPersistence).toBe('configured');
    expect(verifyCartMandate(signCartMandate(order()), () => undefined).valid).toBe(true);
  });
});

const pemPriv = (k: crypto.KeyObject) => k.export({ type: 'pkcs8', format: 'pem' }).toString();
const pemPub = (k: crypto.KeyObject) => crypto.createPublicKey(k).export({ type: 'spki', format: 'pem' }).toString();
const newKey = () => crypto.generateKeyPairSync('ed25519').privateKey;

describe('canonicalization', () => {
  test('the envelope names the canonicalization and a mismatching label is refused', () => {
    const a = signCartMandate(order());
    expect(a.canonicalization).toBe(CANONICALIZATION);
    expect(publicKeyDocument().canonicalization).toBe(CANONICALIZATION);
    expect(verifyCartMandate({ ...a, canonicalization: 'rfc8785' }, () => undefined).valid).toBe(false);
    const { canonicalization: _c, ...without } = a;
    expect(verifyCartMandate(without, () => undefined).valid).toBe(false);
  });

  test('the signed bytes are the sorted-key JSON of the mandate: key order in transit does not matter', () => {
    const a = signCartMandate(order());
    const reordered = JSON.parse(JSON.stringify({ ...a, mandate: Object.fromEntries(Object.entries(a.mandate).reverse()) }));
    expect(verifyCartMandate(reordered, () => undefined).valid).toBe(true);
  });

  test('a changed alg is refused', () => {
    const a = signCartMandate(order());
    expect(verifyCartMandate({ ...a, alg: 'none' }, () => undefined).valid).toBe(false);
  });
});

describe('tampering', () => {
  test.each([
    ['total', (m: any) => { m.totalMinor = 1; }],
    ['item price', (m: any) => { m.items[0].unitPriceMinor = 1; }],
    ['constraint', (m: any) => { m.constraints.agentMayAuthorizePayment = true; }],
    ['expiry', (m: any) => { m.expiresAt = '2099-01-01T00:00:00.000Z'; }],
    ['order id', (m: any) => { m.orderId = 'ord_other'; }],
    ['an extra field', (m: any) => { m.extra = 1; }],
  ])('a changed %s is detected', (_n, mutate) => {
    const a = JSON.parse(JSON.stringify(signCartMandate(order())));
    mutate(a.mandate);
    const v = verifyCartMandate(a, () => undefined);
    expect(v.valid).toBe(false);
    expect(v.checks.signature).toBe(false);
  });

  test('a mandate signed by a different (unrelated) key never verifies', () => {
    process.env.MANDATE_SIGNING_KEY = pemPriv(newKey());
    resetMandateKeyForTests();
    const foreign = signCartMandate(order());
    process.env.MANDATE_SIGNING_KEY = pemPriv(newKey());
    resetMandateKeyForTests();
    const v = verifyCartMandate(foreign, () => undefined);
    expect(v.valid).toBe(false);
    expect(v.checks.knownKey).toBe(false);
  });

  test('forging a signature under the active kid with another key fails', () => {
    const a = signCartMandate(order());
    const forged = crypto.sign(null, Buffer.from(JSON.stringify(a.mandate)), newKey()).toString('base64url');
    expect(verifyCartMandate({ ...a, signature: forged }, () => undefined).checks.signature).toBe(false);
  });
});

describe('expiry', () => {
  test('expiresAt is fixed inside the signed mandate and is not recomputed from configuration when verifying', () => {
    const { env } = require('../../src/config/environment');
    const signed = signCartMandate(order());
    const saved = env.RESERVATION_MAX_AGE_MS;
    try {
      env.RESERVATION_MAX_AGE_MS = 60 * 1000; // configuration changes after signing
      const v = verifyCartMandate(signed, () => order(), new Date('2026-10-01T12:00:00Z'));
      expect(v.valid).toBe(true);
      expect(v.checks).toMatchObject({ signature: true, matchesOrder: true, notExpired: true });
      // A mandate signed under the new configuration carries its own, shorter window.
      expect(signCartMandate(order()).mandate.expiresAt).not.toBe(signed.mandate.expiresAt);
    } finally {
      env.RESERVATION_MAX_AGE_MS = saved;
    }
  });

  test('a mandate whose window has passed is flagged as expired', () => {
    const a = signCartMandate(order());
    expect(verifyCartMandate(a, () => order(), new Date('2027-01-01T00:00:00Z')).checks.notExpired).toBe(false);
  });
});

describe('key rotation (keyring)', () => {
  test('after rotation, mandates signed with the old key still verify when its PUBLIC key is listed; new ones use the new key', () => {
    const oldKey = newKey();
    process.env.MANDATE_SIGNING_KEY = pemPriv(oldKey);
    resetMandateKeyForTests();
    const oldSigned = signCartMandate(order());

    const newer = newKey();
    process.env.MANDATE_SIGNING_KEY = pemPriv(newer);
    process.env.MANDATE_PREVIOUS_PUBLIC_KEYS = pemPub(oldKey).replace(/\n/g, '\\n');
    resetMandateKeyForTests();

    expect(verifyCartMandate(oldSigned, () => order()).valid).toBe(true);
    const fresh = signCartMandate(order());
    expect(fresh.kid).not.toBe(oldSigned.kid);
    expect(verifyCartMandate(fresh, () => order()).valid).toBe(true);

    const doc = publicKeyDocument();
    expect(doc.keys.map((k: any) => k.status)).toEqual(['active', 'previous']);
    expect(doc.keys.find((k: any) => k.kid === oldSigned.kid)).toBeDefined();
    expect(JSON.stringify(doc)).not.toMatch(/"d":/);
  });

  test('without the old public key, the old mandate is reported as unknown key (never as valid)', () => {
    process.env.MANDATE_SIGNING_KEY = pemPriv(newKey());
    resetMandateKeyForTests();
    const oldSigned = signCartMandate(order());
    process.env.MANDATE_SIGNING_KEY = pemPriv(newKey());
    resetMandateKeyForTests();
    const v = verifyCartMandate(oldSigned, () => order());
    expect(v.valid).toBe(false);
    expect(v.checks.knownKey).toBe(false);
  });

  test('previous keys never sign: only the active key is used', () => {
    const oldKey = newKey();
    const active = newKey();
    process.env.MANDATE_SIGNING_KEY = pemPriv(active);
    process.env.MANDATE_PREVIOUS_PUBLIC_KEYS = JSON.stringify([pemPub(oldKey)]);
    resetMandateKeyForTests();
    const status = mandateKeyStatus();
    expect(status.ok && status.previousKids).toHaveLength(1);
    expect(signCartMandate(order()).kid).toBe((status as any).activeKid);
  });

  test('private keys, garbage or too many entries in MANDATE_PREVIOUS_PUBLIC_KEYS invalidate the configuration', () => {
    process.env.MANDATE_SIGNING_KEY = pemPriv(newKey());
    for (const bad of [
      pemPriv(newKey()).replace(/\n/g, '\\n'),
      'garbage',
      '[1,2]',
      JSON.stringify(Array.from({ length: 6 }, () => pemPub(newKey()))),
      pemPub(crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey),
    ]) {
      process.env.MANDATE_PREVIOUS_PUBLIC_KEYS = bad;
      resetMandateKeyForTests();
      const s = mandateKeyStatus();
      expect(s.ok).toBe(false);
      expect(() => assertMandateConfig()).toThrow(MandateConfigError);
    }
  });
});

describe('missing and invalid keys', () => {
  test('no key: ephemeral, flagged, and boot does not refuse', () => {
    resetMandateKeyForTests();
    expect(mandateKeyStatus()).toMatchObject({ ok: true, keyPersistence: 'ephemeral' });
    expect(() => assertMandateConfig()).not.toThrow();
  });

  test('a configured but invalid key refuses to start and never leaks the value', () => {
    process.env.MANDATE_SIGNING_KEY = 'super-secret-but-not-a-key';
    resetMandateKeyForTests();
    expect(() => assertMandateConfig()).toThrow(MandateConfigError);
    try { assertMandateConfig(); } catch (e: any) { expect(e.message).not.toContain('super-secret'); }
    expect(() => publicKeyDocument()).toThrow(MandateConfigError);
    expect(() => verifyCartMandate({ mandate: {}, signature: 'x', kid: 'y', canonicalization: CANONICALIZATION }, () => undefined)).toThrow(MandateConfigError);
  });
});

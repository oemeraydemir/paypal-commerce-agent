import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { currentBusiness } from '../config/business-config';
import { env } from '../config/environment';
import type { Order } from '../orders/domain';

// Cart Mandate: a signed, tamper-evident record of exactly what a shopper was asked to approve.
//
// Inspired by the "mandate" idea in agent-payment protocols (e.g. AP2): when an AI agent takes part in
// a purchase, the merchant should be able to prove *what* was proposed, *who* held payment authority
// and *under which constraints*. This is NOT an implementation of AP2 and it does not move money:
// PayPal remains the only place a payment is approved, and PayPal capture still requires the buyer.
//
// The mandate is derived from the persisted order, so it needs no extra storage and survives a restart.
// Ed25519 signatures are deterministic: asking twice yields the identical mandate.
//
// Keys: one ACTIVE private key signs (MANDATE_SIGNING_KEY). Older keys are kept as PUBLIC keys only
// (MANDATE_PREVIOUS_PUBLIC_KEYS) so mandates signed before a rotation stay verifiable; the verifier picks
// the key by `kid`. Old private keys are neither needed nor accepted.

export const MANDATE_VERSION = 'aicafe.cart-mandate/1';
/**
 * Canonical form that is signed: UTF-8 bytes of JSON with object keys sorted lexicographically and no
 * whitespace, as produced by fast-json-stable-stringify 2.x. It is NOT RFC 8785 (JCS); the label says so.
 */
export const CANONICALIZATION = 'aicafe-stable-json/1';

export interface CartMandate {
  version: typeof MANDATE_VERSION;
  mandateId: string;
  orderId: string;
  merchant: { id: string; name: string };
  currency: string;
  totalMinor: number;
  items: Array<{ productId: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }>;
  origin: string;
  issuedAt: string;
  /** Fixed when the mandate is signed and covered by the signature; never recomputed while verifying. */
  expiresAt: string;
  /** Truncated hash of the session id: binds the mandate to one shopper session without leaking it. */
  sessionBinding: string;
  constraints: {
    agentMayAuthorizePayment: false;
    paymentAuthority: 'buyer_approval_at_paypal';
    pricesSetByServer: true;
    policyEnforcedByServer: true;
    /** Stage 2: the allowance that was actually enforced for this order (server-set). */
    appliedLimits?: {
      maxPerPurchaseMinor: number;
      dailySpendLimitMinor: number;
      confirmationThresholdMinor: number;
      enabled: boolean;
      validUntil: string | null;
    };
  };
}

export interface SignedCartMandate {
  mandate: CartMandate;
  signature: string; // base64url Ed25519 over the canonical JSON of `mandate`
  alg: 'EdDSA';
  kid: string;
  canonicalization: typeof CANONICALIZATION;
}

export interface MandateVerification {
  valid: boolean;
  checks: {
    knownKey: boolean;
    signature: boolean;
    /** false = the mandate window has passed (informational: the signature is still genuine). */
    notExpired: boolean;
    /** true/false when the order is still known to this server, null when it is not. */
    matchesOrder: boolean | null;
  };
  reason?: string;
}

/** Raised when the mandate key configuration is unusable. The message never contains key material. */
export class MandateConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MandateConfigError';
  }
}

interface Keyring {
  status: 'ok';
  active: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject; kid: string };
  previous: Map<string, crypto.KeyObject>;
  persistence: 'configured' | 'ephemeral';
}
interface InvalidKeyring {
  status: 'invalid';
  error: string;
}

const MAX_PREVIOUS_KEYS = 5;
let cached: Keyring | InvalidKeyring | undefined;

function kidOf(publicKey: crypto.KeyObject): string {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

function parseActivePrivateKey(configured: string): crypto.KeyObject {
  // Accepts a PKCS#8 PEM (newlines may be written as \n) or base64 of that PEM / of the DER.
  let pem = '';
  if (configured.includes('BEGIN')) {
    pem = configured.replace(/\\n/g, '\n');
  } else {
    const decoded = Buffer.from(configured, 'base64').toString('utf8');
    if (decoded.includes('BEGIN')) pem = decoded;
  }
  const key = pem
    ? crypto.createPrivateKey(pem)
    : crypto.createPrivateKey({ key: Buffer.from(configured, 'base64'), format: 'der', type: 'pkcs8' });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('not ed25519');
  return key;
}

function splitPrevious(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed);
    if (!Array.isArray(arr) || arr.some((x) => typeof x !== 'string')) throw new Error('not a string array');
    return arr as string[];
  }
  // Comma separated; PEM blocks may carry literal "\n" sequences.
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
}

function parsePreviousPublicKey(entry: string): crypto.KeyObject {
  if (/PRIVATE/i.test(entry)) throw new Error('private key supplied');
  let key: crypto.KeyObject;
  if (entry.includes('BEGIN')) {
    if (!entry.includes('BEGIN PUBLIC KEY')) throw new Error('not an SPKI public key');
    key = crypto.createPublicKey(entry.replace(/\\n/g, '\n'));
  } else {
    key = crypto.createPublicKey({ key: Buffer.from(entry, 'base64'), format: 'der', type: 'spki' });
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('not ed25519');
  return key;
}

function buildKeyring(): Keyring | InvalidKeyring {
  const configured = process.env.MANDATE_SIGNING_KEY?.trim();
  let privateKey: crypto.KeyObject;
  let persistence: Keyring['persistence'];
  if (configured) {
    try {
      privateKey = parseActivePrivateKey(configured);
    } catch {
      return { status: 'invalid', error: 'MANDATE_SIGNING_KEY is set but is not a valid Ed25519 PKCS#8 private key.' };
    }
    persistence = 'configured';
  } else {
    privateKey = crypto.generateKeyPairSync('ed25519').privateKey;
    persistence = 'ephemeral';
  }
  const publicKey = crypto.createPublicKey(privateKey);
  const active = { privateKey, publicKey, kid: kidOf(publicKey) };

  const previous = new Map<string, crypto.KeyObject>();
  const prevRaw = process.env.MANDATE_PREVIOUS_PUBLIC_KEYS?.trim();
  if (prevRaw) {
    try {
      const entries = splitPrevious(prevRaw);
      if (entries.length > MAX_PREVIOUS_KEYS) throw new Error('too many');
      for (const e of entries) {
        const k = parsePreviousPublicKey(e);
        const kid = kidOf(k);
        if (kid !== active.kid) previous.set(kid, k);
      }
    } catch {
      return {
        status: 'invalid',
        error: `MANDATE_PREVIOUS_PUBLIC_KEYS is set but is not a list (max ${MAX_PREVIOUS_KEYS}) of Ed25519 SPKI public keys; private keys are not accepted.`,
      };
    }
  }
  return { status: 'ok', active, previous, persistence };
}

function keyring(): Keyring | InvalidKeyring {
  if (!cached) cached = buildKeyring();
  return cached;
}

function okKeyring(): Keyring {
  const k = keyring();
  if (k.status === 'invalid') throw new MandateConfigError(k.error);
  return k;
}

/** Test hook: forget the cached keyring so a new configuration is picked up. */
export function resetMandateKeyForTests(): void {
  cached = undefined;
}

/** Safe status for /api/health: never throws, never exposes key material. */
export function mandateKeyStatus():
  | { ok: true; keyPersistence: 'configured' | 'ephemeral'; activeKid: string; previousKids: string[] }
  | { ok: false; keyPersistence: 'invalid'; error: string } {
  const k = keyring();
  if (k.status === 'invalid') return { ok: false, keyPersistence: 'invalid', error: k.error };
  return { ok: true, keyPersistence: k.persistence, activeKid: k.active.kid, previousKids: [...k.previous.keys()] };
}

/** Boot-time guard: a configured but unusable key must stop the server instead of degrading silently. */
export function assertMandateConfig(): void {
  okKeyring();
}

/**
 * FIX-05 (verification findings R1/R2/R3): in production the Cart Mandate signing key must be
 * CONFIGURED, never generated at boot. An ephemeral key means every mandate issued before the
 * last restart becomes unverifiable, which silently breaks the guarantee the discovery documents
 * advertise — the same class of defect as a volatile database. Fail closed instead of warning.
 *
 * Outside production an ephemeral key stays allowed (local development, tests).
 */
export function assertMandateKeyPersistence(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const k = keyring();
  // An unusable key is already fatal through assertMandateConfig().
  if (k.status === 'invalid') return;
  if (k.persistence === 'ephemeral') {
    throw new Error(
      'MANDATE_SIGNING_KEY is not set: refusing to start in production with an ephemeral Cart Mandate key ' +
        '(mandates signed before a restart could not be verified). Generate one with `npm run mandate:keygen` ' +
        'and set MANDATE_SIGNING_KEY in the host environment before deploying.'
    );
  }
}

export function publicKeyDocument() {
  const k = okKeyring();
  const jwkOf = (key: crypto.KeyObject) => key.export({ format: 'jwk' }) as { kty: string; crv: string; x: string };
  return {
    keys: [
      { ...jwkOf(k.active.publicKey), kid: k.active.kid, alg: 'EdDSA', use: 'sig', status: 'active' },
      ...[...k.previous.entries()].map(([kid, key]) => ({ ...jwkOf(key), kid, alg: 'EdDSA', use: 'sig', status: 'previous' })),
    ],
    // 'ephemeral' = generated at boot: mandates issued before the last restart cannot be verified.
    keyPersistence: k.persistence,
    version: MANDATE_VERSION,
    canonicalization: CANONICALIZATION,
  };
}

function sessionBinding(sessionId: string): string {
  return crypto.createHash('sha256').update(`mandate-session:${sessionId}`).digest('hex').slice(0, 16);
}

export function buildCartMandate(order: Order, expiresAt?: string): CartMandate {
  const issued = new Date(order.createdAt);
  const expires = expiresAt ?? new Date(issued.getTime() + env.RESERVATION_MAX_AGE_MS).toISOString();
  return {
    version: MANDATE_VERSION,
    mandateId: `mdt_${crypto.createHash('sha256').update(`mandate:${order.id}`).digest('hex').slice(0, 20)}`,
    orderId: order.id,
    merchant: { id: currentBusiness.businessId, name: currentBusiness.name },
    currency: order.currency,
    totalMinor: order.totalMinor,
    items: [...order.items]
      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
        lineTotalMinor: i.lineTotalMinor,
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
    origin: order.origin,
    issuedAt: issued.toISOString(),
    expiresAt: expires,
    sessionBinding: sessionBinding(order.sessionId),
    constraints: {
      agentMayAuthorizePayment: false,
      paymentAuthority: 'buyer_approval_at_paypal',
      pricesSetByServer: true,
      policyEnforcedByServer: true,
      ...(order.policyAppliedLimits ? { appliedLimits: order.policyAppliedLimits } : {}),
    },
  };
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Signs with the single ACTIVE private key. */
export function signCartMandate(order: Order): SignedCartMandate {
  const k = okKeyring();
  const mandate = buildCartMandate(order);
  const signature = crypto.sign(null, Buffer.from(stringify(mandate)), k.active.privateKey);
  return { mandate, signature: b64url(signature), alg: 'EdDSA', kid: k.active.kid, canonicalization: CANONICALIZATION };
}

/**
 * Stage 3: sign an arbitrary canonical JSON object with the SAME keyring used
 * for Cart Mandates. Used to sign the evidence package, so a single verifiable
 * key set covers both the mandate and the assembled evidence.
 */
export function signPayload(payload: object): { signature: string; kid: string } {
  const k = okKeyring();
  const canonical = Buffer.from(stringify(payload));
  const signature = crypto.sign(null, canonical, k.active.privateKey);
  return { signature: b64url(signature), kid: k.active.kid };
}

export function verifyPayloadSignature(signature: string, kid: string, payload: object): boolean {
  const k = okKeyring();
  const key = kid === k.active.kid ? k.active.publicKey : k.previous.get(kid);
  if (!key) return false;
  try {
    return crypto.verify(null, Buffer.from(stringify(payload)), key, fromB64url(signature));
  } catch {
    return false;
  }
}

export function verifyCartMandate(
  input: { mandate?: unknown; signature?: unknown; kid?: unknown; canonicalization?: unknown; alg?: unknown },
  lookupOrder: (orderId: string) => Order | undefined,
  now: Date = new Date()
): MandateVerification {
  const checks: MandateVerification['checks'] = {
    knownKey: false,
    signature: false,
    notExpired: false,
    matchesOrder: null,
  };
  const { mandate, signature, kid } = input;
  if (!mandate || typeof mandate !== 'object' || typeof signature !== 'string' || typeof kid !== 'string') {
    return { valid: false, checks, reason: 'Expected { mandate, signature, kid, canonicalization }.' };
  }
  if (input.canonicalization !== CANONICALIZATION) {
    return { valid: false, checks, reason: `Unsupported canonicalization; expected ${CANONICALIZATION}.` };
  }
  if (input.alg !== undefined && input.alg !== 'EdDSA') {
    return { valid: false, checks, reason: 'Unsupported alg; expected EdDSA.' };
  }
  const k = okKeyring();
  const verifyKey = kid === k.active.kid ? k.active.publicKey : k.previous.get(kid);
  checks.knownKey = verifyKey !== undefined;
  if (!verifyKey) {
    return { valid: false, checks, reason: 'Unknown signing key (kid). It is neither the active key nor a configured previous key.' };
  }
  try {
    checks.signature = crypto.verify(null, Buffer.from(stringify(mandate)), verifyKey, fromB64url(signature));
  } catch {
    checks.signature = false;
  }
  if (!checks.signature) {
    return { valid: false, checks, reason: 'Signature does not match the mandate content.' };
  }
  const m = mandate as CartMandate;
  // expiresAt is read from the signed mandate; it is never recomputed from the current configuration.
  const expiresMs = typeof m.expiresAt === 'string' ? new Date(m.expiresAt).getTime() : NaN;
  checks.notExpired = Number.isFinite(expiresMs) && expiresMs > now.getTime();
  const order = typeof m.orderId === 'string' ? lookupOrder(m.orderId) : undefined;
  if (order) {
    // Compare everything the order determines; expiresAt is a signed constant, not derived from the order.
    const { expiresAt: _liveExp, ...live } = buildCartMandate(order, typeof m.expiresAt === 'string' ? m.expiresAt : undefined);
    const { expiresAt: _signedExp, ...signed } = m;
    checks.matchesOrder = stringify(live) === stringify(signed);
  }
  const valid = checks.signature && checks.matchesOrder !== false;
  return {
    valid,
    checks,
    reason: valid
      ? checks.notExpired
        ? undefined
        : 'Genuine, but the mandate window has passed.'
      : 'Mandate is genuine but no longer matches the stored order.',
  };
}

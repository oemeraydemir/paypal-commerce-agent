import crypto from 'crypto';
import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import stringify from 'fast-json-stable-stringify';
import { currentBusiness } from '../config/business-config';

// Outbound business events for no-code automation (Zapier "Catch Hook", Make, n8n, a Slack bridge...).
//
// Optional and best-effort: it never blocks, never throws and never changes an order or a payment.
// Only business facts leave the server (ids, amounts, status): no session tokens, no PayPal secrets.
//
// DELIVERY GUARANTEES (read before relying on this):
//  - NOT durable. There is no outbox: events are sent from memory, so a process restart or crash can
//    lose them. Up to 2 attempts per event, no persistence between attempts.
//  - Retries can produce duplicates (a timeout may hide a request the receiver did process) and there
//    is no guarantee of delivery, so this is neither exactly-once nor a reliable at-least-once queue.
//    Consumers MUST deduplicate on the event id (X-AiCafe-Event-Id / body.id). order.paid and
//    refund.completed carry a stable id derived from the order / refund id, so a repeat after a
//    restart has the same id.
//  - Not production-grade messaging; a durable outbox with backoff is deliberately deferred.
//
// SIGNATURE (when AUTOMATION_WEBHOOK_SECRET is set):
//  X-AiCafe-Timestamp: unix seconds when THIS attempt was signed
//  X-AiCafe-Signature: sha256=<hex HMAC-SHA256 over `${timestamp}.${rawBody}` with the shared secret>
//  Consumers must recompute the HMAC over the raw bytes, compare in constant time, reject timestamps
//  outside a window (verifyAutomationSignature defaults to 300 s) and drop repeated event ids.

export type AutomationEventType = 'order.paid' | 'order.policy_blocked' | 'refund.completed';

export interface AutomationEnvelope {
  id: string;
  type: AutomationEventType;
  createdAt: string;
  merchant: { id: string; name: string };
  data: Record<string, unknown>;
}

export interface AutomationStats {
  enabled: boolean;
  /** AUTOMATION_WEBHOOK_URL is set (even if it was refused). */
  configured: boolean;
  /** Why a configured URL is not used; never includes the URL (Zapier hook URLs are secrets). */
  configError?: string;
  signed: boolean;
  sent: number;
  failed: number;
  rejected: number;
  lastStatus?: number | 'error' | 'rejected';
}

const MAX_DEDUPE_ENTRIES = 2000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 200;
const TIMEOUT_MS = 4000;

const stats = {
  sent: 0,
  failed: 0,
  rejected: 0,
  lastStatus: undefined as number | 'error' | 'rejected' | undefined,
};
// Bounded, in-memory only. Evicting the oldest entry can allow a repeat, which the stable event id covers.
const announced = new Set<string>();

export function resetAutomationStatsForTests(): void {
  stats.sent = 0;
  stats.failed = 0;
  stats.rejected = 0;
  stats.lastStatus = undefined;
  announced.clear();
}

export function dedupeSizeForTests(): number {
  return announced.size;
}

/* ------------------------------ destination safety ------------------------------ */

export class UnsafeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeTargetError';
  }
}

const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as Array<[string, number]>) {
  blocked.addSubnet(net4, prefix, 'ipv4');
}
for (const [net6, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as Array<[string, number]>) {
  blocked.addSubnet(net6, prefix, 'ipv6');
}
const loopbackOnly = new net.BlockList();
loopbackOnly.addSubnet('127.0.0.0', 8, 'ipv4');
loopbackOnly.addAddress('::1', 'ipv6');

/** Extracts the IPv4 address from an IPv4-mapped IPv6 literal (::ffff:a.b.c.d or ::ffff:7f00:1). */
function mappedIPv4(ip: string): string | undefined {
  const m = /^::ffff:(.+)$/i.exec(ip);
  if (!m) return undefined;
  if (net.isIPv4(m[1])) return m[1];
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(m[1]);
  if (!hex) return undefined;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** true when sending to this address is forbidden. allowLoopback only ever lifts loopback, nothing else. */
export function isForbiddenAddress(ip: string, opts: { allowLoopback?: boolean } = {}): boolean {
  const mapped = mappedIPv4(ip);
  const addr = mapped ?? ip;
  const family = net.isIPv4(addr) ? 'ipv4' : net.isIPv6(addr) ? 'ipv6' : undefined;
  if (!family) return true; // not an IP at all: refuse
  if (opts.allowLoopback && loopbackOnly.check(addr, family)) return false;
  return blocked.check(addr, family);
}

/** Local receivers (a dev n8n, the test receiver) are only ever allowed outside production, and only on request. */
function allowLocalTargets(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.AUTOMATION_ALLOW_LOCAL_TARGETS === 'true';
}

const LOCAL_NAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

/** Static (no DNS) validation of the configured URL. Throws UnsafeTargetError. */
export function validateAutomationUrl(raw: string, allowLocal = allowLocalTargets()): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeTargetError('AUTOMATION_WEBHOOK_URL is not a valid URL.');
  }
  if (u.username || u.password) throw new UnsafeTargetError('Credentials inside the URL are not allowed.');
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UnsafeTargetError('Only https is allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const literal = net.isIP(host) !== 0;
  if (literal && isForbiddenAddress(host, { allowLoopback: allowLocal })) {
    throw new UnsafeTargetError('Destination address is private, loopback, link-local or otherwise reserved.');
  }
  if (!literal && LOCAL_NAME.test(host) && !(allowLocal && /(^|\.)localhost$/i.test(host))) {
    throw new UnsafeTargetError('Destination host name is local or internal.');
  }
  if (u.protocol === 'http:') {
    const loopbackHost = literal ? isForbiddenAddress(host) && !isForbiddenAddress(host, { allowLoopback: true }) : /(^|\.)localhost$/i.test(host);
    if (!(allowLocal && loopbackHost)) throw new UnsafeTargetError('Plain http is only accepted for a local receiver outside production.');
  }
  return u;
}

/**
 * dns.lookup replacement used for the real connection. It resolves once and the socket connects to exactly
 * the addresses that were checked, which closes the DNS-rebinding window between "check" and "connect".
 * Every resolved address must be allowed, otherwise the connection is refused.
 */
function safeLookup(allowLocal: boolean) {
  return (
    hostname: string,
    options: dns.LookupOptions | number | undefined,
    callback: (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void
  ): void => {
    const wantsAll = typeof options === 'object' && options !== null && options.all === true;
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err);
      if (!addresses || addresses.length === 0) return callback(new UnsafeTargetError('No address resolved.') as NodeJS.ErrnoException);
      if (addresses.some((a) => isForbiddenAddress(a.address, { allowLoopback: allowLocal }))) {
        return callback(new UnsafeTargetError('Destination resolves to a forbidden address.') as NodeJS.ErrnoException);
      }
      if (wantsAll) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/* ------------------------------ signing ------------------------------ */

export function signAutomationPayload(body: string, timestamp: string | number, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/** Reference verifier for consumers (and tests). Replay protection beyond the window needs event-id dedupe. */
export function verifyAutomationSignature(input: {
  body: string;
  timestamp: string | undefined;
  signature: string | undefined;
  secret: string;
  toleranceSeconds?: number;
  now?: Date;
}): { valid: boolean; reason?: string } {
  const { body, timestamp, signature, secret } = input;
  if (!timestamp || !signature) return { valid: false, reason: 'Missing timestamp or signature.' };
  if (!/^\d{1,12}$/.test(timestamp)) return { valid: false, reason: 'Malformed timestamp.' };
  const nowSec = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSec - Number(timestamp)) > (input.toleranceSeconds ?? 300)) {
    return { valid: false, reason: 'Timestamp outside the accepted window.' };
  }
  const expected = Buffer.from(signAutomationPayload(body, timestamp, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { valid: false, reason: 'Signature mismatch.' };
  }
  return { valid: true };
}

/* ------------------------------ configuration & stats ------------------------------ */

function configuredUrl(): { url?: URL; configured: boolean; error?: string } {
  const raw = process.env.AUTOMATION_WEBHOOK_URL?.trim();
  if (!raw) return { configured: false };
  try {
    return { url: validateAutomationUrl(raw), configured: true };
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : 'Invalid destination.' };
  }
}

export function automationStats(): AutomationStats {
  const c = configuredUrl();
  return {
    enabled: c.url !== undefined,
    configured: c.configured,
    ...(c.error ? { configError: c.error } : {}),
    signed: Boolean(process.env.AUTOMATION_WEBHOOK_SECRET?.trim()),
    ...stats,
  };
}

/* ------------------------------ delivery ------------------------------ */

function post(url: URL, body: string, headers: Record<string, string>, allowLocal: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    // No redirect is ever followed (http(s).request does not), so a 3xx answer is simply a failure.
    const req = mod.request(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
        lookup: safeLookup(allowLocal) as unknown as net.LookupFunction,
        agent: false,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * Fire-and-forget. Resolves when delivery finished (tests await it); callers must not rely on it.
 * Never throws or rejects, not even synchronously: it is called from payment code paths.
 */
export function emitAutomationEvent(
  type: AutomationEventType,
  data: Record<string, unknown>,
  opts: { dedupeKey?: string } = {}
): Promise<void> {
  try {
    return emitInner(type, data, opts);
  } catch {
    return Promise.resolve();
  }
}

function emitInner(
  type: AutomationEventType,
  data: Record<string, unknown>,
  opts: { dedupeKey?: string }
): Promise<void> {
  const c = configuredUrl();
  if (!c.configured) return Promise.resolve();
  let id = `evt_${crypto.randomUUID()}`;
  if (opts.dedupeKey) {
    const key = `${type}:${opts.dedupeKey}`;
    if (announced.has(key)) return Promise.resolve();
    announced.add(key);
    if (announced.size > MAX_DEDUPE_ENTRIES) {
      const oldest = announced.values().next().value as string | undefined;
      if (oldest !== undefined) announced.delete(oldest);
    }
    id = `evt_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
  }
  if (!c.url) {
    // Configured but refused (unsafe or invalid destination): count it, log without the URL.
    stats.rejected += 1;
    stats.lastStatus = 'rejected';
    console.warn(`AUTOMATION_TARGET_REJECTED type=${type} event=${id} reason="${c.error}"`);
    return Promise.resolve();
  }
  const url = c.url;
  const allowLocal = allowLocalTargets();
  const envelope: AutomationEnvelope = {
    id,
    type,
    createdAt: new Date().toISOString(),
    merchant: { id: currentBusiness.businessId, name: currentBusiness.name },
    data,
  };
  const body = stringify(envelope);
  const secret = process.env.AUTOMATION_WEBHOOK_SECRET?.trim();

  return (async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AiCafe-Automation/1',
        'X-AiCafe-Event': type,
        'X-AiCafe-Event-Id': envelope.id,
        'X-AiCafe-Timestamp': timestamp,
      };
      if (secret) headers['X-AiCafe-Signature'] = signAutomationPayload(body, timestamp, secret);
      try {
        const status = await post(url, body, headers, allowLocal);
        stats.lastStatus = status;
        if (status >= 200 && status < 300) {
          stats.sent += 1;
          return;
        }
        if (status < 500) break; // 4xx and 3xx will not get better by retrying
      } catch (e) {
        if (e instanceof UnsafeTargetError || (e as { cause?: unknown })?.cause instanceof UnsafeTargetError) {
          stats.rejected += 1;
          stats.lastStatus = 'rejected';
          console.warn(`AUTOMATION_TARGET_REJECTED type=${type} event=${envelope.id}`);
          return;
        }
        stats.lastStatus = 'error';
      }
      if (attempt + 1 < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
    stats.failed += 1;
    console.warn(`AUTOMATION_DELIVERY_FAILED type=${type} event=${envelope.id}`);
  })().catch(() => undefined);
}

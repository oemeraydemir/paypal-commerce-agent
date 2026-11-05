import type { Request } from 'express';
import { env } from './environment';

// Public base URL used inside discovery documents (manifest, agent card, llms.txt, product feed).
//
// Production: the URL MUST be configured (PUBLIC_BASE_URL, or RENDER_EXTERNAL_URL which Render injects).
// It is never derived from the Host or X-Forwarded-* request headers, because those are attacker-controlled
// and the documents are served with a public Cache-Control (host-header / cache poisoning).
// Development and tests: with nothing configured the server's own loopback origin is used and responses are
// not cacheable. The request is never consulted, in ANY environment.

export type PublicBaseUrl =
  | { ok: true; url: string; configured: boolean }
  | { ok: false; reason: string };

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function normalise(raw: string | undefined, source: string): { url?: string; error?: string } {
  const value = raw?.trim();
  if (!value) return {};
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { error: `${source} is not a valid URL.` };
  }
  const httpOk = !isProduction() && u.protocol === 'http:';
  if (u.protocol !== 'https:' && !httpOk) {
    return { error: `${source} must be an https URL${isProduction() ? '' : ' (http is accepted outside production)'}.` };
  }
  if (u.username || u.password || u.search || u.hash) {
    return { error: `${source} must not contain credentials, a query string or a fragment.` };
  }
  return { url: `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}` };
}

/** The explicitly configured public URL, or an error description when it is set but unusable. */
export function configuredPublicBaseUrl(): { url?: string; error?: string } {
  const explicit = normalise(process.env.PUBLIC_BASE_URL, 'PUBLIC_BASE_URL');
  if (explicit.url || explicit.error) return explicit;
  return normalise(process.env.RENDER_EXTERNAL_URL, 'RENDER_EXTERNAL_URL');
}

/** Throws when the production configuration cannot produce safe discovery URLs. Used at boot. */
export function assertPublicUrlConfig(): void {
  if (!isProduction()) {
    const c = configuredPublicBaseUrl();
    if (c.error) throw new Error(c.error);
    return;
  }
  const c = configuredPublicBaseUrl();
  if (c.error) throw new Error(c.error);
  if (!c.url) {
    throw new Error('PUBLIC_BASE_URL (or RENDER_EXTERNAL_URL) must be set in production for discovery documents.');
  }
}

/**
 * Resolves the public base URL for discovery documents.
 *
 * The request is deliberately NOT consulted: `Host`, `X-Forwarded-Host` and
 * `X-Forwarded-Proto` are attacker-controlled, and these documents are served with a
 * public `Cache-Control`, so reflecting them would be a host-header cache-poisoning
 * vector. With nothing configured the server falls back to its own loopback origin
 * (development convenience only); anything beyond that must be set explicitly.
 */
export function resolvePublicBaseUrl(_req: Request): PublicBaseUrl {
  const c = configuredPublicBaseUrl();
  if (c.error) return { ok: false, reason: c.error };
  if (c.url) return { ok: true, url: c.url, configured: true };
  if (isProduction()) {
    return { ok: false, reason: 'PUBLIC_BASE_URL is not configured.' };
  }
  return { ok: true, url: `http://localhost:${env.PORT}`, configured: false };
}

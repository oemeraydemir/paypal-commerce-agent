import { currentBusiness } from './business-config';
import { AppError } from '../middleware/error-handler';
import type { Request, Response, NextFunction } from 'express';

// ──────────────────────────────────────────────────────────────────────────────
// Tenant (business) boundary.
//
// This deployment serves EXACTLY ONE business. The business identity is a
// server-side fact: it comes from the business profile / built-in defaults at
// boot and never from the request. This module makes that rule explicit and
// executable:
//
//   • getTenantContext() is the ONLY way route handlers should read the tenant.
//   • rejectClientTenantOverride() refuses any request that tries to claim a
//     business identity, price or merchant account of its own.
//
// It is NOT a multi-tenant implementation: there is no tenant table, no
// per-request tenant resolution and no row-level security. See
// docs/MULTI_TENANT_READINESS.md for what a real multi-tenant build still needs.
// ──────────────────────────────────────────────────────────────────────────────

/** Fields a client must never use to select or spoof the business. */
export const CLIENT_TENANT_FIELDS = [
  'businessId',
  'business_id',
  'tenantId',
  'tenant_id',
  'merchantId',
  'merchant_id',
] as const;

export type ClientTenantField = (typeof CLIENT_TENANT_FIELDS)[number];

/** The trusted, server-owned tenant context for this process. */
export interface TenantContext {
  businessId: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
}

/** Trusted tenant context. Reads only boot-time configuration, never the request. */
export function getTenantContext(): TenantContext {
  return {
    businessId: currentBusiness.businessId,
    name: currentBusiness.name,
    currency: currentBusiness.currency,
    locale: currentBusiness.locale,
    timezone: currentBusiness.timezone,
  };
}

export type TenantOverrideCheck =
  | { ok: true }
  | { ok: false; field: ClientTenantField | string; reason: 'present' | 'mismatch' };

/**
 * Rejects a request body that carries a client-chosen business identity.
 * Presence alone is refused: a client has no reason to send it, and accepting
 * "the same value" would train callers to believe the field is meaningful.
 * Only the top level of the body is inspected — nested objects are catalog data.
 */
export function checkClientTenantOverride(body: unknown): TenantOverrideCheck {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: true };
  const record = body as Record<string, unknown>;
  for (const field of CLIENT_TENANT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      return { ok: false, field, reason: 'present' };
    }
  }
  return { ok: true };
}

/**
 * Express middleware: 400 when the request tries to select the business.
 * Mounted globally after JSON parsing, so every API route inherits it.
 */
export function rejectClientTenantOverride(req: Request, _res: Response, next: NextFunction) {
  const check = checkClientTenantOverride(req.body);
  if (!check.ok) {
    return next(
      new AppError(
        400,
        `Client-supplied "${check.field}" is not accepted: the business is determined by the server.`,
        { code: 'TENANT_OVERRIDE_REJECTED', field: check.field }
      )
    );
  }
  next();
}

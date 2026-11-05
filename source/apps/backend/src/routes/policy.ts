import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { AppError } from '../middleware/error-handler';
import { policyStorage } from '../policy/storage';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import { currentBusiness } from '../config/business-config';
import { PurchasePolicy } from '../policy/domain';
import { getRepos } from '../persistence/registry';
import { increasesAuthority, mandateAudit, snapshotOf } from '../policy/mandate-audit';
import { allowanceScopeService, AllowanceScope } from '../policy/allowance-scope';
import { publicSessionRef } from '../session';
import { OrderOrigin } from '../orders/domain';
import { peekAIPreparedSession } from '../ai/session-tracker';

// Scoped AI Allowance (Stage 2): a shopper can inspect and update THEIR OWN
// session-scoped allowance (limits + optional expiry). Ownership is the
// authenticated session: the userId is never taken from the body. The policy
// storage is the single source of truth and remains server-authoritative at
// /orders/create + /capture.

const router = Router();

function boundsError(field: string, expected: string, actual: unknown): AppError {
  return new AppError(400, `${field} must be ${expected} (got ${JSON.stringify(actual)}).`);
}

function toNumber(v: unknown, field: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw boundsError(field, 'a finite number', v);
}

function toIsoOrUndefined(v: unknown, field: string): string | undefined {
  if (v === null || v === '') return undefined;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw boundsError(field, 'an ISO-8601 date', v);
  return d.toISOString();
}

function toStringArray(v: unknown, field: string): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw boundsError(field, 'an array of strings', v);
  }
  return [...(v as string[])];
}

/** Sanitized view of the caller's own policy; never leaks other users. */
async function policyView(userId: string): Promise<Record<string, unknown>> {
  const policy = await policyStorage.getAuthoritativePolicy(userId);
  const repos = getRepos();
  let spent = dailySpendTracker.getSpentToday(userId);
  let pending = dailySpendTracker.getPendingReservations(userId);
  let billReserved = 0;
  if (repos) {
    const now = new Date();
    const usage = await repos.reservations.getDailyUsage(
      userId, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    );
    spent = usage.spentMinor;
    pending = usage.pendingMinor;
    billReserved = usage.billReservedMinor;
  }
  const remaining = Math.max(
    0,
    policy.dailySpendLimitMinor - spent - pending - billReserved
  );
  const lastEvent = await policyStorage.getLastMandateEvent(userId);
  return {
    enabled: policy.enabled,
    currency: policy.currency,
    validUntil: policy.validUntil ? policy.validUntil.toISOString() : null,
    // The PATCH is the shopper's explicit mandate change/renewal event.
    updatedAt: policy.updatedAt.toISOString(),
    mandateRevision: policyStorage.getRevision(userId),
    lastAuthorizationEvent: lastEvent ? {
      id: lastEvent.id,
      type: lastEvent.eventType,
      revision: lastEvent.revision,
      occurredAt: lastEvent.occurredAt.toISOString(),
      amountMinor: lastEvent.amountMinor ?? null,
      currency: lastEvent.currency ?? null,
      subjectId: lastEvent.subjectId ?? null,
    } : null,
    limits: {
      maxPerPurchaseMinor: policy.maxPerPurchaseMinor,
      dailySpendLimitMinor: policy.dailySpendLimitMinor,
      confirmationThresholdMinor: policy.confirmationThresholdMinor,
      allowedMerchantIds: policy.allowedMerchantIds,
      blockedCategoryIds: policy.blockedCategoryIds,
      requiredDietaryAttributes: policy.requiredDietaryAttributes,
      blockedDietaryAttributes: policy.blockedDietaryAttributes,
    },
    usage: {
      spentTodayMinor: spent,
      pendingMinor: pending,
      billReservedMinor: billReserved,
      remainingTodayMinor: remaining,
    },
    // Priority 4: optional risk-style rules (empty/null when not configured).
    rules: {
      nightWindow: policy.nightWindow ?? null,
      categorySpendLimits: policy.categorySpendLimits ?? {},
      maxOrdersPerHour: policy.maxOrdersPerHour ?? null,
      allowedCountries: policy.allowedCountries ?? [],
    },
  };
}

router.get('/policy', requireSession, async (_req, res, next) => {
  try { res.json(await policyView(_req.session!.userId)); } catch (err) { next(err); }
});

// Immutable (hash-chained) history of changes to the caller's own spending mandate. Lets a
// shopper (or an auditor) see exactly which mandate version was in force when, and verify the
// chain has not been edited. Read-only; recording happens on every PATCH below.
router.get('/policy/audit', requireSession, (req, res) => {
  const userId = req.session!.userId;
  res.set('Cache-Control', 'no-store');
  res.json({ events: mandateAudit.list(userId), chainValid: mandateAudit.verify(userId) });
});

router.patch('/policy', requireSession, async (req, res, next) => {
  try {
    const userId = req.session!.userId;
    const policy = await policyStorage.getAuthoritativePolicy(userId);
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Only whitelisted fields are accepted; anything else is ignored (never truth).
    const updates: Partial<PurchasePolicy> = {};

    const maxPerPurchaseMinor = toNumber(body.maxPerPurchaseMinor, 'maxPerPurchaseMinor');
    if (maxPerPurchaseMinor !== undefined) {
      if (!Number.isSafeInteger(maxPerPurchaseMinor) || maxPerPurchaseMinor <= 0) {
        throw boundsError('maxPerPurchaseMinor', 'a positive integer', maxPerPurchaseMinor);
      }
      updates.maxPerPurchaseMinor = maxPerPurchaseMinor;
    }

    const dailySpendLimitMinor = toNumber(body.dailySpendLimitMinor, 'dailySpendLimitMinor');
    if (dailySpendLimitMinor !== undefined) {
      if (!Number.isSafeInteger(dailySpendLimitMinor) || dailySpendLimitMinor <= 0) {
        throw boundsError('dailySpendLimitMinor', 'a positive integer', dailySpendLimitMinor);
      }
      updates.dailySpendLimitMinor = dailySpendLimitMinor;
    }

    const confirmationThresholdMinor = toNumber(body.confirmationThresholdMinor, 'confirmationThresholdMinor');
    if (confirmationThresholdMinor !== undefined) {
      if (!Number.isSafeInteger(confirmationThresholdMinor) || confirmationThresholdMinor < 0) {
        throw boundsError('confirmationThresholdMinor', 'a non-negative integer', confirmationThresholdMinor);
      }
      updates.confirmationThresholdMinor = confirmationThresholdMinor;
    }

    const validUntilRaw = body.validUntil;
    if (validUntilRaw !== undefined) {
      const validUntil = toIsoOrUndefined(validUntilRaw, 'validUntil');
      if (validUntil !== undefined) {
        const at = new Date(validUntil).getTime();
        if (at <= Date.now()) throw boundsError('validUntil', 'a future date', validUntilRaw);
      }
      updates.validUntil = validUntil !== undefined ? new Date(validUntil) : undefined;
    }

    const allowedMerchantIds = toStringArray(body.allowedMerchantIds, 'allowedMerchantIds');
    if (allowedMerchantIds !== undefined) updates.allowedMerchantIds = allowedMerchantIds;

    const blockedCategoryIds = toStringArray(body.blockedCategoryIds, 'blockedCategoryIds');
    if (blockedCategoryIds !== undefined) updates.blockedCategoryIds = blockedCategoryIds;

    const requiredDietaryAttributes = toStringArray(body.requiredDietaryAttributes, 'requiredDietaryAttributes');
    if (requiredDietaryAttributes !== undefined) updates.requiredDietaryAttributes = requiredDietaryAttributes;

    const blockedDietaryAttributes = toStringArray(body.blockedDietaryAttributes, 'blockedDietaryAttributes');
    if (blockedDietaryAttributes !== undefined) updates.blockedDietaryAttributes = blockedDietaryAttributes;

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw boundsError('enabled', 'a boolean', body.enabled);
      updates.enabled = body.enabled;
    }

    // ---- Priority 4: optional risk-style rules (null clears a rule) ----------
    if (body.maxOrdersPerHour !== undefined) {
      if (body.maxOrdersPerHour === null) {
        updates.maxOrdersPerHour = undefined;
      } else {
        const n = toNumber(body.maxOrdersPerHour, 'maxOrdersPerHour');
        if (n === undefined || !Number.isSafeInteger(n) || n < 0) {
          throw boundsError('maxOrdersPerHour', 'a non-negative integer', body.maxOrdersPerHour);
        }
        updates.maxOrdersPerHour = n;
      }
    }

    if (body.nightWindow !== undefined) {
      if (body.nightWindow === null) {
        updates.nightWindow = undefined;
      } else {
        const nw = (body.nightWindow ?? {}) as Record<string, unknown>;
        const startHour = toNumber(nw.startHour, 'nightWindow.startHour');
        const endHour = toNumber(nw.endHour, 'nightWindow.endHour');
        const maxMinor = toNumber(nw.maxMinor, 'nightWindow.maxMinor');
        if (startHour === undefined || !Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
          throw boundsError('nightWindow.startHour', 'an integer between 0 and 23', nw.startHour);
        }
        if (endHour === undefined || !Number.isInteger(endHour) || endHour < 0 || endHour > 23) {
          throw boundsError('nightWindow.endHour', 'an integer between 0 and 23', nw.endHour);
        }
        if (maxMinor === undefined || !Number.isSafeInteger(maxMinor) || maxMinor < 0) {
          throw boundsError('nightWindow.maxMinor', 'a non-negative integer', nw.maxMinor);
        }
        updates.nightWindow = { startHour, endHour, maxMinor };
      }
    }

    if (body.categorySpendLimits !== undefined) {
      if (body.categorySpendLimits === null) {
        updates.categorySpendLimits = undefined;
      } else {
        const raw = body.categorySpendLimits;
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          throw boundsError('categorySpendLimits', 'an object of { category: minor }', raw);
        }
        const limits: Record<string, number> = {};
        for (const [category, value] of Object.entries(raw as Record<string, unknown>)) {
          const n = toNumber(value, `categorySpendLimits.${category}`);
          if (n === undefined || !Number.isSafeInteger(n) || n < 0) {
            throw boundsError(`categorySpendLimits.${category}`, 'a non-negative integer', value);
          }
          limits[category] = n;
        }
        updates.categorySpendLimits = limits;
      }
    }

    if (body.allowedCountries !== undefined) {
      if (body.allowedCountries === null) {
        updates.allowedCountries = undefined;
      } else {
        const countries = toStringArray(body.allowedCountries, 'allowedCountries') ?? [];
        updates.allowedCountries = countries.map((c) => c.toUpperCase());
      }
    }

    // Cross-field invariants (mirror business-profile / default-policy rules).
    const nextMax = updates.maxPerPurchaseMinor ?? policy.maxPerPurchaseMinor;
    const nextDaily = updates.dailySpendLimitMinor ?? policy.dailySpendLimitMinor;
    const nextThreshold = updates.confirmationThresholdMinor ?? policy.confirmationThresholdMinor;
    if (nextDaily < nextMax) {
      throw new AppError(422, 'dailySpendLimitMinor must be at least maxPerPurchaseMinor');
    }
    if (nextThreshold > nextMax) {
      throw new AppError(422, 'confirmationThresholdMinor must not exceed maxPerPurchaseMinor');
    }

    const merged: PurchasePolicy = { ...policy, ...updates, updatedAt: new Date() };

    // More spending authority (higher limits, looser threshold, longer or removed expiry, or
    // re-authorizing an expired mandate) is never silent: the caller must confirm it explicitly.
    const before = snapshotOf(policy);
    const after = snapshotOf(merged);
    const grows = increasesAuthority(before, after);
    const confirmed = body.confirmIncrease === true;
    if (grows && !confirmed) {
      throw new AppError(409, 'This change gives the mandate more spending authority. Confirm it explicitly to continue.', {
        code: 'AUTHORIZATION_INCREASE_REQUIRES_CONFIRMATION',
        confirmField: 'confirmIncrease',
      });
    }

    const saved = await policyStorage.updateMandate(merged, req.session!.sessionId);
    if (!saved) throw new AppError(409, 'Spending permission changed in another request; reload and confirm again.', { code: 'MANDATE_CHANGED' });
    mandateAudit.record(userId, before, after, grows && confirmed);
    res.json(await policyView(userId));
  } catch (err) {
    next(err);
  }
});

// ---- Scoped AI Allowance (Stage 2): shopper-managed scopes -------------------
// All scope endpoints are session-bound: the userId comes from the authenticated
// session, never from the body. Scopes are always created server-authoritative;
// an AI-prepared session yields an AGENT_PROPOSED (pending) scope that the
// shopper must approve before it can be used.

function scopeView(s: AllowanceScope): Record<string, unknown> {
  return {
    id: s.id,
    kind: s.kind,
    label: s.label,
    sessionRef: s.sessionRef,
    originsAllowed: s.originsAllowed,
    currency: s.currency,
    maxPerPurchaseMinor: s.maxPerPurchaseMinor ?? null,
    dailySpendLimitMinor: s.dailySpendLimitMinor ?? null,
    categorySpendLimits: s.categorySpendLimits ?? null,
    allowedMerchantIds: s.allowedMerchantIds ?? null,
    nightWindow: s.nightWindow ?? null,
    status: s.status,
    issuedBy: s.issuedBy,
    approvedBy: s.approvedBy ?? null,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    updatedAt: s.updatedAt.toISOString(),
  };
}

interface ScopeCreateBody {
  label: string;
  originsAllowed?: OrderOrigin[];
  currency: string;
  maxPerPurchaseMinor?: number;
  dailySpendLimitMinor?: number;
  categorySpendLimits?: Record<string, number>;
  allowedMerchantIds?: string[];
  nightWindow?: { startHour: number; endHour: number; maxMinor: number };
  expiresAt?: Date;
}

function parseScopeCreate(body: Record<string, unknown>): ScopeCreateBody {
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) throw new AppError(400, 'label is required');
  const currency = typeof body.currency === 'string' ? body.currency : '';
  if (!currency) throw new AppError(400, 'currency is required');

  const originsRaw = body.originsAllowed;
  let originsAllowed: OrderOrigin[] | undefined;
  if (originsRaw !== undefined) {
    if (!Array.isArray(originsRaw) || originsRaw.some((o) => typeof o !== 'string')) {
      throw new AppError(400, 'originsAllowed must be an array of origin strings');
    }
    const valid = Object.values(OrderOrigin);
    originsAllowed = originsRaw as OrderOrigin[];
    if (originsAllowed.some((o) => !valid.includes(o))) {
      throw new AppError(400, 'originsAllowed contains an unknown origin');
    }
  }

  const maxPerPurchaseMinor = toNumber(body.maxPerPurchaseMinor, 'maxPerPurchaseMinor');
  if (maxPerPurchaseMinor !== undefined && (!Number.isSafeInteger(maxPerPurchaseMinor) || maxPerPurchaseMinor <= 0)) {
    throw boundsError('maxPerPurchaseMinor', 'a positive integer', maxPerPurchaseMinor);
  }
  const dailySpendLimitMinor = toNumber(body.dailySpendLimitMinor, 'dailySpendLimitMinor');
  if (dailySpendLimitMinor !== undefined && (!Number.isSafeInteger(dailySpendLimitMinor) || dailySpendLimitMinor <= 0)) {
    throw boundsError('dailySpendLimitMinor', 'a positive integer', dailySpendLimitMinor);
  }

  let categorySpendLimits: Record<string, number> | undefined;
  if (body.categorySpendLimits !== undefined) {
    const raw = body.categorySpendLimits;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw boundsError('categorySpendLimits', 'an object of { category: minor }', raw);
    }
    categorySpendLimits = {};
    for (const [category, value] of Object.entries(raw as Record<string, unknown>)) {
      const n = toNumber(value, `categorySpendLimits.${category}`);
      if (n === undefined || !Number.isSafeInteger(n) || n < 0) {
        throw boundsError(`categorySpendLimits.${category}`, 'a non-negative integer', value);
      }
      categorySpendLimits[category] = n;
    }
  }

  const allowedMerchantIds = toStringArray(body.allowedMerchantIds, 'allowedMerchantIds');

  let nightWindow: ScopeCreateBody['nightWindow'];
  if (body.nightWindow !== undefined) {
    const nw = (body.nightWindow ?? {}) as Record<string, unknown>;
    const startHour = toNumber(nw.startHour, 'nightWindow.startHour');
    const endHour = toNumber(nw.endHour, 'nightWindow.endHour');
    const maxMinor = toNumber(nw.maxMinor, 'nightWindow.maxMinor');
    if (startHour === undefined || !Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
      throw boundsError('nightWindow.startHour', 'an integer between 0 and 23', nw.startHour);
    }
    if (endHour === undefined || !Number.isInteger(endHour) || endHour < 0 || endHour > 23) {
      throw boundsError('nightWindow.endHour', 'an integer between 0 and 23', nw.endHour);
    }
    if (maxMinor === undefined || !Number.isSafeInteger(maxMinor) || maxMinor < 0) {
      throw boundsError('nightWindow.maxMinor', 'a non-negative integer', nw.maxMinor);
    }
    nightWindow = { startHour, endHour, maxMinor };
  }

  const expiresAtRaw = body.expiresAt;
  let expiresAt: Date | undefined;
  if (expiresAtRaw !== undefined) {
    const iso = toIsoOrUndefined(expiresAtRaw, 'expiresAt');
    if (iso === undefined) throw boundsError('expiresAt', 'a future ISO-8601 date', expiresAtRaw);
    expiresAt = new Date(iso);
    if (expiresAt.getTime() <= Date.now()) throw boundsError('expiresAt', 'a future date', expiresAtRaw);
  }

  return { label, originsAllowed, currency, maxPerPurchaseMinor, dailySpendLimitMinor,
    categorySpendLimits, allowedMerchantIds, nightWindow, expiresAt };
}

function mapScopeError(err: unknown): never {
  const code = (err as any)?.code as string | undefined;
  const message = (err as Error)?.message ?? 'Scope operation failed';
  const status: Record<string, number> = {
    SCOPE_NOT_FOUND: 404,
    SCOPE_CURRENCY_MISMATCH: 422,
    SCOPE_ABOVE_CEILING: 422,
    SCOPE_REVOKED: 409,
    SCOPE_PENDING: 409,
  };
  throw new AppError(status[code ?? ''] ?? 400, message, code ? { code } : undefined);
}

router.get('/policy/scopes/:scopeId', requireSession, async (req, res, next) => {
  try {
    const userId = req.session!.userId;
    const scope = allowanceScopeService.get(userId, req.params.scopeId);
    if (!scope) throw new AppError(404, 'Scope not found', { code: 'SCOPE_NOT_FOUND' });
    res.json({ scope: scopeView(scope), events: allowanceScopeService.auditFor(scope.id) });
  } catch (err) { next(err); }
});

router.get('/policy/scopes', requireSession, async (req, res, next) => {
  try {
    const userId = req.session!.userId;
    const scopes = allowanceScopeService.listForUser(userId).map(scopeView);
    res.json({ scopes });
  } catch (err) { next(err); }
});

router.post('/policy/scopes', requireSession, async (req, res, next) => {
  try {
    const userId = req.session!.userId;
    const sessionId = req.session!.sessionId;
    // The issuer origin is server-derived: an AI-prepared session yields a
    // PENDING (agent-proposed) scope; otherwise it is a shopper scope.
    const aiPrepared = peekAIPreparedSession(sessionId);
    const issuerOrigin = aiPrepared === 'AI_AGENT' ? OrderOrigin.AI_AGENT
      : aiPrepared === 'AI_ASSISTED' ? OrderOrigin.AI_ASSISTED
        : OrderOrigin.HUMAN;
    const input = parseScopeCreate((req.body ?? {}) as Record<string, unknown>);
    const scope = await allowanceScopeService.create(
      userId, publicSessionRef(sessionId) ?? '', issuerOrigin, input
    );
    res.status(201).json({ scope: scopeView(scope), pending: scope.status === 'PENDING_APPROVAL' });
  } catch (err) { next(err); }
});

router.post('/policy/scopes/:scopeId/approve', requireSession, async (req, res, next) => {
  try {
    const userId = req.session!.userId;
    const changes: { maxPerPurchaseMinor?: number; dailySpendLimitMinor?: number } = {};
    const max = toNumber(req.body?.maxPerPurchaseMinor, 'maxPerPurchaseMinor');
    if (max !== undefined) {
      if (!Number.isSafeInteger(max) || max <= 0) throw boundsError('maxPerPurchaseMinor', 'a positive integer', max);
      changes.maxPerPurchaseMinor = max;
    }
    const daily = toNumber(req.body?.dailySpendLimitMinor, 'dailySpendLimitMinor');
    if (daily !== undefined) {
      if (!Number.isSafeInteger(daily) || daily <= 0) throw boundsError('dailySpendLimitMinor', 'a positive integer', daily);
      changes.dailySpendLimitMinor = daily;
    }
    const scope = await allowanceScopeService.approve(userId, req.params.scopeId, changes);
    res.json({ scope: scopeView(scope) });
  } catch (err) { next(mapScopeError(err)); }
});

router.post('/policy/scopes/:scopeId/revoke', requireSession, async (req, res, next) => {
  try {
    const scope = await allowanceScopeService.revoke(req.session!.userId, req.params.scopeId);
    res.json({ scope: scopeView(scope) });
  } catch (err) { next(mapScopeError(err)); }
});

export default router;

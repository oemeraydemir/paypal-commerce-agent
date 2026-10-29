import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { AppError } from '../middleware/error-handler';
import { policyStorage } from '../policy/storage';
import { dailySpendTracker } from '../policy/daily-spend-tracker';
import { currentBusiness } from '../config/business-config';
import { PurchasePolicy } from '../policy/domain';

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
function policyView(userId: string): Record<string, unknown> {
  const policy = policyStorage.getOrCreatePolicy(userId);
  const spent = dailySpendTracker.getSpentToday(userId);
  const pending = dailySpendTracker.getPendingReservations(userId);
  const remaining = Math.max(
    0,
    policy.dailySpendLimitMinor - spent - pending
  );
  return {
    enabled: policy.enabled,
    currency: policy.currency,
    validUntil: policy.validUntil ? policy.validUntil.toISOString() : null,
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

router.get('/policy', requireSession, (_req, res) => {
  res.json(policyView(_req.session!.userId));
});

router.patch('/policy', requireSession, (req, res, next) => {
  try {
    const userId = req.session!.userId;
    const policy = policyStorage.getOrCreatePolicy(userId);
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
    policyStorage.setPolicy(merged);
    res.json(policyView(userId));
  } catch (err) {
    next(err);
  }
});

export default router;

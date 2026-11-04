import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

export type AllowanceScopeCreateInput = {
  /** Human-readable label. */
  label: string;
  /** Origins permitted (default all). */
  originsAllowed?: string[];
  /** Currency; must match the shopper policy currency. */
  currency: string;
  /** Per-purchase cap in minor units (optional). */
  maxPerPurchaseMinor?: number;
  /** Daily cap in minor units (optional). */
  dailySpendLimitMinor?: number;
  /** Category caps (optional). */
  categorySpendLimits?: Record<string, number>;
  /** Allowed merchant ids (optional). */
  allowedMerchantIds?: string[];
  /** Night window rule (optional). */
  nightWindow?: Record<string, unknown>;
  /** Expiry (optional). */
  expiresAt?: Date;
};

export const allowanceScopeCreateInputSchema: Schema<AllowanceScopeCreateInput> =
  s.object<AllowanceScopeCreateInput>({
    label: s.string(),
    originsAllowed: s.optional(s.array(s.string())),
    currency: s.string(),
    maxPerPurchaseMinor: s.optional(s.int()),
    dailySpendLimitMinor: s.optional(s.int()),
    categorySpendLimits: s.optional(s.record(s.string(), s.int())),
    allowedMerchantIds: s.optional(s.array(s.string())),
    nightWindow: s.optional(s.record(s.string(), s.unknown())),
    expiresAt: s.optional(s.dateTime()),
  });

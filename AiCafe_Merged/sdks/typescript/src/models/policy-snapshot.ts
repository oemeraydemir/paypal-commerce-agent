import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** Snapshot of the policy that was in effect, captured at decision time. */
export type PolicySnapshot = {
  /** Whether purchase policy is enabled. */
  enabled?: boolean;
  /** ISO 4217 currency code. */
  currency?: string;
  /** Per-purchase cap in minor units. */
  maxPerPurchaseMinor?: number;
  /** Daily spend cap in minor units. */
  dailySpendLimitMinor?: number;
  /** Above this amount, explicit human approval is required (minor units). */
  confirmationThresholdMinor?: number;
  /** Allowed merchant identifiers. */
  allowedMerchantIds?: string[];
  /** Blocked product category identifiers. */
  blockedCategoryIds?: string[];
  /** Policy expiry (RFC 3339). */
  validUntil?: string | null;
  /** Policy revision number. */
  revision?: number | null;
};

export const policySnapshotSchema: Schema<PolicySnapshot> = s.object<PolicySnapshot>({
  enabled: s.optional(s.boolean()),
  currency: s.optional(s.string()),
  maxPerPurchaseMinor: s.optional(s.int()),
  dailySpendLimitMinor: s.optional(s.int()),
  confirmationThresholdMinor: s.optional(s.int()),
  allowedMerchantIds: s.optional(s.array(s.string())),
  blockedCategoryIds: s.optional(s.array(s.string())),
  validUntil: s.optionalNullable(s.string()),
  revision: s.optionalNullable(s.int()),
});

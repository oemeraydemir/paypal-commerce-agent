import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** policy limits. */
export type PolicyLimits = {
  /** ISO 4217 currency code (e.g. EUR) (field). */
  currency?: string;
  /** max per-purchase minor units (field). */
  maxPerPurchaseMinor?: number;
  /** confirmation threshold minor units (field). */
  confirmationThresholdMinor?: number;
  /** daily spend limit minor units (field). */
  dailySpendLimitMinor?: number;
  /** daily spent minor units (field). */
  dailySpentMinor?: number;
  /** daily pending minor units (field). */
  dailyPendingMinor?: number;
  /** daily remaining minor units (field). */
  dailyRemainingMinor?: number;
  /** blocked dietary attributes (field). */
  blockedDietaryAttributes?: string[];
  /** policy enabled (field). */
  policyEnabled?: boolean;
};

export const policyLimitsSchema: Schema<PolicyLimits> = s.object<PolicyLimits>({
  currency: s.optional(s.string()),
  maxPerPurchaseMinor: s.optional(s.int()),
  confirmationThresholdMinor: s.optional(s.int()),
  dailySpendLimitMinor: s.optional(s.int()),
  dailySpentMinor: s.optional(s.int()),
  dailyPendingMinor: s.optional(s.int()),
  dailyRemainingMinor: s.optional(s.int()),
  blockedDietaryAttributes: s.optional(s.array(s.string())),
  policyEnabled: s.optional(s.boolean()),
});

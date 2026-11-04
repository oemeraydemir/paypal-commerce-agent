import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** mandate. */
export type Mandate = {
  /** max per-purchase minor units (field). */
  maxPerPurchaseMinor?: number;
  /** approval threshold minor units (field). */
  approvalThresholdMinor?: number;
  /** cart minor units (field). */
  cartMinor?: number;
  /** Negative when the cart is over the limit. */
  remainingMinor?: number;
  /** used percent (field). */
  usedPercent?: number;
  /**
   * 0..100 position of the approval threshold on the limit bar (server-computed; clients only draw
   * it).
   */
  thresholdPercent?: number;
  /** daily remaining minor units (field). */
  dailyRemainingMinor?: number;
  /** AI can change limit (field). */
  aiCanChangeLimit?: boolean;
};

export const mandateSchema: Schema<Mandate> = s.object<Mandate>({
  maxPerPurchaseMinor: s.optional(s.int()),
  approvalThresholdMinor: s.optional(s.int()),
  cartMinor: s.optional(s.int()),
  remainingMinor: s.optional(s.int()),
  usedPercent: s.optional(s.int()),
  thresholdPercent: s.optional(s.int()),
  dailyRemainingMinor: s.optional(s.int()),
  aiCanChangeLimit: s.optional(s.boolean()),
});

import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

export type AllowanceScopeApproveInput = {
  /** Optional updated per-purchase cap. */
  maxPerPurchaseMinor?: number;
  /** Optional updated daily cap. */
  dailySpendLimitMinor?: number;
};

export const allowanceScopeApproveInputSchema: Schema<AllowanceScopeApproveInput> =
  s.object<AllowanceScopeApproveInput>({
    maxPerPurchaseMinor: s.optional(s.int()),
    dailySpendLimitMinor: s.optional(s.int()),
  });

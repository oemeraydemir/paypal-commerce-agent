import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** orders stats. */
export type OrdersStats = {
  /** total (field). */
  total?: number;
  /** AI assisted (field). */
  aiAssisted?: number;
  /** AI assisted percentage (field). */
  aiAssistedPercentage?: number;
  /** Gross captured amount of PAID orders (before refunds). */
  revenueMinor?: number;
  /** revenue formatted (field). */
  revenueFormatted?: string;
  /** Sum of merchant-approved refunds on paid orders (never more than captured). */
  refundedMinor?: number;
  /** refunded formatted (field). */
  refundedFormatted?: string;
  /** revenueMinor minus refundedMinor; what the merchant keeps. */
  netRevenueMinor?: number;
  /** net revenue formatted (field). */
  netRevenueFormatted?: string;
};

export const ordersStatsSchema: Schema<OrdersStats> = s.object<OrdersStats>({
  total: s.optional(s.int()),
  aiAssisted: s.optional(s.int()),
  aiAssistedPercentage: s.optional(s.float64()),
  revenueMinor: s.optional(s.int()),
  revenueFormatted: s.optional(s.string()),
  refundedMinor: s.optional(s.int()),
  refundedFormatted: s.optional(s.string()),
  netRevenueMinor: s.optional(s.int()),
  netRevenueFormatted: s.optional(s.string()),
});

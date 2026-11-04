import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** A single validated cart line. */
export type Item = {
  /** Product identifier. */
  productId?: string;
  /** Product name. */
  name?: string;
  /** Quantity. */
  quantity?: number;
  /** Unit price in minor units. */
  unitPriceMinor?: number;
  /** Formatted unit price. */
  unitPriceFormatted?: string;
  /** Line total in minor units. */
  lineTotalMinor?: number;
  /** Formatted line total. */
  lineTotalFormatted?: string;
};

export const itemSchema: Schema<Item> = s.object<Item>({
  productId: s.optional(s.string()),
  name: s.optional(s.string()),
  quantity: s.optional(s.int()),
  unitPriceMinor: s.optional(s.int()),
  unitPriceFormatted: s.optional(s.string()),
  lineTotalMinor: s.optional(s.int()),
  lineTotalFormatted: s.optional(s.string()),
});

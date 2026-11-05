import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** product. */
export type Product = {
  /** unique identifier (field). */
  id?: string;
  /** name (field). */
  name?: string;
  /** description (field). */
  description?: string;
  /** Price in minor units (e.g. cents). */
  priceMinor?: number;
  /** ISO 4217 currency code (e.g. EUR) (field). */
  currency?: string;
  /** e.g. vegan, vegetarian, gluten-free */
  dietary?: string[];
  /** tags (field). */
  tags?: string[];
  /** category (field). */
  category?: string;
  /** occasion (field). */
  occasion?: string[];
};

export const productSchema: Schema<Product> = s.object<Product>({
  id: s.optional(s.string()),
  name: s.optional(s.string()),
  description: s.optional(s.string()),
  priceMinor: s.optional(s.int()),
  currency: s.optional(s.string()),
  dietary: s.optional(s.array(s.string())),
  tags: s.optional(s.array(s.string())),
  category: s.optional(s.string()),
  occasion: s.optional(s.array(s.string())),
});

import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** take home item. */
export type TakeHomeItem = {
  /** unique identifier (field). */
  id: string;
  /** title (field). */
  title: string;
  /** brand (field). */
  brand?: string | null;
  /** image url (field). */
  imageUrl?: string | null;
  /** merchant domain (field). */
  merchantDomain?: string | null;
  /** price (field). */
  price?: number | null;
  /** ISO 4217 currency code (e.g. EUR) (field). */
  currency?: string | null;
  /** availability (field). */
  availability?: string | null;
  /** https URL of the retailer page. Outbound link only. */
  url: string;
};

export const takeHomeItemSchema: Schema<TakeHomeItem> = s.object<TakeHomeItem>({
  id: s.string(),
  title: s.string(),
  brand: s.optionalNullable(s.string()),
  imageUrl: s.optionalNullable(s.string()),
  merchantDomain: s.optionalNullable(s.string()),
  price: s.optionalNullable(s.float64()),
  currency: s.optionalNullable(s.string()),
  availability: s.optionalNullable(s.string()),
  url: s.string(),
});

import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { productSchema, type Product } from "./product.js";

/** catalog response. */
export type CatalogResponse = {
  /** number of items (field). */
  count?: number;
  /** products (field). */
  products?: Product[];
};

export const catalogResponseSchema: Schema<CatalogResponse> = s.object<CatalogResponse>({
  count: s.optional(s.int()),
  products: s.optional(s.array(s.lazy(() => productSchema))),
});

import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** items. */
export type Item1 = {
  /** product identifier (field). */
  productId: string;
};

export const item1Schema: Schema<Item1> = s.object<Item1>({
  productId: s.string(),
});

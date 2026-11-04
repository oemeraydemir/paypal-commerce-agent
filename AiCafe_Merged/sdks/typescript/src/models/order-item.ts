import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** order item. */
export type OrderItem = {
  /** product identifier (field). */
  productId: string;
  /** quantity, a positive integer (field). */
  quantity: number;
};

export const orderItemSchema: Schema<OrderItem> = s.object<OrderItem>({
  productId: s.string(),
  quantity: s.int(),
});

import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { orderSchema, type Order } from "./order.js";

/** orders list response. */
export type OrdersListResponse = {
  /** orders (field). */
  orders?: Order[];
  /** total (field). */
  total?: number;
  /** returned (field). */
  returned?: number;
};

export const ordersListResponseSchema: Schema<OrdersListResponse> = s.object<OrdersListResponse>({
  orders: s.optional(s.array(s.lazy(() => orderSchema))),
  total: s.optional(s.int()),
  returned: s.optional(s.int()),
});

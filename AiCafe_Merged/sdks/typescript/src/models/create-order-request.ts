import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { orderItemSchema, type OrderItem } from "./order-item.js";

/** create order request. */
export type CreateOrderRequest = {
  /** items (field). */
  items: OrderItem[];
};

export const createOrderRequestSchema: Schema<CreateOrderRequest> = s.object<CreateOrderRequest>({
  items: s.array(s.lazy(() => orderItemSchema)),
});

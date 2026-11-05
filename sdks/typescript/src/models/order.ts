import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { orderItemSchema, type OrderItem } from "./order-item.js";
import { originSchema, type Origin } from "./origin.js";

/** order. */
export type Order = {
  /** unique identifier (field). */
  id?: string;
  /** Public, non-reversible ref. */
  sessionId?: string;
  /** current status (field). */
  status?: string;
  /** how the order was created (field). */
  origin?: Origin;
  /** total in minor currency units (field). */
  totalMinor?: number;
  /** total formatted (field). */
  totalFormatted?: string;
  /** ISO 4217 currency code (e.g. EUR) (field). */
  currency?: string;
  /** item count (field). */
  itemCount?: number;
  /** creation timestamp (RFC 3339) (field). */
  createdAt?: Date;
  /** last update timestamp (RFC 3339) (field). */
  updatedAt?: Date;
  /** items (field). */
  items?: OrderItem[];
};

export const orderSchema: Schema<Order> = s.object<Order>({
  id: s.optional(s.string()),
  sessionId: s.optional(s.string()),
  status: s.optional(s.string()),
  origin: s.optional(s.lazy(() => originSchema)),
  totalMinor: s.optional(s.int()),
  totalFormatted: s.optional(s.string()),
  currency: s.optional(s.string()),
  itemCount: s.optional(s.int()),
  createdAt: s.optional(s.dateTime()),
  updatedAt: s.optional(s.dateTime()),
  items: s.optional(s.array(s.lazy(() => orderItemSchema))),
});

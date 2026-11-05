import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { originSchema, type Origin } from "./origin.js";

/** create order response. */
export type CreateOrderResponse = {
  /** order identifier (field). */
  orderId?: string;
  /** paypal order id (field). */
  paypalOrderId?: string;
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
  /** approval url (field). */
  approvalUrl?: string | null;
};

export const createOrderResponseSchema: Schema<CreateOrderResponse> = s.object<CreateOrderResponse>({
  orderId: s.optional(s.string()),
  paypalOrderId: s.optional(s.string()),
  status: s.optional(s.string()),
  origin: s.optional(s.lazy(() => originSchema)),
  totalMinor: s.optional(s.int()),
  totalFormatted: s.optional(s.string()),
  currency: s.optional(s.string()),
  approvalUrl: s.optionalNullable(s.string()),
});

import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** propose refund request. */
export type ProposeRefundRequest = {
  /** order identifier (field). */
  orderId: string;
  /** Optional partial refund; omit for the full remaining amount. */
  amountMinor?: number;
  /** explanation for this outcome (field). */
  reason: string;
};

export const proposeRefundRequestSchema: Schema<ProposeRefundRequest> = s.object<ProposeRefundRequest>({
  orderId: s.string(),
  amountMinor: s.optional(s.int()),
  reason: s.string(),
});

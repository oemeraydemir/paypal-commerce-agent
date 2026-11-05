import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { proposedBySchema, type ProposedBy } from "./proposed-by.js";
import { status1Schema, type Status1 } from "./status1.js";

/** refund request. */
export type RefundRequestError = {
  /** unique identifier (field). */
  id: string;
  /** order identifier (field). */
  orderId: string;
  /** Amount in minor units (cents). */
  amountMinor: number;
  /** ISO 4217 currency code (e.g. EUR) (field). */
  currency: string;
  /** explanation for this outcome (field). */
  reason: string;
  /** proposed by (field). */
  proposedBy: ProposedBy;
  /** current status (field). */
  status: Status1;
  /** paypal refund id (field). */
  paypalRefundId?: string;
  /** paypal refund status (field). */
  paypalRefundStatus?: string;
  /**
   * Set when PayPal could not process an approval; the request stays PROPOSED and can be retried
   * safely.
   */
  lastError?: string;
  /** creation timestamp (RFC 3339) (field). */
  createdAt: Date;
  /** last update timestamp (RFC 3339) (field). */
  updatedAt: Date;
  /** time the request was decided (RFC 3339) (field). */
  decidedAt?: Date;
};

export const refundRequestErrorSchema: Schema<RefundRequestError> = s.object<RefundRequestError>({
  id: s.string(),
  orderId: s.string(),
  amountMinor: s.int(),
  currency: s.string(),
  reason: s.string(),
  proposedBy: proposedBySchema,
  status: status1Schema,
  paypalRefundId: s.optional(s.string()),
  paypalRefundStatus: s.optional(s.string()),
  lastError: s.optional(s.string()),
  createdAt: s.dateTime(),
  updatedAt: s.dateTime(),
  decidedAt: s.optional(s.dateTime()),
});

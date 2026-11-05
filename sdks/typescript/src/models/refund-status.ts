import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Lifecycle state of a refund request. */
export const RefundStatus = {
  ValueUnderReviewDescriptionAwaitingMerchantApproval:
    '{"value":"UNDER_REVIEW","description":"Awaiting merchant approval"}',
  ValueApprovedDescriptionApprovedNotYetIssued:
    '{"value":"APPROVED","description":"Approved, not yet issued"}',
  ValueRejectedDescriptionRejected: '{"value":"REJECTED","description":"Rejected"}',
  ValueRefundedDescriptionIssuedViaPayPal: '{"value":"REFUNDED","description":"Issued via PayPal"}',
  ValueFailedDescriptionFailedRetryEligible: '{"value":"FAILED","description":"Failed; retry eligible"}',
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus] | (string & {});

export const refundStatusSchema: EnumSchema<RefundStatus> = s.enumOf<RefundStatus>(RefundStatus);

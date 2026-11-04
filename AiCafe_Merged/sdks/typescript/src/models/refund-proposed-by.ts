import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Who proposed the refund. */
export const RefundProposedBy = {
  ValueCustomerDescriptionCustomer: '{"value":"CUSTOMER","description":"Customer"}',
  ValueAgentDescriptionAgent: '{"value":"AGENT","description":"Agent"}',
  ValueMerchantDescriptionMerchant: '{"value":"MERCHANT","description":"Merchant"}',
} as const;
export type RefundProposedBy = (typeof RefundProposedBy)[keyof typeof RefundProposedBy] | (string & {});

export const refundProposedBySchema: EnumSchema<RefundProposedBy> =
  s.enumOf<RefundProposedBy>(RefundProposedBy);

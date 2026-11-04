import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { refundRequestSchema, type RefundRequest } from "./refund-request.js";

export type ApiRefundsResponse = {
  sandbox?: boolean;
  paypalEnabled?: boolean;
  refunds?: RefundRequest[];
};

export const apiRefundsResponseSchema: Schema<ApiRefundsResponse> = s.object<ApiRefundsResponse>({
  sandbox: s.optional(s.boolean()),
  paypalEnabled: s.optional(s.boolean()),
  refunds: s.optional(s.array(s.lazy(() => refundRequestSchema))),
});

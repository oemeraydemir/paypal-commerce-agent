import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { decisionSchema, type Decision } from "./decision.js";
import { paymentAuthoritySchema, type PaymentAuthority } from "./payment-authority.js";

/** control. */
export type Control = {
  /** final policy decision (field). */
  decision?: Decision;
  /** within limit (field). */
  withinLimit?: boolean;
  /** requires shopper approval (field). */
  requiresShopperApproval?: boolean;
  /** payment authority (field). */
  paymentAuthority?: PaymentAuthority;
  /** agent can pay (field). */
  agentCanPay?: boolean;
};

export const controlSchema: Schema<Control> = s.object<Control>({
  decision: s.optional(s.lazy(() => decisionSchema)),
  withinLimit: s.optional(s.boolean()),
  requiresShopperApproval: s.optional(s.boolean()),
  paymentAuthority: s.optional(s.lazy(() => paymentAuthoritySchema)),
  agentCanPay: s.optional(s.boolean()),
});

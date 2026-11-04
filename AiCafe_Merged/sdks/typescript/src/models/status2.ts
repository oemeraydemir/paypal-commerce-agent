import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Scope status. */
export const Status2 = {
  ValuePendingApprovalDescriptionEnumValuePendingApproval:
    '{"value":"PENDING_APPROVAL","description":"Enum value PENDING_APPROVAL."}',
  ValueActiveDescriptionEnumValueActive: '{"value":"ACTIVE","description":"Enum value ACTIVE."}',
  ValueSpentDescriptionEnumValueSpent: '{"value":"SPENT","description":"Enum value SPENT."}',
  ValueExpiredDescriptionEnumValueExpired: '{"value":"EXPIRED","description":"Enum value EXPIRED."}',
  ValueRevokedDescriptionEnumValueRevoked: '{"value":"REVOKED","description":"Enum value REVOKED."}',
} as const;
export type Status2 = (typeof Status2)[keyof typeof Status2] | (string & {});

export const status2Schema: EnumSchema<Status2> = s.enumOf<Status2>(Status2);

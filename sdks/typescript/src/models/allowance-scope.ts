import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { kindSchema, type Kind } from "./kind.js";
import { status2Schema, type Status2 } from "./status2.js";

export type AllowanceScope = {
  /** Scope id. */
  id?: string;
  /** Scope kind. */
  kind?: Kind;
  /** Human-readable label (field). */
  label?: string;
  /** Non-reversible session label (field). */
  sessionRef?: string | null;
  /** Origins permitted (field). */
  originsAllowed?: string[];
  /** Currency (field). */
  currency?: string;
  /** Per-purchase cap in minor units (field). */
  maxPerPurchaseMinor?: number | null;
  /** Daily cap in minor units (field). */
  dailySpendLimitMinor?: number | null;
  /** Category caps (field). */
  categorySpendLimits?: Record<string, number> | null;
  /** Allowed merchant ids (field). */
  allowedMerchantIds?: string[] | null;
  /** Night window rule (field). */
  nightWindow?: Record<string, unknown> | null;
  /** Scope status. */
  status?: Status2;
  /** Issuer (field). */
  issuedBy?: string;
  /** Shopper approval record (field). */
  approvedBy?: Record<string, unknown> | null;
  /** Created at (field). */
  createdAt?: Date;
  /** Expiry (field). */
  expiresAt?: Date | null;
  /** Updated at (field). */
  updatedAt?: Date;
};

export const allowanceScopeSchema: Schema<AllowanceScope> = s.object<AllowanceScope>({
  id: s.optional(s.string()),
  kind: s.optional(s.lazy(() => kindSchema)),
  label: s.optional(s.string()),
  sessionRef: s.optionalNullable(s.string()),
  originsAllowed: s.optional(s.array(s.string())),
  currency: s.optional(s.string()),
  maxPerPurchaseMinor: s.optionalNullable(s.int()),
  dailySpendLimitMinor: s.optionalNullable(s.int()),
  categorySpendLimits: s.optionalNullable(s.record(s.string(), s.int())),
  allowedMerchantIds: s.optionalNullable(s.array(s.string())),
  nightWindow: s.optionalNullable(s.record(s.string(), s.unknown())),
  status: s.optional(s.lazy(() => status2Schema)),
  issuedBy: s.optional(s.string()),
  approvedBy: s.optionalNullable(s.record(s.string(), s.unknown())),
  createdAt: s.optional(s.dateTime()),
  expiresAt: s.optionalNullable(s.dateTime()),
  updatedAt: s.optional(s.dateTime()),
});

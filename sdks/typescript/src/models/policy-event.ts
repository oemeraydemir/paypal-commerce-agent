import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { decisionSchema, type Decision } from "./decision.js";
import { policySnapshotSchema, type PolicySnapshot } from "./policy-snapshot.js";

/** policy event. */
export type PolicyEvent = {
  /** unique identifier (field). */
  id?: string;
  /** event timestamp (RFC 3339) (field). */
  timestamp?: Date;
  /** Public, non-reversible ref. */
  sessionId?: string;
  /** cart identifier (field). */
  cartId?: string;
  /** order identifier (field). */
  orderId?: string | null;
  /** agent (field). */
  agent?: string;
  /** amount in minor currency units (field). */
  amountMinor?: number;
  /** amount formatted (field). */
  amountFormatted?: string;
  /** ISO 4217 currency code (e.g. EUR) (field). */
  currency?: string;
  /** final policy decision (field). */
  decision?: Decision;
  /** Identifiers of rules that were violated for this decision. */
  violatedRules?: string[];
  /** explanation for this outcome (field). */
  reason?: string;
  /** Snapshot of the policy that was in effect, captured at decision time. */
  policySnapshot?: PolicySnapshot;
};

export const policyEventSchema: Schema<PolicyEvent> = s.object<PolicyEvent>({
  id: s.optional(s.string()),
  timestamp: s.optional(s.dateTime()),
  sessionId: s.optional(s.string()),
  cartId: s.optional(s.string()),
  orderId: s.optionalNullable(s.string()),
  agent: s.optional(s.string()),
  amountMinor: s.optional(s.int()),
  amountFormatted: s.optional(s.string()),
  currency: s.optional(s.string()),
  decision: s.optional(s.lazy(() => decisionSchema)),
  violatedRules: s.optional(s.array(s.string())),
  reason: s.optional(s.string()),
  policySnapshot: s.optional(s.lazy(() => policySnapshotSchema)),
});

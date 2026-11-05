import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** policy events stats. */
export type PolicyEventsStats = {
  /** total requests (field). */
  totalRequests?: number;
  /** allowed (field). */
  allowed?: number;
  /** blocked (field). */
  blocked?: number;
  /** spent minor units (field). */
  spentMinor?: number;
  /** spent formatted (field). */
  spentFormatted?: string;
};

export const policyEventsStatsSchema: Schema<PolicyEventsStats> = s.object<PolicyEventsStats>({
  totalRequests: s.optional(s.int()),
  allowed: s.optional(s.int()),
  blocked: s.optional(s.int()),
  spentMinor: s.optional(s.int()),
  spentFormatted: s.optional(s.string()),
});

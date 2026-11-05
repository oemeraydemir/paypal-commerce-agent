import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { policyEventSchema, type PolicyEvent } from "./policy-event.js";

/** policy events response. */
export type PolicyEventsResponse = {
  /** events (field). */
  events?: PolicyEvent[];
  /** total (field). */
  total?: number;
};

export const policyEventsResponseSchema: Schema<PolicyEventsResponse> = s.object<PolicyEventsResponse>({
  events: s.optional(s.array(s.lazy(() => policyEventSchema))),
  total: s.optional(s.int()),
});

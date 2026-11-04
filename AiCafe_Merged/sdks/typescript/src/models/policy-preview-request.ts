import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { orderItemSchema, type OrderItem } from "./order-item.js";

/** policy preview request. */
export type PolicyPreviewRequest = {
  /** items (field). */
  items?: OrderItem[];
};

export const policyPreviewRequestSchema: Schema<PolicyPreviewRequest> = s.object<PolicyPreviewRequest>({
  items: s.optional(s.array(s.lazy(() => orderItemSchema))),
});

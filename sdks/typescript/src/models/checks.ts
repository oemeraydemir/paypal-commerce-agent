import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** checks. */
export type Checks = {
  /** known key (field). */
  knownKey?: boolean;
  /** signature (field). */
  signature?: boolean;
  /** not expired (field). */
  notExpired?: boolean;
  /** matches order (field). */
  matchesOrder?: boolean | null;
};

export const checksSchema: Schema<Checks> = s.object<Checks>({
  knownKey: s.optional(s.boolean()),
  signature: s.optional(s.boolean()),
  notExpired: s.optional(s.boolean()),
  matchesOrder: s.optionalNullable(s.boolean()),
});

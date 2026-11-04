import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** A single policy violation found when evaluating a cart. */
export type Violation = {
  /** Type of violation (e.g. policy, constraint). */
  type?: string;
  /** Identifier of the violated rule. */
  rule?: string;
  /** Human-readable explanation of the violation. */
  message?: string;
};

export const violationSchema: Schema<Violation> = s.object<Violation>({
  type: s.optional(s.string()),
  rule: s.optional(s.string()),
  message: s.optional(s.string()),
});

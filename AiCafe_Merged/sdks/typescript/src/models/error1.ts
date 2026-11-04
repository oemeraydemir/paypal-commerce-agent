import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** error. */
export type Error1 = {
  /** code (field). */
  code?: number;
  /** human-readable message (field). */
  message?: string;
};

export const error1Schema: Schema<Error1> = s.object<Error1>({
  code: s.optional(s.int()),
  message: s.optional(s.string()),
});

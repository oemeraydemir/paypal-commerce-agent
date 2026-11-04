import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { dietarySchema, type Dietary } from "./dietary.js";

/** preferences. */
export type Preferences = {
  /** dietary (field). */
  dietary?: Dietary[];
  /** max budget minor units (field). */
  maxBudgetMinor?: number;
};

export const preferencesSchema: Schema<Preferences> = s.object<Preferences>({
  dietary: s.optional(s.array(s.lazy(() => dietarySchema))),
  maxBudgetMinor: s.optional(s.int()),
});

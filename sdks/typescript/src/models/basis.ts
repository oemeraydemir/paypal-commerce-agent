import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { limitSetBySchema, type LimitSetBy } from "./limit-set-by.js";
import { pricesSourceSchema, type PricesSource } from "./prices-source.js";

/** basis. */
export type Basis = {
  /** prices source (field). */
  pricesSource?: PricesSource;
  /** client prices ignored (field). */
  clientPricesIgnored?: boolean;
  /** limit set by (field). */
  limitSetBy?: LimitSetBy;
};

export const basisSchema: Schema<Basis> = s.object<Basis>({
  pricesSource: s.optional(s.lazy(() => pricesSourceSchema)),
  clientPricesIgnored: s.optional(s.boolean()),
  limitSetBy: s.optional(s.lazy(() => limitSetBySchema)),
});

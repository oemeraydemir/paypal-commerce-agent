import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { item1Schema, type Item1 } from "./item1.js";

/** take home request. */
export type TakeHomeRequest = {
  /** items (field). */
  items: Item1[];
};

export const takeHomeRequestSchema: Schema<TakeHomeRequest> = s.object<TakeHomeRequest>({
  items: s.array(s.lazy(() => item1Schema)),
});

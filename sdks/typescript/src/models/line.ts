import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** lines. */
export type Line = {
  /** product identifier (field). */
  productId: string;
  /** name (field). */
  name: string;
  /** quantity, a positive integer (field). */
  quantity: number;
  /** unit price minor units (field). */
  unitPriceMinor: number;
  /** line total in minor currency units (field). */
  lineTotalMinor: number;
};

export const lineSchema: Schema<Line> = s.object<Line>({
  productId: s.string(),
  name: s.string(),
  quantity: s.int(),
  unitPriceMinor: s.int(),
  lineTotalMinor: s.int(),
});

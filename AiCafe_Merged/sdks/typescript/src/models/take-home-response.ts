import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { sourceSchema, type Source } from "./source.js";
import { takeHomeItemSchema, type TakeHomeItem } from "./take-home-item.js";

/** take home response. */
export type TakeHomeResponse = {
  /** False when CHANNEL3_API_KEY is not configured. */
  enabled: boolean;
  /** query (field). */
  query?: string;
  /** source (field). */
  source?: Source;
  /** disclosure (field). */
  disclosure?: string;
  /** note (field). */
  note?: string;
  /** items (field). */
  items: TakeHomeItem[];
};

export const takeHomeResponseSchema: Schema<TakeHomeResponse> = s.object<TakeHomeResponse>({
  enabled: s.boolean(),
  query: s.optional(s.string()),
  source: s.optional(s.lazy(() => sourceSchema)),
  disclosure: s.optional(s.string()),
  note: s.optional(s.string()),
  items: s.array(s.lazy(() => takeHomeItemSchema)),
});

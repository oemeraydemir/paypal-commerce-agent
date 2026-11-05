import * as s from "../../core/validation/index.js";
import type { Schema } from "../../core/validation/schema.js";

/** unique identifier (field). */
export type Id = string | number;

export const idSchema: Schema<Id> = s.of<Id>(s.union([s.string(), s.int()]));

import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** source (field). */
export const Source = {
  ValueChannel3DescriptionEnumValueChannel3: '{"value":"channel3","description":"Enum value channel3."}',
} as const;
export type Source = (typeof Source)[keyof typeof Source] | (string & {});

export const sourceSchema: EnumSchema<Source> = s.enumOf<Source>(Source);

import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** current status (field). */
export const Status = {
  ValuePassDescriptionEnumValuePass: '{"value":"pass","description":"Enum value pass."}',
  ValueConfirmDescriptionEnumValueConfirm: '{"value":"confirm","description":"Enum value confirm."}',
  ValueFailDescriptionEnumValueFail: '{"value":"fail","description":"Enum value fail."}',
} as const;
export type Status = (typeof Status)[keyof typeof Status] | (string & {});

export const statusSchema: EnumSchema<Status> = s.enumOf<Status>(Status);

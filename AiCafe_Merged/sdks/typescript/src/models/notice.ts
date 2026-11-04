import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

export const Notice = {
  ValueSampleMenuDataDescriptionEnumValueSampleMenuData:
    '{"value":"sample-menu-data","description":"Enum value sample-menu-data."}',
  ValueAllergenUnverifiedDescriptionEnumValueAllergenUnverified:
    '{"value":"allergen-unverified","description":"Enum value allergen-unverified."}',
  ValueSandboxOnlyDescriptionEnumValueSandboxOnly:
    '{"value":"sandbox-only","description":"Enum value sandbox-only."}',
} as const;
export type Notice = (typeof Notice)[keyof typeof Notice] | (string & {});

export const noticeSchema: EnumSchema<Notice> = s.enumOf<Notice>(Notice);

import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

export const Dietary = {
  ValueVegetarianDescriptionEnumValueVegetarian:
    '{"value":"vegetarian","description":"Enum value vegetarian."}',
  ValueVeganDescriptionEnumValueVegan: '{"value":"vegan","description":"Enum value vegan."}',
  ValueGlutenFreeDescriptionEnumValueGlutenFree:
    '{"value":"gluten-free","description":"Enum value gluten-free."}',
} as const;
export type Dietary = (typeof Dietary)[keyof typeof Dietary] | (string & {});

export const dietarySchema: EnumSchema<Dietary> = s.enumOf<Dietary>(Dietary);

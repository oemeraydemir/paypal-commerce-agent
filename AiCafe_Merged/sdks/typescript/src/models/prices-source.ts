import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** prices source (field). */
export const PricesSource = {
  ValueServerCatalogDescriptionEnumValueServerCatalog:
    '{"value":"server-catalog","description":"Enum value server-catalog."}',
} as const;
export type PricesSource = (typeof PricesSource)[keyof typeof PricesSource] | (string & {});

export const pricesSourceSchema: EnumSchema<PricesSource> = s.enumOf<PricesSource>(PricesSource);

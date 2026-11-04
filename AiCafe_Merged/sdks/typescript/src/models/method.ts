import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** method (field). */
export const Method = {
  ValueInitializeDescriptionEnumValueInitialize:
    '{"value":"initialize","description":"Enum value initialize."}',
  ValuePingDescriptionEnumValuePing: '{"value":"ping","description":"Enum value ping."}',
  ValueToolsListDescriptionEnumValueToolsList:
    '{"value":"tools/list","description":"Enum value tools/list."}',
  ValueToolsCallDescriptionEnumValueToolsCall:
    '{"value":"tools/call","description":"Enum value tools/call."}',
  ValueNotificationsInitializedDescriptionEnumValueNotificationsInitialized:
    '{"value":"notifications/initialized","description":"Enum value notifications/initialized."}',
} as const;
export type Method = (typeof Method)[keyof typeof Method] | (string & {});

export const methodSchema: EnumSchema<Method> = s.enumOf<Method>(Method);

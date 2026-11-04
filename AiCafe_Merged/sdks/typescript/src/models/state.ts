import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** state (field). */
export const State = {
  ValueDoneDescriptionEnumValueDone: '{"value":"done","description":"Enum value done."}',
  ValuePendingDescriptionEnumValuePending: '{"value":"pending","description":"Enum value pending."}',
  ValueBlockedDescriptionEnumValueBlocked: '{"value":"blocked","description":"Enum value blocked."}',
} as const;
export type State = (typeof State)[keyof typeof State] | (string & {});

export const stateSchema: EnumSchema<State> = s.enumOf<State>(State);

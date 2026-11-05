import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** how the order was created (field). */
export const Origin = {
  ValueAiAgentDescriptionEnumValueAiAgent: '{"value":"AI_AGENT","description":"Enum value AI_AGENT."}',
  ValueHumanDescriptionEnumValueHuman: '{"value":"HUMAN","description":"Enum value HUMAN."}',
} as const;
export type Origin = (typeof Origin)[keyof typeof Origin] | (string & {});

export const originSchema: EnumSchema<Origin> = s.enumOf<Origin>(Origin);

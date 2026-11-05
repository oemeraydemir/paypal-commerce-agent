import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/**
 * "ai" when an LLM answered; "rule-based" when every AI provider was exhausted and the
 * clearly-labelled non-AI Quick Planner answered. Rule-based carts are attributed to HUMAN, never
 * AI_AGENT.
 */
export const Mode = {
  ValueAiDescriptionEnumValueAi: '{"value":"ai","description":"Enum value ai."}',
  ValueRuleBasedDescriptionEnumValueRuleBased:
    '{"value":"rule-based","description":"Enum value rule-based."}',
} as const;
export type Mode = (typeof Mode)[keyof typeof Mode] | (string & {});

export const modeSchema: EnumSchema<Mode> = s.enumOf<Mode>(Mode);

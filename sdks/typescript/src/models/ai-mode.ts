import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Which engine answered. */
export const AiMode = {
  ValueAiDescriptionLlmAnswered: '{"value":"ai","description":"LLM answered"}',
  ValueRuleBasedDescriptionQuickPlannerAnswered:
    '{"value":"rule-based","description":"Quick planner answered"}',
} as const;
export type AiMode = (typeof AiMode)[keyof typeof AiMode] | (string & {});

export const aiModeSchema: EnumSchema<AiMode> = s.enumOf<AiMode>(AiMode);

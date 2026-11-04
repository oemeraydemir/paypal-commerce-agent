import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

export const Origin2 = {
  AiAgent: "AI_AGENT",
  Human: "HUMAN",
} as const;
export type Origin2 = (typeof Origin2)[keyof typeof Origin2] | (string & {});

export const origin2Schema: EnumSchema<Origin2> = s.enumOf<Origin2>(Origin2);

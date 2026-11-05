import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** How multiple search terms are combined. */
export const MatchMode = {
  ValueAllDescriptionEveryTermMustMatch: '{"value":"all","description":"Every term must match"}',
  ValueAnyDescriptionAnyTermMayMatch: '{"value":"any","description":"Any term may match"}',
} as const;
export type MatchMode = (typeof MatchMode)[keyof typeof MatchMode] | (string & {});

export const matchModeSchema: EnumSchema<MatchMode> = s.enumOf<MatchMode>(MatchMode);

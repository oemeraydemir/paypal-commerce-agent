import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { preferencesSchema, type Preferences } from "./preferences.js";

/** aichat request. */
export type AiChatRequest = {
  /** human-readable message (field). */
  message: string;
  /** preferences. */
  preferences?: Preferences;
};

export const aiChatRequestSchema: Schema<AiChatRequest> = s.object<AiChatRequest>({
  message: s.string(),
  preferences: s.optional(s.lazy(() => preferencesSchema)),
});

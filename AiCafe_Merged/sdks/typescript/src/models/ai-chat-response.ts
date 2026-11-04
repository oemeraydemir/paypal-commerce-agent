import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { modeSchema, type Mode } from "./mode.js";
import { preparedCartSchema, type PreparedCart } from "./prepared-cart.js";

/** aichat response. */
export type AiChatResponse = {
  /** session identifier (field). */
  sessionId?: string;
  /** response (field). */
  response?: string;
  /** The validated, server-priced cart prepared by the agent; null when none was prepared. */
  preparedCart?: PreparedCart | null;
  /** whether the cart is ready for checkout (field). */
  checkoutReady?: boolean;
  /** Rule-based mode only: a manual add-anyway offer. Not a prepared cart; authorises nothing. */
  suggestion?: Record<string, unknown> | null;
  /** number of tool-calling rounds used (field). */
  toolRounds?: number;
  /** number of messages in the conversation (field). */
  messageCount?: number;
  /**
   * "ai" when an LLM answered; "rule-based" when every AI provider was exhausted and the
   * clearly-labelled non-AI Quick Planner answered. Rule-based carts are attributed to HUMAN, never
   * AI_AGENT.
   */
  mode?: Mode;
  /**
   * Which provider answered (e.g. groq, gemini) or "rule-based" for the non-AI planner. Names only.
   * Also sent as the X-AI-Provider header.
   */
  provider?: string | null;
  /** Model id that produced the final answer; null for the rule-based planner. */
  model?: string | null;
  /**
   * Model calls made for this turn (0 for the rule-based planner). A turn is bounded by 6 rounds,
   * 12 executed tool calls and 40 s; past a ceiling the next call is made without tools.
   */
  modelCalls?: number;
  /**
   * true when an earlier provider/model failed first, the provider changed within the turn, or the
   * rule-based planner answered.
   */
  fallback?: boolean;
};

export const aiChatResponseSchema: Schema<AiChatResponse> = s.object<AiChatResponse>({
  sessionId: s.optional(s.string()),
  response: s.optional(s.string()),
  preparedCart: s.optionalNullable(s.lazy(() => preparedCartSchema)),
  checkoutReady: s.optional(s.boolean()),
  suggestion: s.optionalNullable(s.record(s.string(), s.unknown())),
  toolRounds: s.optional(s.int()),
  messageCount: s.optional(s.int()),
  mode: s.optional(s.lazy(() => modeSchema)),
  provider: s.optionalNullable(s.string()),
  model: s.optionalNullable(s.string()),
  modelCalls: s.optional(s.int()),
  fallback: s.optional(s.boolean()),
});

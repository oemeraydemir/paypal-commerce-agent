import { aiClient } from './client';
import { getCompletionMeta } from './completion-meta';
import { AI_TOOLS, ALLOWED_TOOLS } from './tools';
import { executeTool, ShoppingPreferences } from './tool-executor';
import OpenAI from 'openai';
import { currentBusiness } from '../config/business-config';
import { policyStorage } from '../policy/storage';
import { getDemoUserId } from '../policy/default-policy';
import { formatMoney } from '../utils/money';
import { AppError } from '../middleware/error-handler';
import { appendOptionCallToAction } from './quick-replies';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
}

// Model calls per chat turn. The LAST one is always made without tools so the turn ends
// with a written answer instead of a generic "maximum steps" apology (weaker/fallback
// models happily keep calling tools until the budget is gone).
const MAX_TOOL_ROUNDS = 6;
// S10 (R7/R11): a policy retry is counted ONLY when prepare_cart returns a
// BLOCK decision. Bounded retries prevent the agent loop from spinning on a
// policy it cannot satisfy.
const MAX_POLICY_RETRIES = 3;
// Rounds are bounded, but one round can carry several parallel tool calls. These two ceilings bound
// the TOTAL work of a turn: executed tool calls and wall-clock time. When either is reached the next
// model call is made without tools, so the turn still ends with a written answer.
export const AI_TURN_LIMITS = {
  maxToolCalls: 12,
  maxTurnMs: 40_000,
};

/** Which provider/model answered a turn, how many model calls it took, and whether a fallback happened. */
export interface AITurnInfo {
  provider: string | null;
  model: string | null;
  modelCalls: number;
  fallback: boolean;
  /** Why tools were switched off early, if they were. */
  limitReached?: 'tool_calls' | 'time';
}

export class AIService {
  private systemPrompt = `You are an AI shopping assistant for ${currentBusiness.name}. Help users find products, prepare carts, and get ready for checkout.

IMPORTANT RULES:
1. Use the provided tools to search products and prepare carts.
2. NEVER provide prices or totals without using the prepare_cart tool first.
3. NEVER call payment functions - the user must confirm and pay through the app.
4. Be helpful, concise, and friendly.
5. When you've prepared a cart, summarize it clearly and ask for confirmation.
6. If the user specifies a total budget, convert it to ${currentBusiness.currency} minor units and pass it as maxBudgetMinor to prepare_cart. If the cart exceeds the budget, revise it; never claim it is within budget unless the tool accepts it.
7. Use maxPriceMinor only for a per-item price limit, not a total-cart budget.
8. For a discovery turn, show 2–4 distinct choices as a numbered list headed "Options:" (or "Seçenekler:" in Turkish), using exact product names returned by search_products and one concise reason per choice. Do not include prices or cart totals unless prepare_cart has validated that exact cart. A short reply such as "1" selects that choice from the most recent numbered list: use the existing tools to prepare it for review, re-applying all shopper constraints and checkout safeguards. Selection is never payment or authorization.
9. When the shopper broadly asks to find, recommend, or suggest items and has not named exact products, call search_products and return 2–4 catalog-grounded choices before preparing a cart. Do not call prepare_cart in this discovery turn; wait for the shopper's numbered choice. For a stated total budget, use catalog data to avoid obviously over-budget choices, but do not claim a final total or that a cart is within budget until prepare_cart validates it. If the shopper explicitly asks for a cart from exact items, proceed to prepare_cart.
10. Diet labels in the catalog are SAMPLE DATA that the café has not verified, and the café publishes no allergen data. Describe them only as "labelled vegetarian/vegan/gluten-free in the sample menu". NEVER say an item is safe, allergen-free, suitable for an allergy, or guaranteed to meet a diet. If the shopper mentions an allergy or medical diet, tell them to confirm with the café before ordering.

EXAMPLE FLOW:
User: "I need a vegetarian breakfast for 2 people under 2000 minor units"
You: [call search_products with dietary/occasion filters]
You: "Here are two menu choices. Choose one and I'll check its exact cart total. Options:\n1. [catalog-based breakfast choice]\n2. [different catalog-based breakfast choice]"
User: "2"
You: [call prepare_cart with the selected catalog items and maxBudgetMinor: 2000]
You: "Here's the validated cart and total. Would you like to review it for checkout?"

Remember: You help DISCOVER and PREPARE orders. The actual payment happens through the app's secure checkout after user confirmation.`;

  async chat(
    sessionId: string,
    userMessage: string,
    conversationHistory: ChatMessage[] = [],
    preferences: ShoppingPreferences = { dietary: [] },
    userId?: string
  ): Promise<{
    response: string;
    preparedCart?: any;
    checkoutReady: boolean;
    toolRounds: number;
    updatedHistory: ChatMessage[];
    info: AITurnInfo;
  }> {
    const preferenceInstructions = [
      preferences.dietary.length > 0
        ? `Dietary preferences that every recommended and prepared item must meet: ${preferences.dietary.join(', ')}.`
        : '',
      preferences.maxBudgetMinor !== undefined
        ? `Maximum total cart budget: ${preferences.maxBudgetMinor} ${currentBusiness.currency} minor units. Never exceed it.`
        : '',
    ].filter(Boolean).join('\n');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: preferenceInstructions
          ? `${this.systemPrompt}\n\nSHOPPER PROFILE (apply as hard constraints):\n${preferenceInstructions}`
          : this.systemPrompt,
      },
      ...(conversationHistory as unknown as OpenAI.Chat.ChatCompletionMessageParam[]),
      { role: 'user', content: userMessage },
    ];

    let preparedCart: any = null;
    let checkoutReady = false;
    let toolRounds = 0;
    let policyBlockedAttempts = 0;
    let policyExhausted = false;
    // Last BLOCK outcome, used only to explain the block truthfully (never to decide anything).
    let lastBlocked: any = null;

    // Tools are switched off (the model must answer in words) once a cart is prepared,
    // when a round only repeated earlier calls, and on the final round.
    let toolsEnabled = true;
    const seenCalls = new Map<string, string>();

    const startedAt = Date.now();
    let executedToolCalls = 0;
    const info: AITurnInfo = { provider: null, model: null, modelCalls: 0, fallback: false };
    const note = (completion: OpenAI.Chat.ChatCompletion) => {
      const meta = getCompletionMeta(completion);
      info.modelCalls++;
      if (meta) {
        if (info.provider !== null && (info.provider !== meta.provider || info.model !== meta.model)) {
          info.fallback = true; // the provider/model changed within one turn
        }
        info.provider = meta.provider;
        info.model = meta.model;
        if (meta.fallback) info.fallback = true;
      }
    };

    // Multi-round agent loop (MAX_TOOL_ROUNDS model calls, the last one without tools).
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (policyExhausted) break;

      if (toolsEnabled && Date.now() - startedAt > AI_TURN_LIMITS.maxTurnMs) {
        toolsEnabled = false;
        info.limitReached = info.limitReached ?? 'time';
      }
      const allowTools = toolsEnabled && round < MAX_TOOL_ROUNDS - 1;
      let completion: OpenAI.Chat.ChatCompletion;
      try {
        completion = await aiClient.chat(messages, allowTools ? AI_TOOLS : undefined);
      } catch (err: any) {
        // Every provider ran out of capacity MID-TURN. If a cart was already prepared (and policy
        // checked) by the tools, keep it: throwing here would discard the work and make the
        // route restart the whole turn with the rule-based planner, spending more quota.
        const unavailable = err instanceof AppError && err.details?.code === 'AI_UNAVAILABLE';
        if (unavailable && preparedCart && checkoutReady) {
          const finalContent =
            'The AI service ran out of capacity while I was finishing, but your cart was already prepared. Please review the items and the total, then confirm to continue.';
          return {
            response: finalContent,
            preparedCart,
            checkoutReady,
            toolRounds,
            updatedHistory: [
              ...conversationHistory,
              { role: 'user', content: userMessage },
              { role: 'assistant', content: finalContent },
            ],
            info,
          };
        }
        throw err;
      }
      note(completion);
      const message = completion.choices[0].message;

      // No tool calls (or tools are off) → final natural-language answer.
      if (!allowTools || !message.tool_calls || message.tool_calls.length === 0) {
        // Some providers (seen on the fallback chain) return their tool-call
        // protocol as plain text instead of structured `tool_calls`. That
        // markup is never a shopper-facing answer, so it is stripped here
        // rather than shipped to the web storefront / Flutter client.
        const answerText = appendOptionCallToAction(
          AIService.sanitizeAnswer(message.content),
          userMessage
        );
        const finalContent =
          answerText ||
          (allowTools
            ? 'I apologize, but I encountered an error. Please try again.'
            : AIService.noAnswerText(preparedCart));
        return {
          response: finalContent,
          preparedCart,
          checkoutReady,
          toolRounds,
          updatedHistory: [
            ...conversationHistory,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: finalContent },
          ],
          info,
        };
      }

      // Record the assistant turn (with its tool_calls) for the next model call.
      messages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls,
      } as OpenAI.Chat.ChatCompletionAssistantMessageParam);

      let sawNewCall = false;
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;

        // Safety boundary: only the hardcoded allowlist is permitted.
        if (!ALLOWED_TOOLS.includes(toolName as (typeof ALLOWED_TOOLS)[number])) {
          throw new Error(`Unauthorized tool: ${toolName}`);
        }

        toolRounds++;

        // Turn-wide tool budget: answer the remaining calls with an error so the transcript stays
        // valid (every tool_call needs a reply), and stop offering tools from the next call on.
        if (executedToolCalls >= AI_TURN_LIMITS.maxToolCalls) {
          info.limitReached = info.limitReached ?? 'tool_calls';
          toolsEnabled = false;
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ error: 'Tool budget for this request is used up. Answer with what you have.' }),
          } as OpenAI.Chat.ChatCompletionToolMessageParam);
          continue;
        }

        let args: any;
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (err) {
          sawNewCall = true; // let the model correct malformed arguments (bounded by the rounds)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ error: 'Invalid tool arguments' }),
          } as OpenAI.Chat.ChatCompletionToolMessageParam);
          continue;
        }

        // Identical READ-ONLY call (same tool, same arguments) already answered this turn: replay
        // the earlier result instead of executing again, so a looping model cannot burn the
        // budget. prepare_cart is never replayed: every attempt is a policy evaluation that
        // must be counted (MAX_POLICY_RETRIES) and recorded.
        const signature = `${toolName}:${JSON.stringify(args)}`;
        const cachedContent = toolName === 'prepare_cart' ? undefined : seenCalls.get(signature);
        if (cachedContent !== undefined) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: cachedContent,
          } as OpenAI.Chat.ChatCompletionToolMessageParam);
          continue;
        }
        sawNewCall = true;
        executedToolCalls++;

        try {
          // The storefront chat ASSISTS a human shopper: advisory events are
          // attributed AI_ASSISTED, never AI_AGENT (FIX-04 / PP18).
          const result = await executeTool(toolName, args, preferences, {
            sessionId,
            userId,
            origin: 'AI_ASSISTED',
          });

          if (toolName === 'prepare_cart') {
            if (result.policyDecision === 'BLOCK') {
              // S10 (R7): a policy retry is counted only for prepare_cart + BLOCK.
              policyBlockedAttempts++;
              lastBlocked = result;
              preparedCart = null;
              checkoutReady = false;
              if (policyBlockedAttempts >= MAX_POLICY_RETRIES) {
                // S10: exhausted retries — surface a truthful explanation and stop.
                policyExhausted = true;
              }
            } else {
              preparedCart = result;
              checkoutReady = true;
            }
          }

          const resultContent = JSON.stringify(result);
          seenCalls.set(signature, resultContent);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: resultContent,
          } as OpenAI.Chat.ChatCompletionToolMessageParam);
        } catch (err: any) {
          const errorContent = JSON.stringify({ error: err.message });
          seenCalls.set(signature, errorContent);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: errorContent,
          } as OpenAI.Chat.ChatCompletionToolMessageParam);
        }
      }

      // A prepared cart is the goal of the turn; a round that only repeated old calls is a loop.
      // Either way the next model call must answer in words.
      if (!sawNewCall || (checkoutReady && preparedCart)) toolsEnabled = false;

      if (policyExhausted) {
        const finalContent = AIService.policyBlockedText(policyBlockedAttempts, lastBlocked, userId);
        return {
          response: finalContent,
          preparedCart: null,
          checkoutReady: false,
          toolRounds,
          updatedHistory: [
            ...conversationHistory,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: finalContent },
          ],
          info,
        };
      }
    }

    // Safety net (the last round already forces a tool-free answer, so this is not expected).
    return {
      response: AIService.noAnswerText(preparedCart),
      preparedCart,
      checkoutReady,
      toolRounds,
      updatedHistory: [...conversationHistory, { role: 'user', content: userMessage }],
      info,
    };
  }

  /**
   * Explains a policy block using the ACTUAL policy of this deployment and the configured
   * business currency — never a hardcoded "€20 per purchase". A merchant with a £400 limit must
   * not be told about a €20 limit, and the AI must not state a limit the server does not enforce.
   * Wording only: the decision itself was made by the deterministic policy engine.
   */
  private static policyBlockedText(attempts: number, blocked: any, userId?: string): string {
    const policy = policyStorage.getOrCreatePolicy(userId ?? getDemoUserId());
    const money = (minor: number) => formatMoney(minor, policy.currency, currentBusiness.locale);
    const reason = typeof blocked?.reason === 'string' && blocked.reason ? `${blocked.reason}. ` : '';
    return (
      `I tried ${attempts} cart option${attempts === 1 ? '' : 's'}, but every attempt was blocked by the purchase policy: ` +
      `${reason}The policy allows at most ${money(policy.maxPerPurchaseMinor)} per purchase and ` +
      `${money(policy.dailySpendLimitMinor)} per day. Please reduce the cart total, remove restricted ` +
      `items, or build the cart manually and check out.`
    );
  }

  /** Truthful text when the model produced no written answer (never a bare "max steps"). */
  private static noAnswerText(preparedCart: any): string {
    return preparedCart
      ? 'I prepared a cart for you. Please review the items and the total, then confirm to continue.'
      : 'I could not put together a suitable cart for that request. Please rephrase it with fewer constraints, or add items from the menu yourself.';
  }

  /**
   * Strips raw tool-call protocol markup from model output.
   *
   * Observed in production-shaped runs: a fallback provider answers with
   * `<tool_call><function=search_products><parameter=query>coffee</parameter>
   * </function></tool_call>` as the message *content* instead of returning
   * structured `tool_calls`. Returning that verbatim put XML in the shopper's
   * chat bubble (both the web storefront and the Flutter app render `response`
   * as-is). Only the prose that precedes the first markup token is kept, so
   * parameter values can never leak either; an answer that was nothing but
   * markup becomes '' and the caller substitutes a truthful fallback text.
   */
  private static sanitizeAnswer(raw: string | null | undefined): string {
    return stripToolCallMarkup(raw);
  }
}

export const aiService = new AIService();

/**
 * Removes tool-call protocol markup that a model emitted as plain text.
 *
 * Kept module-level (and exported) so it can be unit-tested offline: the
 * behaviour is a security/correctness boundary — raw `<tool_call>` XML must
 * never reach a shopper's screen — not an implementation detail.
 *
 * Only text before the first markup token survives, so a truncated payload
 * (missing `</tool_call>`) cannot leak `<parameter=…>` values either.
 */
export function stripToolCallMarkup(raw: string | null | undefined): string {
  if (!raw) return '';
  const markupAt = raw.search(/<\/?(tool_call|function|parameter)\b/i);
  const prose = markupAt >= 0 ? raw.slice(0, markupAt) : raw;
  return prose.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

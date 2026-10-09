import { aiClient } from './client';
import { AI_TOOLS, ALLOWED_TOOLS } from './tools';
import { executeTool, ShoppingPreferences } from './tool-executor';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
}

const MAX_TOOL_ROUNDS = 5;
// S10 (R7/R11): a policy retry is counted ONLY when prepare_cart returns a
// BLOCK decision. Bounded retries prevent the agent loop from spinning on a
// policy it cannot satisfy.
const MAX_POLICY_RETRIES = 3;

export class AIService {
  private systemPrompt = `You are an AI shopping assistant for AI Café. Help users find products, prepare carts, and get ready for checkout.

IMPORTANT RULES:
1. Use the provided tools to search products and prepare carts.
2. NEVER provide prices or totals without using the prepare_cart tool first.
3. NEVER call payment functions - the user must confirm and pay through the app.
4. Be helpful, concise, and friendly.
5. When you've prepared a cart, summarize it clearly and ask for confirmation.
6. If the user specifies a total budget, convert it to EUR minor units and pass it as maxBudgetMinor to prepare_cart. If the cart exceeds the budget, revise it; never claim it is within budget unless the tool accepts it.
7. Use maxPriceMinor only for a per-item price limit, not a total-cart budget.

EXAMPLE FLOW:
User: "I need breakfast for 2 people under 2000 minor units"
You: [call search_products with dietary/occasion filters]
You: "I found some great options! Let me prepare a cart for you."
You: [call prepare_cart with selected items]
You: "Here's your cart: 2x Vegetarian Breakfast (2000 minor units), 2x Coffee (600 minor units). Total: 2600 minor units. Would you like to proceed to checkout?"

Remember: You help DISCOVER and PREPARE orders. The actual payment happens through the app's secure checkout after user confirmation.`;

  async chat(
    sessionId: string,
    userMessage: string,
    conversationHistory: ChatMessage[] = [],
    preferences: ShoppingPreferences = { dietary: [] }
  ): Promise<{
    response: string;
    preparedCart?: any;
    checkoutReady: boolean;
    toolRounds: number;
    updatedHistory: ChatMessage[];
  }> {
    const preferenceInstructions = [
      preferences.dietary.length > 0
        ? `Dietary preferences that every recommended and prepared item must meet: ${preferences.dietary.join(', ')}.`
        : '',
      preferences.maxBudgetMinor !== undefined
        ? `Maximum total cart budget: ${preferences.maxBudgetMinor} EUR minor units. Never exceed it.`
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

    // Multi-round agent loop (max 5 tool rounds).
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (policyExhausted) break;

      const completion = await aiClient.chat(messages, AI_TOOLS);
      const message = completion.choices[0].message;

      // No tool calls → final natural-language answer.
      if (!message.tool_calls || message.tool_calls.length === 0) {
        const finalContent = message.content || 'I apologize, but I encountered an error. Please try again.';
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
        };
      }

      // Record the assistant turn (with its tool_calls) for the next model call.
      messages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls,
      } as OpenAI.Chat.ChatCompletionAssistantMessageParam);

      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;

        // Safety boundary: only the hardcoded allowlist is permitted.
        if (!ALLOWED_TOOLS.includes(toolName as (typeof ALLOWED_TOOLS)[number])) {
          throw new Error(`Unauthorized tool: ${toolName}`);
        }

        toolRounds++;

        let args: any;
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (err) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ error: 'Invalid tool arguments' }),
          } as OpenAI.Chat.ChatCompletionToolMessageParam);
          continue;
        }

        try {
          const result = await executeTool(toolName, args, preferences, { sessionId });

          if (toolName === 'prepare_cart') {
            if (result.policyDecision === 'BLOCK') {
              // S10 (R7): a policy retry is counted only for prepare_cart + BLOCK.
              policyBlockedAttempts++;
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

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify(result),
          } as OpenAI.Chat.ChatCompletionToolMessageParam);
        } catch (err: any) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ error: err.message }),
          } as OpenAI.Chat.ChatCompletionToolMessageParam);
        }
      }

      if (policyExhausted) {
        const finalContent = `I tried ${policyBlockedAttempts} cart options, but every attempt was blocked by the purchase policy (max €20.00 per purchase, no alcohol items, daily limit applies). Please reduce your cart total, remove restricted items, or build the cart manually and check out.`;
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
        };
      }
    }

    // Exceeded MAX_TOOL_ROUNDS without a natural-language answer.
    return {
      response:
        "I apologize, but I've reached the maximum number of steps. Please try a simpler request.",
      preparedCart,
      checkoutReady,
      toolRounds,
      updatedHistory: [...conversationHistory, { role: 'user', content: userMessage }],
    };
  }
}

export const aiService = new AIService();

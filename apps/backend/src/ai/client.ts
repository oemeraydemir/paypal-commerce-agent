import OpenAI from 'openai';
import { env } from '../config/environment';

export interface AIClient {
  chat(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools?: OpenAI.Chat.ChatCompletionTool[]
  ): Promise<OpenAI.Chat.ChatCompletion>;
}

class OpenAIClientImpl implements AIClient {
  private client?: OpenAI;

  // Lazy: the SDK client is built on first use, not at module load, so the app
  // (and the test runner) never crashes when OPENAI_API_KEY is absent.
  private ensure(): OpenAI {
    if (!env.ai) {
      throw new Error('OpenAI is not configured (env.ai is null)');
    }
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: env.ai.OPENAI_API_KEY,
      });
    }
    return this.client;
  }

  async chat(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools?: OpenAI.Chat.ChatCompletionTool[]
  ): Promise<OpenAI.Chat.ChatCompletion> {
    const client = this.ensure();

    return await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: tools || [],
      tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
      temperature: 0.3,
    });
  }
}

export const aiClient: AIClient = new OpenAIClientImpl();

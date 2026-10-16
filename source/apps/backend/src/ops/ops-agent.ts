import OpenAI from 'openai';
import { aiClient, AIClient } from '../ai/client';
import { env } from '../config/environment';
import {
  INTERNAL_TOOLS,
  PAYPAL_READ_ONLY_PERMISSIONS,
  executeInternalTool,
  isAllowedPayPalTool,
  isInternalTool,
} from './ops-tools';

// Minimal surface of @paypal/agent-toolkit's OpenAI adapter that the copilot depends on. Declared
// locally so tests can inject a fake and so the (heavy) toolkit is only loaded when the copilot
// is actually used.
export interface OpsToolkitLike {
  getTools(): OpenAI.Chat.ChatCompletionTool[];
  handleToolCall(call: OpenAI.Chat.ChatCompletionMessageToolCall): Promise<{ content?: unknown }>;
}

export interface OpsRuntime {
  ai: AIClient;
  toolkit: OpsToolkitLike;
}

export interface OpsToolUse {
  name: string;
  source: 'paypal' | 'internal' | 'rejected';
  ok: boolean;
}

export interface OpsResult {
  answer: string;
  toolsUsed: OpsToolUse[];
  steps: number;
}

export const MAX_STEPS = 4;
export const MAX_TOOL_CALLS_PER_STEP = 4;
const MAX_TOOL_OUTPUT_CHARS = 6000;
const MAX_ARGUMENT_CHARS = 2000;

export const OPS_SYSTEM_PROMPT = [
  'You are the AI Café Ops Copilot, a READ-ONLY analyst for the merchant.',
  'You can look up PayPal sandbox data (transactions, orders, disputes, invoices, refunds, shipment tracking)',
  "and AI Café's own policy audit trail and orders.",
  'You cannot create, change, capture, refund, cancel or send anything. If asked to, say you are read-only',
  'and that payments are approved only by the shopper in PayPal.',
  'Ground every number and identifier in tool results. If a tool fails or returns nothing, say so plainly.',
  'Never invent IDs or amounts. Answer in under 150 words. This is a PayPal sandbox: no real money moves.',
].join(' ');

let runtimeOverride: OpsRuntime | null = null;
let cachedToolkit: OpsToolkitLike | null = null;

/** Test hook: inject a fake AI client and toolkit. Pass null to restore the real runtime. */
export function setOpsRuntimeForTests(runtime: OpsRuntime | null): void {
  runtimeOverride = runtime;
  cachedToolkit = null;
}

async function createRealToolkit(): Promise<OpsToolkitLike> {
  if (!env.paypal) throw new Error('PayPal sandbox is not configured');
  // Loaded lazily: the toolkit pulls in several AI-framework adapters we never need at startup.
  const { PayPalAgentToolkit } = await import('@paypal/agent-toolkit/openai');
  const toolkit = new PayPalAgentToolkit({
    clientId: env.paypal.PAYPAL_CLIENT_ID,
    clientSecret: env.paypal.PAYPAL_CLIENT_SECRET,
    configuration: {
      // Layer 1: only read permissions exist as far as the toolkit is concerned.
      actions: JSON.parse(JSON.stringify(PAYPAL_READ_ONLY_PERMISSIONS)),
      context: { sandbox: true },
    },
  });
  return toolkit as unknown as OpsToolkitLike;
}

export async function getOpsRuntime(): Promise<OpsRuntime> {
  if (runtimeOverride) return runtimeOverride;
  if (!cachedToolkit) cachedToolkit = await createRealToolkit();
  return { ai: aiClient, toolkit: cachedToolkit };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…[truncated ${text.length - max} chars]`;
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content ?? null);
  } catch {
    return String(content);
  }
}

function toolMessage(id: string, payload: unknown): OpenAI.Chat.ChatCompletionToolMessageParam {
  return { role: 'tool', tool_call_id: id, content: truncate(stringifyContent(payload), MAX_TOOL_OUTPUT_CHARS) };
}

/** Masks credential-looking fragments so an upstream error can never leak a secret into the model context. */
export function redactSecrets(text: string): string {
  return text
    .replace(/(client[_-]?secret|secret|password|api[_-]?key|access[_-]?token|token)(["']?\s*[=:]\s*["']?)[^\s"',;}]+/gi, '$1$2[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/Basic\s+[A-Za-z0-9+/]+=*/gi, 'Basic [redacted]');
}

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return truncate(redactSecrets(message.replace(/\s+/g, ' ')), 300);
}

/**
 * Runs the read-only Ops Copilot loop. The model may call PayPal Agent Toolkit tools (allow-listed,
 * read-only) and internal audit tools. It can never move money: write tools are not advertised and
 * are refused by name even if the model hallucinates them.
 */
export async function runOpsCopilot(question: string, runtime: OpsRuntime): Promise<OpsResult> {
  // Layer 2 (advertise): keep only allow-listed PayPal tools, whatever the toolkit offers.
  const paypalTools = runtime.toolkit.getTools().filter((t) => isAllowedPayPalTool(t.function?.name));
  const tools: OpenAI.Chat.ChatCompletionTool[] = [...paypalTools, ...INTERNAL_TOOLS];

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: OPS_SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];
  const toolsUsed: OpsToolUse[] = [];

  for (let step = 1; step <= MAX_STEPS; step++) {
    const completion = await runtime.ai.chat(messages, tools);
    const message = completion.choices[0]?.message;
    const calls = message?.tool_calls ?? [];

    if (!message || calls.length === 0) {
      return { answer: (message?.content ?? '').trim() || 'I could not produce an answer.', toolsUsed, steps: step };
    }

    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });

    for (const call of calls.slice(0, MAX_TOOL_CALLS_PER_STEP)) {
      const name = call.function?.name ?? '';
      const rawArgs = call.function?.arguments ?? '';

      // Layer 2 (enforce): decided by name, before anything touches PayPal.
      if (!isInternalTool(name) && !isAllowedPayPalTool(name)) {
        toolsUsed.push({ name, source: 'rejected', ok: false });
        messages.push(toolMessage(call.id, { error: `Tool "${name}" is not permitted: the Ops Copilot is read-only.` }));
        continue;
      }
      if (rawArgs.length > MAX_ARGUMENT_CHARS) {
        toolsUsed.push({ name, source: isInternalTool(name) ? 'internal' : 'paypal', ok: false });
        messages.push(toolMessage(call.id, { error: 'Tool arguments are too large.' }));
        continue;
      }

      try {
        if (isInternalTool(name)) {
          messages.push(toolMessage(call.id, executeInternalTool(name, rawArgs)));
          toolsUsed.push({ name, source: 'internal', ok: true });
        } else {
          const result = await runtime.toolkit.handleToolCall(call);
          messages.push(toolMessage(call.id, result?.content));
          toolsUsed.push({ name, source: 'paypal', ok: true });
        }
      } catch (err) {
        toolsUsed.push({ name, source: isInternalTool(name) ? 'internal' : 'paypal', ok: false });
        messages.push(toolMessage(call.id, { error: errorText(err) }));
      }
    }
    // Calls beyond the per-step cap still need a tool message so the transcript stays valid.
    for (const call of calls.slice(MAX_TOOL_CALLS_PER_STEP)) {
      toolsUsed.push({ name: call.function?.name ?? '', source: 'rejected', ok: false });
      messages.push(toolMessage(call.id, { error: 'Too many tool calls in one step.' }));
    }
  }

  // Step budget exhausted: ask for a final answer without offering tools.
  const final = await runtime.ai.chat(messages);
  const answer = (final.choices[0]?.message?.content ?? '').trim();
  return { answer: answer || 'I reached my step limit before I could finish. Please ask a narrower question.', toolsUsed, steps: MAX_STEPS };
}

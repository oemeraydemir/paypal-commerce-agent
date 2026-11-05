import request from 'supertest';
import { createApp } from '../../src/app';
import { aiClient } from '../../src/ai/client';
import { attachCompletionMeta } from '../../src/ai/completion-meta';
import { AI_TURN_LIMITS } from '../../src/ai/service';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// The loop bounds ROUNDS; these tests cover the two other ceilings (total tool calls, wall-clock
// time) and the provider/model information the API now reports for every turn.
jest.mock('../../src/ai/client', () => ({ aiClient: { chat: jest.fn() } }));

const mockChat = aiClient.chat as jest.Mock;
const app = createApp();
const msg = (content: string, tool_calls: any = null) => ({ choices: [{ message: { content, tool_calls } }] });
const call = (id: string, name: string, args: any) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

let sess: TestSession;
beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  mockChat.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const chat = (message: string) => request(app).post('/api/ai/chat').set(sess.headers).send({ message });

test('parallel tool calls are capped per turn; surplus calls get an error reply and tools switch off', async () => {
  const many = Array.from({ length: AI_TURN_LIMITS.maxToolCalls + 8 }, (_, i) =>
    call(`c${i}`, 'search_products', { query: `q${i}` })
  );
  let withTools = 0;
  mockChat.mockImplementation(async (messages: any[], tools?: unknown[]) => {
    if (!tools) {
      // Every surplus tool_call still has a reply (a valid transcript for the next provider).
      const toolReplies = messages.filter((m) => m.role === 'tool');
      expect(toolReplies).toHaveLength(many.length);
      expect(toolReplies.filter((m) => /Tool budget/.test(m.content))).toHaveLength(8);
      return msg('Here is what I found.');
    }
    withTools++;
    return msg('', many);
  });

  const res = await chat('find everything');
  expect(res.status).toBe(200);
  expect(res.body.response).toBe('Here is what I found.');
  expect(withTools).toBe(1);
});

test('a turn that exceeds the time budget stops offering tools', async () => {
  const realNow = Date.now;
  let clock = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  let n = 0;
  mockChat.mockImplementation(async (_m: unknown, tools?: unknown[]) => {
    if (!tools) return msg('Answering within the time budget.');
    n++;
    clock += AI_TURN_LIMITS.maxTurnMs + 1; // the model call was slow
    return msg('', [call(`t${n}`, 'search_products', { query: `slow${n}` })]);
  });

  const res = await chat('slow request');
  Date.now = realNow;
  expect(res.status).toBe(200);
  expect(res.body.response).toBe('Answering within the time budget.');
  expect(n).toBe(1); // second model call was made without tools
});

test('the response names the provider and model that answered, and flags a fallback', async () => {
  mockChat.mockResolvedValueOnce(
    attachCompletionMeta(msg('Hello from the second provider.'), { provider: 'groq', model: 'openai/gpt-oss-120b', fallback: true })
  );
  const res = await chat('hi');
  expect(res.status).toBe(200);
  expect(res.body.mode).toBe('ai');
  expect(res.body.provider).toBe('groq');
  expect(res.body.model).toBe('openai/gpt-oss-120b');
  expect(res.body.modelCalls).toBe(1);
  expect(res.body.fallback).toBe(true);
  expect(res.headers['x-ai-provider']).toBe('groq');
});

test('a clean first-provider answer reports fallback=false', async () => {
  mockChat.mockResolvedValueOnce(
    attachCompletionMeta(msg('Hi.'), { provider: 'gemini', model: 'gemini-3.6-flash', fallback: false })
  );
  const res = await chat('hi');
  expect(res.body.provider).toBe('gemini');
  expect(res.body.fallback).toBe(false);
});

test('the rule-based planner is labelled as such in the new fields', async () => {
  const { AppError } = require('../../src/middleware/error-handler');
  mockChat.mockRejectedValue(new AppError(503, 'capacity', { code: 'AI_UNAVAILABLE' }));
  const res = await chat('coffee please');
  expect(res.status).toBe(200);
  expect(res.body.provider).toBe('rule-based');
  expect(res.body.modelCalls).toBe(0);
  expect(res.body.fallback).toBe(true);
});

test('one structured log line per turn contains names and counters only', async () => {
  mockChat.mockResolvedValueOnce(
    attachCompletionMeta(msg('ok'), { provider: 'groq', model: 'm', fallback: false })
  );
  await chat('hi');
  const lines = (console.log as jest.Mock).mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"ai_turn"'));
  expect(lines).toHaveLength(1);
  const parsed = JSON.parse(lines[0]);
  expect(Object.keys(parsed).sort()).toEqual(
    ['evt', 'fallback', 'limitReached', 'model', 'modelCalls', 'provider', 'toolRounds'].sort()
  );
});

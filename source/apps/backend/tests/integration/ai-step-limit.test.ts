import request from 'supertest';
import { createApp } from '../../src/app';
import { aiClient } from '../../src/ai/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

// Regression: a model that keeps calling tools used to exhaust the round budget and the user saw
// "I apologize, but I've reached the maximum number of steps." — on every provider, because the
// loop (not the provider) owns the budget. The loop must now always end with a written answer.
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
});

const chat = (message: string) => request(app).post('/api/ai/chat').set(sess.headers).send({ message });

test('a model that never stops calling tools still ends with a written answer (no "maximum steps")', async () => {
  let n = 0;
  mockChat.mockImplementation(async (_messages: unknown, tools?: unknown[]) => {
    if (!tools) return msg('Here is what I found: coffee and snacks are available.');
    n++;
    return msg('', [call(`c${n}`, 'search_products', { query: `q${n}` })]); // new args every time
  });

  const res = await chat('anything');
  expect(res.status).toBe(200);
  expect(res.body.response).not.toMatch(/maximum number of steps/i);
  expect(res.body.response).toContain('Here is what I found');
  // The final model call was made WITHOUT tools.
  const lastCall = mockChat.mock.calls[mockChat.mock.calls.length - 1];
  expect(lastCall[1]).toBeUndefined();
});

test('repeating the identical tool call ends the loop early and is not re-executed', async () => {
  let withTools = 0;
  mockChat.mockImplementation(async (_messages: unknown, tools?: unknown[]) => {
    if (!tools) return msg('Summary without more searching.');
    withTools++;
    return msg('', [call(`c${withTools}`, 'search_products', { query: 'coffee' })]);
  });

  const res = await chat('coffee');
  expect(res.status).toBe(200);
  expect(res.body.response).toBe('Summary without more searching.');
  // round 1 (new call), round 2 (pure repeat) → tools switched off → round 3 answers.
  expect(withTools).toBe(2);
  expect(mockChat).toHaveBeenCalledTimes(3);
});

test('after a cart is prepared the next model call has no tools and the cart survives', async () => {
  mockChat
    .mockResolvedValueOnce(msg('', [call('a', 'prepare_cart', { items: [{ productId: 'coffee', quantity: 2 }] })]))
    // A misbehaving model would call a tool again here; with tools off it must just answer.
    .mockImplementationOnce(async (_m: unknown, tools?: unknown[]) => {
      expect(tools).toBeUndefined();
      return msg('Your cart: 2x Coffee, EUR 6.00. Proceed?');
    });

  const res = await chat('two coffees');
  expect(res.status).toBe(200);
  expect(res.body.checkoutReady).toBe(true);
  expect(res.body.preparedCart.totalMinor).toBe(600);
  expect(res.body.response).toContain('Your cart');
});

test('an empty final answer falls back to a truthful sentence, not the max-steps apology', async () => {
  mockChat.mockImplementation(async (_m: unknown, tools?: unknown[]) =>
    tools ? msg('', [call('x', 'search_products', { query: 'a' })]) : msg('')
  );
  const res = await chat('hmm');
  expect(res.status).toBe(200);
  expect(res.body.response).not.toMatch(/maximum number of steps/i);
  expect(res.body.response.length).toBeGreaterThan(20);
});

test('providers dying mid-turn after a prepared cart keep the cart (no 503, no restart)', async () => {
  const { AppError } = require('../../src/middleware/error-handler');
  mockChat
    .mockResolvedValueOnce(msg('', [call('a', 'prepare_cart', { items: [{ productId: 'coffee', quantity: 2 }] })]))
    .mockRejectedValueOnce(new AppError(503, 'AI is temporarily at capacity', { code: 'AI_UNAVAILABLE' }));

  const res = await chat('two coffees');
  expect(res.status).toBe(200);
  expect(res.body.checkoutReady).toBe(true);
  expect(res.body.preparedCart.totalMinor).toBe(600);
  expect(res.body.response).toMatch(/cart was already prepared/i);
  expect(res.body.mode).not.toBe('rule-based');
});

test('providers dying before any cart exists still surface as unavailable so the route can fall back', async () => {
  const { AppError } = require('../../src/middleware/error-handler');
  mockChat.mockRejectedValue(new AppError(503, 'AI is temporarily at capacity', { code: 'AI_UNAVAILABLE' }));
  const res = await chat('coffee');
  expect(res.status).toBe(200);
  expect(res.body.mode).toBe('rule-based');
});

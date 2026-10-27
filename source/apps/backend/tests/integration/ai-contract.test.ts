// Wire-contract tests for POST /api/ai/chat.
//
// The Flutter client (lib/services/api_service.dart, lib/models/cart.dart) parses this
// envelope. These tests pin the exact shape and the error behaviour so a backend change
// cannot silently break the app. All AI providers are mocked: no network, no real PayPal,
// no money moves. Test-only file: it does not touch orders, storage or idempotency state.
import request from 'supertest';
import { createApp } from '../../src/app';
import { aiClient } from '../../src/ai/client';
import { AppError } from '../../src/middleware/error-handler';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { peekAIPreparedSession } from '../../src/ai/session-tracker';
import { env } from '../../src/config/environment';

jest.mock('../../src/ai/client', () => ({ aiClient: { chat: jest.fn() } }));
const mockChat = aiClient.chat as jest.Mock;
const app = createApp();
let sess: TestSession;

const msg = (content: string, tool_calls: any = null) => ({
  choices: [{ message: { content, tool_calls } }],
});
const toolCall = (id: string, name: string, args: any) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});
const exhausted = () =>
  new AppError(503, 'AI is temporarily at capacity', { code: 'AI_UNAVAILABLE' });

const ENVELOPE_KEYS = [
  'checkoutReady',
  'messageCount',
  'mode',
  'preparedCart',
  'response',
  'sessionId',
  'toolRounds',
];
// Exactly the fields the Flutter models read.
const CART_KEYS = ['currency', 'items', 'message', 'totalFormatted', 'totalMinor'];
const LINE_KEYS = [
  'lineTotalFormatted',
  'lineTotalMinor',
  'name',
  'productId',
  'quantity',
  'unitPriceFormatted',
  'unitPriceMinor',
];

function expectEnvelope(body: any) {
  expect(Object.keys(body)).toEqual(expect.arrayContaining(ENVELOPE_KEYS));
  expect(typeof body.sessionId).toBe('string');
  expect(typeof body.response).toBe('string');
  expect(typeof body.checkoutReady).toBe('boolean');
  expect(typeof body.toolRounds).toBe('number');
  expect(typeof body.messageCount).toBe('number');
  expect(['ai', 'rule-based']).toContain(body.mode);
  // null (not undefined/missing): the client distinguishes "no cart" from a malformed body.
  expect(body.preparedCart === null || typeof body.preparedCart === 'object').toBe(true);
}

function expectCartShape(cart: any) {
  expect(Object.keys(cart)).toEqual(expect.arrayContaining(CART_KEYS));
  expect(Array.isArray(cart.items)).toBe(true);
  expect(cart.items.length).toBeGreaterThan(0);
  for (const line of cart.items) {
    expect(Object.keys(line)).toEqual(expect.arrayContaining(LINE_KEYS));
    expect(Number.isInteger(line.quantity)).toBe(true);
    expect(Number.isInteger(line.unitPriceMinor)).toBe(true);
    expect(Number.isInteger(line.lineTotalMinor)).toBe(true);
  }
  expect(Number.isInteger(cart.totalMinor)).toBe(true);
  expect(typeof cart.currency).toBe('string');
}

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  mockChat.mockReset();
  mockChat.mockResolvedValue(msg('Hello!', null));
});

describe('POST /api/ai/chat wire contract', () => {
  test('normal AI reply without a cart: full envelope, preparedCart is JSON null, mode "ai"', async () => {
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'hi' });
    expect(res.status).toBe(200);
    expect(res.type).toBe('application/json');
    expectEnvelope(res.body);
    expect(res.body.mode).toBe('ai');
    expect(res.body.preparedCart).toBeNull();
    expect(res.body.checkoutReady).toBe(false);
    expect(peekAIPreparedSession(sess.sessionId)).toBeUndefined();
  });

  test('AI cart: cart + line shape match what Flutter parses; session is AI-attributed', async () => {
    mockChat
      .mockResolvedValueOnce(msg('ok', [toolCall('c1', 'prepare_cart', { items: [{ productId: 'coffee', quantity: 2 }] })]))
      .mockResolvedValueOnce(msg('Here is your cart.', null));
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: '2 coffees' });
    expect(res.status).toBe(200);
    expectEnvelope(res.body);
    expect(res.body.mode).toBe('ai');
    expect(res.body.checkoutReady).toBe(true);
    expectCartShape(res.body.preparedCart);
    expect(res.body.preparedCart.totalMinor).toBe(600);
    expect(peekAIPreparedSession(sess.sessionId)).toBe('AI_ASSISTED');
  });

  test('rule-based fallback with a cart: same envelope + cart shape, never AI-attributed', async () => {
    mockChat.mockRejectedValue(exhausted());
    const res = await request(app)
      .post('/api/ai/chat').set(sess.headers)
      .send({ message: 'coffee and a croissant' });
    expect(res.status).toBe(200);
    expectEnvelope(res.body);
    expect(res.body.mode).toBe('rule-based');
    expect(res.body.checkoutReady).toBe(true);
    expectCartShape(res.body.preparedCart);
    expect(peekAIPreparedSession(sess.sessionId)).toBeUndefined();
  });

  test('rule-based fallback with no plan: honest text, preparedCart null, checkoutReady false', async () => {
    mockChat.mockRejectedValue(exhausted());
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'zzz' });
    expect(res.status).toBe(200);
    expectEnvelope(res.body);
    expect(res.body.mode).toBe('rule-based');
    expect(res.body.preparedCart).toBeNull();
    expect(res.body.checkoutReady).toBe(false);
    expect(res.body.response.trim().length).toBeGreaterThan(0);
  });

  test('checkoutReady is never true without a cart (client must not invent readiness)', async () => {
    for (const reject of [false, true]) {
      if (reject) mockChat.mockRejectedValue(exhausted());
      const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'hello there' });
      expect(res.status).toBe(200);
      if (res.body.checkoutReady) expect(res.body.preparedCart).not.toBeNull();
    }
  });
});

describe('POST /api/ai/chat error contract (JSON, non-2xx, `error` string)', () => {
  const expectJsonError = (res: request.Response, status: number) => {
    expect(res.status).toBe(status);
    expect(res.type).toBe('application/json');
    expect(typeof res.body.error).toBe('string');
    // An error body must never look like a successful envelope.
    expect(res.body).not.toHaveProperty('mode');
    expect(res.body).not.toHaveProperty('preparedCart');
    expect(mockChat).not.toHaveBeenCalled();
  };

  test('missing message -> 400', async () => {
    expectJsonError(await request(app).post('/api/ai/chat').set(sess.headers).send({}), 400);
  });

  test('non-string message -> 400', async () => {
    expectJsonError(await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 42 }), 400);
  });

  test('invalid preferences -> 400 before any AI call', async () => {
    const res = await request(app)
      .post('/api/ai/chat').set(sess.headers)
      .send({ message: 'x', preferences: { maxBudgetMinor: -1 } });
    expectJsonError(res, 400);
  });

  test('no session credentials -> 401', async () => {
    expectJsonError(await request(app).post('/api/ai/chat').send({ message: 'hi' }), 401);
  });

  test('only AI_UNAVAILABLE degrades; any other 503 passes through unmasked', async () => {
    mockChat.mockRejectedValue(new AppError(503, 'upstream down', { code: 'SOMETHING_ELSE' }));
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'coffee' });
    expect(res.status).toBe(503);
    expect(res.body).not.toHaveProperty('mode');
    expect(res.body).not.toHaveProperty('preparedCart');
  });

  test('429 carries a JSON error the client can show', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/ai/chat').set(sess.headers).send({ message: `m${i}` });
    }
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'one more' });
    expect(res.status).toBe(429);
    expect(res.type).toBe('application/json');
    expect(typeof res.body.error).toBe('string');
    expect(res.body).not.toHaveProperty('mode');
  });
});

describe('POST /api/ai/chat with no AI provider configured (fresh clone, no keys)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('degrades to the labelled rule-based planner instead of a 503 dead end', async () => {
    jest.spyOn(env, 'isAIEnabled').mockReturnValue(false);
    const res = await request(app)
      .post('/api/ai/chat').set(sess.headers)
      .send({ message: 'coffee and a croissant' });
    expect(res.status).toBe(200);
    expectEnvelope(res.body);
    expect(res.body.mode).toBe('rule-based');
    expect(res.body.response).toMatch(/no AI/i);
    expectCartShape(res.body.preparedCart);
    expect(mockChat).not.toHaveBeenCalled(); // no provider call is attempted
    expect(peekAIPreparedSession(sess.sessionId)).toBeUndefined(); // never attributed to an AI agent
  });

  test('validation still comes first: bad input is a 400, not a fallback', async () => {
    jest.spyOn(env, 'isAIEnabled').mockReturnValue(false);
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({});
    expect(res.status).toBe(400);
  });
});

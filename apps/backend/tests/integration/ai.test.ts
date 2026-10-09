import request from 'supertest';
import { createApp } from '../../src/app';
import { aiClient } from '../../src/ai/client';
import {
  consumeAIPreparedSession,
  markSessionAIPrepared,
} from '../../src/ai/session-tracker';

// Mock the OpenAI client — NO real OpenAI network calls.
jest.mock('../../src/ai/client', () => ({
  aiClient: { chat: jest.fn() },
}));

const mockChat = aiClient.chat as jest.Mock;
const app = createApp();

const msg = (content: string, tool_calls: any = null) => ({
  choices: [{ message: { content, tool_calls } }],
});

const toolCall = (id: string, name: string, args: any) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

beforeEach(() => {
  mockChat.mockReset();
  // Default: model returns a plain text reply, no tool calls.
  mockChat.mockResolvedValue(msg('I found some great breakfast options!', null));
});

describe('AI API', () => {
  test('clearing an AI cart removes the AI-origin marker', async () => {
    const sessionId = 'clear-cart-origin-test';
    markSessionAIPrepared(sessionId);

    const response = await request(app).delete(`/api/ai/cart/${sessionId}`);

    expect(response.status).toBe(200);
    expect(consumeAIPreparedSession(sessionId)).toBe(false);
  });

  test('clearing a conversation removes its AI-origin marker', async () => {
    const sessionId = 'clear-chat-origin-test';
    markSessionAIPrepared(sessionId);

    const response = await request(app).delete(`/api/ai/chat/${sessionId}`);

    expect(response.status).toBe(200);
    expect(consumeAIPreparedSession(sessionId)).toBe(false);
  });

  test('POST /api/ai/chat returns AI response', async () => {
    const response = await request(app)
      .post('/api/ai/chat')
      .send({ sessionId: 'test-session-001', message: 'I need breakfast for 2 people' });

    expect(response.status).toBe(200);
    expect(response.body.response).toBeDefined();
    expect(response.body.checkoutReady).toBe(false);
  });

  test('shopper profile is provided to the AI as a hard constraint', async () => {
    const response = await request(app)
      .post('/api/ai/chat')
      .send({
        sessionId: 'profile-constraints-test',
        message: 'Find me breakfast',
        preferences: { dietary: ['vegan'], maxBudgetMinor: 900 },
      });

    expect(response.status).toBe(200);
    const messages = mockChat.mock.calls[0][0];
    expect(messages[0].content).toContain(
      'Dietary preferences that every recommended and prepared item must meet: vegan'
    );
    expect(messages[0].content).toContain('Maximum total cart budget: 900');
  });

  test('AI cannot prepare an item that violates the shopper profile', async () => {
    mockChat.mockResolvedValueOnce(
      msg('Preparing your cart', [
        toolCall('profile-cart', 'prepare_cart', {
          items: [{ productId: 'veg_breakfast', quantity: 1 }],
        }),
      ])
    );
    const response = await request(app)
      .post('/api/ai/chat')
      .send({
        sessionId: 'profile-cart-enforcement-test',
        message: 'Prepare breakfast',
        preferences: { dietary: ['vegan'] },
      });

    expect(response.status).toBe(200);
    expect(response.body.checkoutReady).toBe(false);
    const toolMessages = mockChat.mock.calls[1][0].filter(
      (message: any) => message.role === 'tool'
    );
    expect(toolMessages[0].content).toContain(
      "does not meet the shopper's dietary preferences"
    );
  });

  test('rejects unsupported or invalid shopper preferences', async () => {
    const response = await request(app)
      .post('/api/ai/chat')
      .send({
        sessionId: 'invalid-profile-test',
        message: 'Find breakfast',
        preferences: { dietary: ['peanut-free'], maxBudgetMinor: -1 },
      });

    expect(response.status).toBe(400);
    expect(mockChat).not.toHaveBeenCalled();
  });

  test('Rate limiting: 11th request returns 429', async () => {
    const sessionId = 'rate-limit-test';

    for (let i = 0; i < 10; i++) {
      const r = await request(app)
        .post('/api/ai/chat')
        .send({ sessionId, message: `Request ${i}` });
      expect(r.status).toBe(200);
    }

    const response = await request(app)
      .post('/api/ai/chat')
      .send({ sessionId, message: 'Request 11' });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe('Rate limit exceeded');
  });

  test('Multi-round loop: search → prepare_cart → checkoutReady (FIX #5, #8)', async () => {
    mockChat
      .mockResolvedValueOnce(
        msg('ok', [toolCall('c1', 'search_products', { query: 'breakfast' })])
      )
      .mockResolvedValueOnce(
        msg('ok', [toolCall('c2', 'prepare_cart', { items: [{ productId: 'coffee', quantity: 2 }] })])
      )
      .mockResolvedValueOnce(msg('Here is your cart. Proceed to checkout?', null));

    const response = await request(app)
      .post('/api/ai/chat')
      .send({ sessionId: 'multi-001', message: 'breakfast for 2' });

    expect(response.status).toBe(200);
    expect(response.body.toolRounds).toBeGreaterThanOrEqual(2);
    expect(response.body.checkoutReady).toBe(true);
    expect(response.body.preparedCart).toBeDefined();
    expect(response.body.preparedCart.items).toHaveLength(1);
    expect(response.body.preparedCart.totalMinor).toBe(600); // 300 * 2, catalog-authoritative
    expect(response.body.preparedCart.currency).toBe('EUR');
  });

  test('Safety boundary: disallowed (PayPal) tool is rejected (FIX #7)', async () => {
    mockChat.mockResolvedValueOnce(msg('ok', [toolCall('cx', 'capture_payment', {})]));

    const response = await request(app)
      .post('/api/ai/chat')
      .send({ sessionId: 'safe-001', message: 'just pay it' });

    // The service refuses the unauthorized tool before any payment can happen.
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
  });
});

import request from 'supertest';
import { createApp } from '../../src/app';
import { aiClient } from '../../src/ai/client';
import { AppError } from '../../src/middleware/error-handler';
import { newSession, resetSessionState, TestSession } from '../helpers/session';
import { peekAIPreparedSession } from '../../src/ai/session-tracker';
import { policyStorage } from '../../src/policy/storage';

jest.mock('../../src/ai/client', () => ({ aiClient: { chat: jest.fn() } }));
const mockChat = aiClient.chat as jest.Mock;
const app = createApp();
let sess: TestSession;

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  mockChat.mockReset();
});

const exhausted = () =>
  new AppError(503, 'AI is temporarily at capacity', { code: 'AI_UNAVAILABLE' });

describe('AI chat degrades to the rule-based planner when providers are exhausted', () => {
  test('returns 200 with an honest rule-based label and a policy-checked cart', async () => {
    mockChat.mockRejectedValue(exhausted());
    const res = await request(app)
      .post('/api/ai/chat').set(sess.headers)
      .send({ message: 'vegetarian breakfast for two under €20' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('rule-based');
    expect(res.body.response).toMatch(/no AI/i);
    expect(res.body.checkoutReady).toBe(true);
    expect(res.body.preparedCart.totalMinor).toBeLessThanOrEqual(2000);
    expect(['AUTO_ALLOW', 'REQUIRE_CONFIRMATION']).toContain(res.body.preparedCart.policyDecision);
  });

  test('is NOT attributed to an AI agent (no AI marker, no AI_AGENT policy event)', async () => {
    mockChat.mockRejectedValue(exhausted());
    await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'coffee and a croissant' });

    expect(peekAIPreparedSession(sess.sessionId)).toBe(false);
    const events = policyStorage.getEvents(sess.userId);
    expect(JSON.stringify(events)).not.toContain('AI_AGENT');
  });

  test('says so plainly when it cannot understand the request', async () => {
    mockChat.mockRejectedValue(exhausted());
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'zzz' });
    expect(res.status).toBe(200);
    expect(res.body.preparedCart).toBeNull();
    expect(res.body.checkoutReady).toBe(false);
  });

  test('other AI failures are NOT masked by the fallback', async () => {
    mockChat.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'breakfast' });
    expect(res.status).toBe(500);
  });

  test('a healthy AI reply is labelled mode "ai"', async () => {
    mockChat.mockResolvedValue({ choices: [{ message: { content: 'Hello!', tool_calls: null } }] });
    const res = await request(app).post('/api/ai/chat').set(sess.headers).send({ message: 'hi' });
    expect(res.body.mode).toBe('ai');
  });
});

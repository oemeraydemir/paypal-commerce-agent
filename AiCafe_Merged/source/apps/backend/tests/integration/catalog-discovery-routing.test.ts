import request from 'supertest';
import { createApp } from '../../src/app';
import { aiClient } from '../../src/ai/client';
import { newSession, resetSessionState, TestSession } from '../helpers/session';

jest.mock('../../src/ai/client', () => ({ aiClient: { chat: jest.fn() } }));
const mockChat = aiClient.chat as jest.Mock;
const app = createApp();
let sess: TestSession;

beforeEach(async () => {
  resetSessionState();
  sess = await newSession(app);
  mockChat.mockReset();
});

describe('catalog discovery routing', () => {
  test('the Web discovery intent returns catalog choices without invoking the model', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set(sess.headers)
      .send({
        message: 'Vegetarian breakfast for two under €20',
        preferences: { dietary: ['vegetarian'], maxBudgetMinor: 2000 },
        intent: 'catalog_discovery',
      });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('catalog-options');
    expect(res.body.response).toMatch(/Options:/);
    expect(res.body.preparedCart).toBeNull();
    expect(res.body.checkoutReady).toBe(false);
    expect(mockChat).not.toHaveBeenCalled();
  });

  test('requests without the discovery intent preserve the normal AI path', async () => {
    mockChat.mockResolvedValue({ choices: [{ message: { content: 'AI answer', tool_calls: null } }] });
    const res = await request(app)
      .post('/api/ai/chat')
      .set(sess.headers)
      .send({ message: 'Vegetarian breakfast for two under €20' });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ai');
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});

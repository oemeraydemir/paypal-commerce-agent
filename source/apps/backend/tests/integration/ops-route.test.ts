import request from 'supertest';
import { createApp } from '../../src/app';
import { resetOpsRouteState } from '../../src/routes/ops';
import { setOpsRuntimeForTests } from '../../src/ops/ops-agent';

const KEY = 'ops-demo-key-0123456789';
const app = createApp();

const fakeChat = jest.fn();
const fakeToolkit = { getTools: () => [], handleToolCall: jest.fn() };

const enable = (extra: Record<string, string> = {}) => {
  process.env.OPS_COPILOT_ENABLED = 'true';
  process.env.OPS_COPILOT_KEY = KEY;
  Object.assign(process.env, extra);
};

beforeEach(() => {
  delete process.env.OPS_COPILOT_ENABLED;
  delete process.env.OPS_COPILOT_KEY;
  delete process.env.OPS_COPILOT_PER_IP_PER_MIN;
  resetOpsRouteState();
  fakeChat.mockReset();
  fakeChat.mockResolvedValue({ choices: [{ message: { content: 'All quiet in the sandbox.' } }] });
  setOpsRuntimeForTests({ ai: { chat: fakeChat } as any, toolkit: fakeToolkit as any });
});

afterAll(() => {
  delete process.env.OPS_COPILOT_ENABLED;
  delete process.env.OPS_COPILOT_KEY;
  setOpsRuntimeForTests(null);
});

// key === null means "send no X-Ops-Key header at all" (undefined would fall back to the valid default).
const ask = (body: unknown, key: string | null = KEY) => {
  const r = request(app).post('/api/ops/ask');
  if (key !== null) r.set('X-Ops-Key', key);
  return r.send(body as any);
};

describe('GET /api/ops/status', () => {
  test('is disabled by default and explains why, without exposing any key', async () => {
    const res = await request(app).get('/api/ops/status');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.readOnly).toBe(true);
    expect(res.body.requiresKey).toBe(true);
    expect(res.body.reason).toMatch(/disabled/i);
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  test('lists the read-only tools when enabled', async () => {
    enable();
    const res = await request(app).get('/api/ops/status');
    expect(res.body.enabled).toBe(true);
    expect(res.body.paypalTools).toContain('list_transactions');
    expect(res.body.paypalTools).not.toContain('pay_order');
    expect(JSON.stringify(res.body)).not.toContain(KEY);
  });

  test('a too-short key keeps the feature off', async () => {
    enable({ OPS_COPILOT_KEY: 'short' });
    const res = await request(app).get('/api/ops/status');
    expect(res.body.enabled).toBe(false);
    expect(res.body.reason).toMatch(/16 characters/);
  });

  test('enabled flag without a key keeps the feature off', async () => {
    process.env.OPS_COPILOT_ENABLED = 'true';
    const res = await request(app).get('/api/ops/status');
    expect(res.body.enabled).toBe(false);
    expect(res.body.reason).toMatch(/OPS_COPILOT_KEY/);
  });
});

describe('POST /api/ops/ask', () => {
  test('503 when disabled, and the AI is never called', async () => {
    const res = await ask({ question: 'what happened today?' });
    expect(res.status).toBe(503);
    expect(fakeChat).not.toHaveBeenCalled();
  });

  test('401 without or with a wrong key, and the AI is never called', async () => {
    enable();
    expect((await ask({ question: 'hello there' }, null)).status).toBe(401);
    expect((await ask({ question: 'hello there' }, 'wrong-key-wrong-key-1')).status).toBe(401);
    expect((await ask({ question: 'hello there' }, KEY + 'x')).status).toBe(401);
    expect(fakeChat).not.toHaveBeenCalled();
  });

  test('answers with the key and reports it is read-only sandbox', async () => {
    enable();
    const res = await ask({ question: 'Summarise today in two lines' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('All quiet in the sandbox.');
    expect(res.body.readOnly).toBe(true);
    expect(res.body.sandbox).toBe(true);
    expect(Array.isArray(res.body.toolsUsed)).toBe(true);
  });

  test.each([[undefined], [''], ['hi'], [42], ['x'.repeat(501)]])('rejects an invalid question (%p)', async (question) => {
    enable();
    const res = await ask({ question });
    expect(res.status).toBe(400);
    expect(fakeChat).not.toHaveBeenCalled();
  });

  test('a model that asks for a write tool cannot reach PayPal through the route either', async () => {
    enable();
    fakeChat
      .mockResolvedValueOnce({
        choices: [{ message: { content: null, tool_calls: [{ id: 'w1', type: 'function', function: { name: 'pay_order', arguments: '{"id":"X"}' } }] } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'I can only read.' } }] });
    const res = await ask({ question: 'please pay order X' });
    expect(res.status).toBe(200);
    expect(fakeToolkit.handleToolCall).not.toHaveBeenCalled();
    expect(res.body.toolsUsed).toEqual([{ name: 'pay_order', source: 'rejected', ok: false }]);
  });

  test('upstream failures become a generic 502 that does not leak internals', async () => {
    enable();
    fakeChat.mockRejectedValueOnce(new Error('OpenAI exploded: sk-secret-123'));
    const res = await ask({ question: 'what is going on?' });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/sk-secret|exploded/);
  });

  test('the server LOG of an upstream failure does not contain the secret either', async () => {
    enable();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fakeChat.mockRejectedValueOnce(
        new Error('401 Incorrect API key provided: sk-proj-abcDEF1234567890xyz (Bearer abc.def)')
      );
      const res = await ask({ question: 'what is going on?' });
      expect(res.status).toBe(502);
      const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(logged).toContain('[ops] upstream failure'); // it is still logged...
      expect(logged).not.toMatch(/sk-proj-abcDEF|abc\.def/); // ...but without the secret
    } finally {
      spy.mockRestore();
    }
  });

  test('is rate limited per IP, including wrong-key attempts', async () => {
    enable({ OPS_COPILOT_PER_IP_PER_MIN: '3' });
    for (let i = 0; i < 3; i++) expect((await ask({ question: 'hello there' }, 'nope-nope-nope-nope')).status).toBe(401);
    const blocked = await ask({ question: 'hello there' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

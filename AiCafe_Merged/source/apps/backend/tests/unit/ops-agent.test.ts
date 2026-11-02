import {
  redactSecrets,
  runOpsCopilot,
  OpsToolkitLike,
  OpsRuntime,
  MAX_STEPS,
  MAX_TOOL_CALLS_PER_STEP,
} from '../../src/ops/ops-agent';
import {
  PAYPAL_READ_ONLY_PERMISSIONS,
  READ_ONLY_PAYPAL_TOOLS,
  INTERNAL_TOOL_NAMES,
  isAllowedPayPalTool,
} from '../../src/ops/ops-tools';

const WRITE_PATTERN = /^(create|pay|send|cancel|delete|update|record|accept|setup|activate|generate)_/;

const fn = (name: string) => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } });
const call = (id: string, name: string, args: unknown = {}) => ({
  id,
  type: 'function',
  function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
});
const reply = (content: string | null, tool_calls?: any[]) => ({ choices: [{ message: { content, tool_calls } }] });

function makeRuntime(chatReplies: any[], offered: string[] = READ_ONLY_PAYPAL_TOOLS as string[]) {
  const chat = jest.fn();
  chatReplies.forEach((r) => chat.mockResolvedValueOnce(r));
  const handleToolCall = jest.fn(async (c: any) => ({ content: JSON.stringify({ ok: true, tool: c.function.name }) }));
  const toolkit: OpsToolkitLike = { getTools: () => offered.map(fn) as any, handleToolCall: handleToolCall as any };
  const runtime: OpsRuntime = { ai: { chat } as any, toolkit };
  return { runtime, chat, handleToolCall };
}

describe('permission model', () => {
  test('the permission map only contains read actions', () => {
    const flat = Object.entries(PAYPAL_READ_ONLY_PERMISSIONS).flatMap(([p, acts]) => Object.keys(acts).map((a) => `${p}.${a}`)).sort();
    expect(flat).toEqual(
      ['disputes.get', 'disputes.list', 'invoices.get', 'invoices.list', 'orders.get', 'payments.getRefunds', 'shipment.get', 'transactions.list'].sort()
    );
  });

  test('no allow-listed PayPal tool name looks like a write operation', () => {
    for (const name of READ_ONLY_PAYPAL_TOOLS) expect(name).not.toMatch(WRITE_PATTERN);
  });

  test('the REAL toolkit, given our permissions, exposes exactly the read-only tools (offline, no network)', async () => {
    const { PayPalAgentToolkit, ALL_TOOLS_ENABLED } = await import('@paypal/agent-toolkit/openai');
    const build = (actions: any) =>
      new PayPalAgentToolkit({ clientId: 'dummy', clientSecret: 'dummy', configuration: { actions, context: { sandbox: true } } });
    const exposed = build(JSON.parse(JSON.stringify(PAYPAL_READ_ONLY_PERMISSIONS))).getTools().map((t: any) => t.function.name).sort();
    expect(exposed).toEqual([...READ_ONLY_PAYPAL_TOOLS].sort());
    // Sanity check that the filter is doing real work: the unrestricted toolkit offers many more (incl. writes).
    const everything = build(ALL_TOOLS_ENABLED).getTools().map((t: any) => t.function.name);
    expect(everything.length).toBeGreaterThan(exposed.length * 3);
    expect(everything).toEqual(expect.arrayContaining(['pay_order', 'create_refund', 'send_invoice']));
  });
});

describe('runOpsCopilot', () => {
  test('advertises only allow-listed PayPal tools plus internal tools, even if the toolkit offers writes', async () => {
    const offered = [...READ_ONLY_PAYPAL_TOOLS, 'pay_order', 'create_order', 'create_refund', 'send_invoice', 'delete_invoice'];
    const { runtime, chat } = makeRuntime([reply('done')], offered);
    await runOpsCopilot('hello there', runtime);
    const advertised = (chat.mock.calls[0][1] as any[]).map((t) => t.function.name);
    expect(advertised).toEqual(expect.arrayContaining([...READ_ONLY_PAYPAL_TOOLS, ...INTERNAL_TOOL_NAMES]));
    expect(advertised.filter((n) => WRITE_PATTERN.test(n))).toEqual([]);
    expect(advertised).toHaveLength(READ_ONLY_PAYPAL_TOOLS.length + INTERNAL_TOOL_NAMES.length);
  });

  test('runs an allowed PayPal tool through the toolkit and returns the final answer', async () => {
    const { runtime, handleToolCall } = makeRuntime([
      reply(null, [call('c1', 'list_transactions', { page_size: 5 })]),
      reply('Two captures today.'),
    ]);
    const result = await runOpsCopilot('What was captured today?', runtime);
    expect(handleToolCall).toHaveBeenCalledTimes(1);
    expect(result.answer).toBe('Two captures today.');
    expect(result.toolsUsed).toEqual([{ name: 'list_transactions', source: 'paypal', ok: true }]);
    expect(result.steps).toBe(2);
  });

  test.each([
    'pay_order', 'create_order', 'create_refund', 'send_invoice', 'create_invoice', 'delete_invoice',
    'cancel_sent_invoice', 'record_payment_for_invoice', 'record_refund_for_invoice', 'accept_dispute_claim',
    'create_subscription', 'cancel_subscription', 'update_plan', 'create_product', 'capture_payment', 'totally_made_up',
  ])('a hallucinated or forbidden tool "%s" never reaches the toolkit', async (name) => {
    const { runtime, chat, handleToolCall } = makeRuntime([reply(null, [call('x1', name, { order_id: 'ABC' })]), reply('I am read-only.')]);
    const result = await runOpsCopilot('refund everything please', runtime);
    expect(handleToolCall).not.toHaveBeenCalled();
    expect(isAllowedPayPalTool(name)).toBe(false);
    expect(result.toolsUsed).toEqual([{ name, source: 'rejected', ok: false }]);
    const toolMsg = (chat.mock.calls[1][0] as any[]).find((m) => m.role === 'tool');
    expect(toolMsg.tool_call_id).toBe('x1');
    expect(toolMsg.content).toMatch(/read-only/);
  });

  test('internal tools run against real services (policy summary shows the EUR 20 / EUR 10 limits)', async () => {
    const { runtime, chat, handleToolCall } = makeRuntime([reply(null, [call('s1', 'get_policy_summary')]), reply('ok')]);
    const result = await runOpsCopilot('what are the limits?', runtime);
    expect(handleToolCall).not.toHaveBeenCalled();
    expect(result.toolsUsed).toEqual([{ name: 'get_policy_summary', source: 'internal', ok: true }]);
    const toolMsg = (chat.mock.calls[1][0] as any[]).find((m) => m.role === 'tool');
    const payload = JSON.parse(toolMsg.content);
    expect(payload.defaultPolicy.maxPerPurchase).toMatch(/20\.00/);
    expect(payload.defaultPolicy.confirmationThreshold).toMatch(/10\.00/);
    // No PayPal identifiers or raw session ids in internal tool output.
    expect(toolMsg.content).not.toMatch(/paypalOrderId|paypalCaptureId/);
  });

  test('invalid arguments to an internal tool are reported back, not thrown', async () => {
    const { runtime } = makeRuntime([reply(null, [call('b1', 'get_policy_audit', { limit: 9999 })]), reply('sorry')]);
    const result = await runOpsCopilot('audit please', runtime);
    expect(result.toolsUsed).toEqual([{ name: 'get_policy_audit', source: 'internal', ok: false }]);
    expect(result.answer).toBe('sorry');
  });

  test('a toolkit failure is passed to the model as an error and the loop continues', async () => {
    const { runtime, chat, handleToolCall } = makeRuntime([reply(null, [call('f1', 'get_order', { order_id: 'X' })]), reply('PayPal said no.')]);
    handleToolCall.mockRejectedValueOnce(new Error('401 UNAUTHORIZED client_secret=abc123SECRET Authorization: Bearer A21AAxyzTOKEN'));
    const result = await runOpsCopilot('show order X', runtime);
    expect(result.toolsUsed).toEqual([{ name: 'get_order', source: 'paypal', ok: false }]);
    const toolMsg = (chat.mock.calls[1][0] as any[]).find((m) => m.role === 'tool');
    const sent = JSON.parse(toolMsg.content).error as string;
    expect(sent).toContain('401 UNAUTHORIZED');
    expect(sent).not.toMatch(/abc123SECRET|A21AAxyzTOKEN/);
    expect(result.answer).toBe('PayPal said no.');
  });

  test('oversized tool output is truncated before it goes back to the model', async () => {
    const { runtime, chat, handleToolCall } = makeRuntime([reply(null, [call('t1', 'list_transactions')]), reply('ok')]);
    handleToolCall.mockResolvedValueOnce({ content: 'x'.repeat(50_000) });
    await runOpsCopilot('big list', runtime);
    const toolMsg = (chat.mock.calls[1][0] as any[]).find((m) => m.role === 'tool');
    expect(toolMsg.content.length).toBeLessThan(6200);
    expect(toolMsg.content).toContain('[truncated');
  });

  test('oversized tool arguments are refused', async () => {
    const { runtime, handleToolCall } = makeRuntime([reply(null, [call('a1', 'get_order', 'y'.repeat(5000))]), reply('ok')]);
    const result = await runOpsCopilot('x y z', runtime);
    expect(handleToolCall).not.toHaveBeenCalled();
    expect(result.toolsUsed[0].ok).toBe(false);
  });

  test('extra tool calls beyond the per-step cap are refused but still answered (valid transcript)', async () => {
    const many = Array.from({ length: MAX_TOOL_CALLS_PER_STEP + 2 }, (_, i) => call(`m${i}`, 'get_policy_summary'));
    const { runtime, chat } = makeRuntime([reply(null, many), reply('ok')]);
    const result = await runOpsCopilot('lots', runtime);
    const toolMsgs = (chat.mock.calls[1][0] as any[]).filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(many.length);
    expect(result.toolsUsed.filter((t) => t.source === 'rejected')).toHaveLength(2);
  });

  test('the step budget is enforced and a final answer is requested without tools', async () => {
    const looping = Array.from({ length: MAX_STEPS }, (_, i) => reply(null, [call(`l${i}`, 'get_policy_summary')]));
    const { runtime, chat } = makeRuntime([...looping, reply('Here is what I found so far.')]);
    const result = await runOpsCopilot('never stop', runtime);
    expect(chat).toHaveBeenCalledTimes(MAX_STEPS + 1);
    expect(chat.mock.calls[MAX_STEPS][1]).toBeUndefined();
    expect(result.answer).toBe('Here is what I found so far.');
  });

  test('the system prompt declares the copilot read-only and sandbox', async () => {
    const { runtime, chat } = makeRuntime([reply('hi')]);
    await runOpsCopilot('hello there', runtime);
    const system = (chat.mock.calls[0][0] as any[])[0];
    expect(system.role).toBe('system');
    expect(system.content).toMatch(/READ-ONLY/);
    expect(system.content).toMatch(/sandbox/i);
  });
});

describe('redactSecrets', () => {
  test.each([
    ['client_secret=abc123', 'abc123'],
    ['"access_token":"A21AAtoken"', 'A21AAtoken'],
    ['Authorization: Bearer eyJhbGciOi.payload.sig', 'eyJhbGciOi'],
    ['Authorization: Basic dXNlcjpwYXNz', 'dXNlcjpwYXNz'],
    ['api_key: sk-live-123', 'sk-live-123'],
  ])('masks %s', (input, leaked) => {
    expect(redactSecrets(input)).not.toContain(leaked);
    expect(redactSecrets(input)).toContain('[redacted]');
  });

  test('leaves ordinary text alone', () => {
    expect(redactSecrets('Order not found (404)')).toBe('Order not found (404)');
  });
});

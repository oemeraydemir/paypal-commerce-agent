/* Scripted "external agent" that shops at AI Café through the MCP endpoint.
 * No LLM and no API keys needed — it shows the protocol end to end and prints the
 * PayPal approval link a HUMAN must open. Usage:
 *   npm run mcp:demo                      (server on http://localhost:3000)
 *   npm run mcp:demo -- https://paypal-commerce-agent.onrender.com
 */
const base = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let sid = '';
let id = 0;

async function rpc(method: string, params?: unknown): Promise<any> {
  const res = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(sid ? { 'mcp-session-id': sid } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  if (method === 'initialize') sid = res.headers.get('mcp-session-id') || '';
  const body: any = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}
const tool = async (name: string, args: unknown) => {
  const r = await rpc('tools/call', { name, arguments: args });
  return { isError: !!r.isError, out: r.structuredContent };
};
const step = (n: number, t: string) => console.log(`\n\u001b[1m${n}. ${t}\u001b[0m`);

(async () => {
  console.log(`Agent \u2192 ${base}/api/mcp`);
  step(1, 'initialize');
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-demo-agent', version: '1.0.0' } });
  console.log(`   server: ${init.serverInfo.title}\n   session: ${sid.slice(0, 12)}…`);

  step(2, 'tools/list');
  const { tools } = await rpc('tools/list');
  console.log('   ' + tools.map((t: any) => t.name).join(', '));
  console.log('   (note: no capture / pay / refund tool exists)');

  step(3, 'search_menu: vegetarian breakfast');
  const found = await tool('search_menu', { query: 'breakfast', dietary: ['vegetarian'] });
  console.log('   ' + found.out.products.slice(0, 4).map((p: any) => `${p.id} ${p.priceFormatted}`).join(' | '));

  step(4, 'prepare_cart: 2x veg_breakfast + 2x coffee (server prices + policy decision)');
  const cart = await tool('prepare_cart', { items: [{ productId: 'veg_breakfast', quantity: 2 }, { productId: 'coffee', quantity: 2 }] });
  console.log(`   total ${cart.out.totalFormatted} \u2192 ${cart.out.policyDecision}${cart.out.policyDecision === 'BLOCK' ? ` (${cart.out.reason}) \u2014 the agent must shrink the cart` : ''}`);

  step(5, 'prepare_cart: the agent retries with 1x veg_breakfast + 1x coffee');
  const small = [{ productId: 'veg_breakfast', quantity: 1 }, { productId: 'coffee', quantity: 1 }];
  const ok = await tool('prepare_cart', { items: small });
  console.log(`   total ${ok.out.totalFormatted} \u2192 ${ok.out.policyDecision} (a human must approve this payment)`);

  step(6, 'start_checkout');
  const co = await tool('start_checkout', { items: small });
  if (co.isError) {
    console.log(`   refused: ${co.out.error || co.out.reason}  (is PayPal configured on this server?)`);
  } else {
    console.log(`   order ${co.out.orderId} origin=${co.out.origin} status=${co.out.status}`);
    console.log(`\n   \u001b[1mHUMAN STEP\u001b[0m \u2014 open and approve in PayPal sandbox:\n   ${co.out.approvalUrl}\n`);
    const st = await tool('get_order_status', { orderId: co.out.orderId });
    console.log(`   get_order_status \u2192 ${st.out.status} (paid=${st.out.paid}); the agent cannot capture it.`);
  }
})().catch((e) => { console.error('Demo failed:', e.message); process.exit(1); });

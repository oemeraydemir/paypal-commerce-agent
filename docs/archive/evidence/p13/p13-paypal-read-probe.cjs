// P13: capture the EXACT upstream error text for the read-only PayPal tools.
// Uses the same read-only toolkit configuration as the Ops Copilot (src/ops/ops-tools.ts).
// READ-ONLY, sandbox only. Never prints credentials.
const path = 'C:/Projects/FinCan/paypal-commerce-agent/apps/backend';
require(`${path}/node_modules/dotenv`).config({ path: `${path}/.env` });

const { PayPalAgentToolkit } = require(`${path}/node_modules/@paypal/agent-toolkit/openai`);

const READ_ONLY = {
  transactions: { list: true },
  orders: { get: true },
  disputes: { list: true, get: true },
  shipment: { get: true },
  invoices: { list: true, get: true },
  payments: { getRefunds: true },
};

(async () => {
  const toolkit = new PayPalAgentToolkit({
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    configuration: { actions: READ_ONLY, context: { sandbox: true } },
  });

  const names = toolkit.getTools().map((t) => t.function.name);
  console.log(`toolkit advertises ${names.length} tools`);
  const readOnly = [
    'list_transactions', 'get_order', 'list_disputes', 'get_dispute',
    'get_shipment_tracking', 'list_invoices', 'get_invoice', 'get_refund',
  ];
  console.log(`read-only allow-list tools present: ${readOnly.filter((n) => names.includes(n)).join(', ')}`);
  console.log(`write-looking tools advertised: ${names.filter((n) => /create|pay|capture|cancel|refund_|send|update|delete/i.test(n)).join(', ') || '(none)'}`);

  const probes = [
    ['list_transactions', { page_size: 5 }],
    ['list_invoices', { page_size: 5 }],
    ['list_disputes', { page_size: 5 }],
  ];
  for (const [name, args] of probes) {
    try {
      const res = await toolkit.handleToolCall({
        id: 'probe', type: 'function', function: { name, arguments: JSON.stringify(args) },
      });
      const text = typeof res?.content === 'string' ? res.content : JSON.stringify(res?.content);
      console.log(`\n${name} -> ok, content (first 500 chars):\n${String(text).replace(/\s+/g, ' ').slice(0, 500)}`);
    } catch (err) {
      console.log(`\n${name} -> THREW: ${String(err && err.message ? err.message : err).replace(/\s+/g, ' ').slice(0, 400)}`);
    }
  }
})().catch((e) => {
  console.error('probe failed:', String(e && e.message ? e.message : e).slice(0, 300));
  process.exit(1);
});

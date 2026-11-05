import request from 'supertest';
import { createApp } from '../../src/app';
import { MCP_TOOL_NAMES } from '../../src/routes/mcp';

const app = createApp();
const saved = { ...process.env };

afterEach(() => {
  for (const k of ['NODE_ENV', 'PUBLIC_BASE_URL', 'RENDER_EXTERNAL_URL']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function realMcpTools(): Promise<string[]> {
  const init = await request(app)
    .post('/api/mcp')
    .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  const sid = init.headers['mcp-session-id'];
  const list = await request(app).post('/api/mcp').set('Mcp-Session-Id', sid).send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  return list.body.result.tools.map((t: any) => t.name);
}

const FORBIDDEN_CLAIMS = [/"agentCan(?:Pay|Capture|Refund)":true/i, /\bagents? can (?:pay|capture|refund)\b/i];

/** Every mention of "official" must be a disclaimer ("not an official ..."). */
function officialOnlyAsDisclaimer(doc: string): boolean {
  const re = /official/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    if (!/not an\s*$/i.test(doc.slice(Math.max(0, m.index - 12), m.index))) return false;
  }
  return true;
}

describe('canonical manifest', () => {
  test('/.well-known/agent-commerce.json states guardrails, policy and sandbox mode', async () => {
    const res = await request(app).get('/.well-known/agent-commerce.json');
    expect(res.status).toBe(200);
    expect(res.body.schema).toBe('aicafe.agent-commerce/1');
    expect(res.body.merchant.currency).toBe('EUR');
    expect(res.body.guardrails).toMatchObject({ agentCanPay: false, agentCanCapture: false, agentCanRefund: false, pricesSetBy: 'server' });
    expect(res.body.guardrails.policy.maxPerPurchase).toBe('20.00');
    expect(res.body.guardrails.policy.blockedDietaryAttributes).toContain('alcohol');
    expect(res.body.payments).toMatchObject({ provider: 'paypal', environment: 'sandbox', buyerApprovalRequired: true });
    expect(res.body.verification.cartMandate.canonicalization).toBe('aicafe-stable-json/1');
    expect(res.body.disclaimers.join(' ')).toMatch(/not an official PayPal Agent Ready, Store Sync or AP2/i);
  });

  test('the advertised tool names equal the live MCP tools/list and the registry (and none can pay, capture or refund)', async () => {
    const manifest = await request(app).get('/.well-known/agent-commerce.json');
    const declared: string[] = manifest.body.protocols.mcp.tools;
    const real = await realMcpTools();
    expect([...declared].sort()).toEqual([...real].sort());
    expect([...declared].sort()).toEqual([...MCP_TOOL_NAMES].sort());
    expect(declared.join(',')).not.toMatch(/pay|capture|refund/);
  });

  test('agent.json and llms.txt are generated from the manifest and agree with it', async () => {
    const host = 'shop.example';
    const m = (await request(app).get('/.well-known/agent-commerce.json').set('Host', host)).body;
    const card = (await request(app).get('/.well-known/agent.json').set('Host', host)).body;
    const llms = await request(app).get('/llms.txt').set('Host', host);
    expect(card.mcp.endpoint).toBe(m.endpoints.mcp);
    expect(card.mcp.tools).toEqual(m.protocols.mcp.tools);
    expect(card.manifest).toBe(m.endpoints.manifest);
    expect(card.guardrails).toMatchObject({ agentCanPay: false, agentCanCapture: false, agentCanRefund: false });
    expect(card.environment).toBe(m.payments.environment);
    expect(llms.headers['content-type']).toMatch(/text\/plain/);
    for (const t of m.protocols.mcp.tools) expect(llms.text).toContain(t);
    expect(llms.text).toContain(m.endpoints.manifest);
    expect(llms.text).toMatch(/no pay, capture or refund tool/i);
  });

  test('no discovery document claims payment authority or an official PayPal / AP2 integration', async () => {
    const docs = [
      JSON.stringify((await request(app).get('/.well-known/agent-commerce.json')).body),
      JSON.stringify((await request(app).get('/.well-known/agent.json')).body),
      (await request(app).get('/llms.txt')).text,
      JSON.stringify((await request(app).get('/api/feed/products')).body),
    ];
    for (const d of docs) {
      for (const re of FORBIDDEN_CLAIMS) expect(d).not.toMatch(re);
      expect(officialOnlyAsDisclaimer(d)).toBe(true);
    }
  });

  test('discovery endpoints are read-only', async () => {
    for (const p of ['/.well-known/agent-commerce.json', '/.well-known/agent.json', '/llms.txt', '/api/feed/products']) {
      const res = await request(app).post(p).send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('public base URL', () => {
  // FIX-03 (verification finding H5): outside production with nothing configured, the
  // server used to derive the public URL from the request's own Host header — an
  // attacker-controlled value in documents served with a public Cache-Control
  // (host-header cache poisoning). The request is now never consulted.
  test('outside production, an unconfigured server uses its own loopback origin, never the request Host', async () => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    const res = await request(app)
      .get('/.well-known/agent-commerce.json')
      .set('Host', 'evil.example')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Host', 'evil.example');
    expect(res.status).toBe(200);
    expect(res.body.endpoints.mcp).toBe(`http://localhost:${process.env.PORT ?? 3000}/api/mcp`);
    expect(res.text).not.toContain('evil.example');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('PUBLIC_BASE_URL wins over Host and X-Forwarded-* headers in every document, and enables public caching', async () => {
    process.env.PUBLIC_BASE_URL = 'https://cafe.example.com/';
    for (const path of ['/.well-known/agent-commerce.json', '/.well-known/agent.json', '/llms.txt', '/api/feed/products']) {
      const res = await request(app).get(path).set('Host', 'evil.example').set('X-Forwarded-Proto', 'http').set('X-Forwarded-Host', 'evil.example');
      expect(res.status).toBe(200);
      const text = res.text;
      expect(text).toContain('https://cafe.example.com/');
      expect(text).not.toContain('evil.example');
      expect(res.headers['cache-control']).toMatch(/^public, max-age=\d+$/);
    }
  });

  // FIX-03: every discovery endpoint, hostile Host + X-Forwarded-Proto + X-Forwarded-Host,
  // with NOTHING configured (the previously vulnerable development path).
  test('hostile Host / forwarded headers never reach ANY discovery document, configured or not', async () => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    process.env.NODE_ENV = 'development';
    const loopback = `http://localhost:${process.env.PORT ?? 3000}`;
    for (const path of ['/.well-known/agent-commerce.json', '/.well-known/agent.json', '/llms.txt', '/api/feed/products']) {
      const res = await request(app)
        .get(path)
        .set('Host', 'evil.example')
        .set('X-Forwarded-Proto', 'https')
        .set('X-Forwarded-Host', 'evil.example');
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('evil.example');
      expect(res.text).toContain(loopback);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  test('production without a configured URL does not fall back to the Host header: 503, no-store', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    for (const path of ['/.well-known/agent-commerce.json', '/.well-known/agent.json', '/llms.txt', '/api/feed/products']) {
      const res = await request(app).get(path).set('Host', 'evil.example').set('X-Forwarded-Proto', 'https');
      expect(res.status).toBe(503);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).not.toContain('evil.example');
    }
  });

  test('production accepts RENDER_EXTERNAL_URL as an explicit platform-provided value', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_BASE_URL;
    process.env.RENDER_EXTERNAL_URL = 'https://paypal-commerce-agent.onrender.com';
    const res = await request(app).get('/.well-known/agent-commerce.json').set('Host', 'evil.example');
    expect(res.status).toBe(200);
    expect(res.body.endpoints.mcp).toBe('https://paypal-commerce-agent.onrender.com/api/mcp');
  });

  test('an unusable PUBLIC_BASE_URL (plain http in production, credentials, query) is refused, not guessed', async () => {
    for (const [nodeEnv, value] of [['production', 'http://cafe.example.com'], ['test', 'https://u:p@cafe.example.com'], ['test', 'https://cafe.example.com/?x=1']]) {
      process.env.NODE_ENV = nodeEnv;
      process.env.PUBLIC_BASE_URL = value;
      const res = await request(app).get('/.well-known/agent-commerce.json');
      expect(res.status).toBe(503);
    }
  });
});

describe('product feed', () => {
  test('is a schema.org-style ItemList whose prices equal the server catalog', async () => {
    const feed = await request(app).get('/api/feed/products');
    const cat = await request(app).get('/api/catalog');
    expect(feed.status).toBe(200);
    expect(feed.body['@context']).toBe('https://schema.org');
    expect(feed.body['@type']).toBe('ItemList');
    expect(feed.body.description).toMatch(/not an official PayPal Store Sync/i);
    expect(feed.body.numberOfItems).toBe(cat.body.count);
    expect(feed.body.itemListElement).toHaveLength(cat.body.count);
    feed.body.itemListElement.forEach((el: any, i: number) => {
      expect(el['@type']).toBe('ListItem');
      expect(el.position).toBe(i + 1);
      const p = cat.body.products.find((x: any) => x.id === el.item.sku);
      expect(p).toBeDefined();
      expect(el.item['@type']).toBe('Product');
      expect(el.item.offers['@type']).toBe('Offer');
      expect(el.item.offers.price).toBe((p.priceMinor / 100).toFixed(2));
      expect(el.item.offers.priceCurrency).toBe(p.currency);
      expect(el.item.offers.availability).toBe(p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock');
      const props = Object.fromEntries(el.item.additionalProperty.map((x: any) => [x.name, x.value]));
      expect(props.priceMinor).toBe(p.priceMinor);
      expect(props.dietary).toEqual(p.dietary);
    });
  });

  test('exposes only documented public fields, and each product URL resolves', async () => {
    const feed = await request(app).get('/api/feed/products');
    const allowed = ['@type', 'sku', 'name', 'description', 'category', 'keywords', 'additionalProperty', 'offers'];
    const first = feed.body.itemListElement[0].item;
    expect(Object.keys(first).sort()).toEqual([...allowed].sort());
    expect(Object.keys(first.offers).sort()).toEqual(['@type', 'availability', 'price', 'priceCurrency', 'seller', 'url']);
    const url = new URL(first.offers.url);
    expect((await request(app).get(url.pathname)).status).toBe(200);
  });

  test('is stable between requests (no per-request timestamp) so it can be cached and revalidated', async () => {
    process.env.PUBLIC_BASE_URL = 'https://cafe.example.com';
    const a = await request(app).get('/api/feed/products');
    const b = await request(app).get('/api/feed/products');
    expect(b.body).toEqual(a.body);
    expect(a.headers.etag).toBeDefined();
    const revalidated = await request(app).get('/api/feed/products').set('If-None-Match', a.headers.etag);
    expect(revalidated.status).toBe(304);
  });
});

import { createApp } from '../src/app';

const app = createApp();
const port = Number(process.env.PORT ?? 3100);
const host = `http://127.0.0.1:${port}`;

async function fetchJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${host}${path}`, {
    redirect: 'manual',
    ...init,
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return { response, payload };
}

async function run() {
  const checks = [
    {
      name: 'health endpoint',
      path: '/api/health',
      assert: (status: number, payload: unknown) => {
        return status === 200 && typeof payload === 'object' && payload !== null && 'status' in payload && (payload as any).status === 'ok';
      },
    },
    {
      name: 'catalog endpoint',
      path: '/api/catalog',
      assert: (status: number, payload: unknown) => {
        return status === 200 && typeof payload === 'object' && payload !== null && 'count' in payload && 'products' in payload;
      },
    },
    {
      name: 'orders endpoint',
      path: '/api/orders?limit=5',
      assert: (status: number, payload: unknown) => {
        return status === 200 && typeof payload === 'object' && payload !== null && 'orders' in payload && 'total' in payload;
      },
    },
    {
      name: 'orders stats endpoint',
      path: '/api/orders/stats',
      assert: (status: number, payload: unknown) => {
        return status === 200 && typeof payload === 'object' && payload !== null && 'total' in payload && 'aiAssisted' in payload;
      },
    },
    {
      name: 'dashboard redirect',
      path: '/dashboard',
      assert: (status: number, _payload: unknown, headers: Headers) => {
        return status === 302 && headers.get('location') === '/dashboard.html';
      },
    },
    {
      name: 'webhook health',
      path: '/api/webhooks/health',
      assert: (status: number, payload: unknown) => {
        return status === 200 && typeof payload === 'object' && payload !== null && 'webhookEnabled' in payload;
      },
    },
    {
      name: 'webhook route availability',
      path: '/api/webhooks/paypal',
      method: 'POST',
      body: '{}',
      assert: (status: number) => status === 401 || status === 400,
    },
  ];

  const server = app.listen(port, async () => {
    try {
      for (const check of checks) {
        const { response, payload } = await fetchJson(check.path, {
          method: check.method ?? 'GET',
          headers: check.body ? { 'content-type': 'application/json' } : undefined,
          body: check.body,
        });

        if (!check.assert(response.status, payload, response.headers)) {
          throw new Error(
            `${check.name} failed: status=${response.status}, payload=${JSON.stringify(payload)}`
          );
        }

        console.log(`PASS ${check.name} -> ${response.status}`);
      }

      console.log('Smoke checks passed.');
      server.close(() => process.exit(0));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Smoke check failed: ${message}`);
      server.close(() => process.exit(1));
    }
  });
}

run();

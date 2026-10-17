import request from 'supertest';
import { createApp } from '../../src/app';
import { OrderService } from '../../src/orders/service';
import { OrderOrigin, OrderStatus } from '../../src/orders/domain';
import { paypalClient } from '../../src/paypal/client';

jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
  },
}));

const app = createApp();
const orderService = OrderService.getInstance();

beforeEach(() => {
  orderService.reset();
  (paypalClient.createOrder as jest.Mock).mockReset();
  (paypalClient.captureOrder as jest.Mock).mockReset();
  (paypalClient.createOrder as jest.Mock).mockResolvedValue({
    id: 'MOCK_PAYPAL_ORDER_ID',
    status: 'CREATED',
    links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/mock-approve' }],
  });
  (paypalClient.captureOrder as jest.Mock).mockResolvedValue({
    id: 'MOCK_PAYPAL_ORDER_ID',
    status: 'COMPLETED',
    purchaseUnits: [{ payments: { captures: [{ id: 'MOCK_CAPTURE_ID' }] } }],
  });
});

describe('Sprint 6 dashboard and orders API', () => {
  test('GET /api/orders after reset returns empty list', async () => {
    const response = await request(app).get('/api/orders');
    expect(response.status).toBe(200);
    expect(response.body.orders).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  test('creates two orders and returns newest-first list', async () => {
    const first = orderService.create('s1', [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300 }], 'EUR', OrderOrigin.HUMAN);
    const second = orderService.create('s2', [{ productId: 'latte', name: 'Latte', quantity: 2, unitPriceMinor: 450, lineTotalMinor: 900 }], 'EUR', OrderOrigin.AI_AGENT);

    const response = await request(app).get('/api/orders');
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(response.body.orders[0].id).toBe(second.id);
    expect(response.body.orders[1].id).toBe(first.id);
  });

  test('limit validation rejects invalid values', async () => {
    await request(app).get('/api/orders').query({ limit: 'abc' }).expect(400);
    await request(app).get('/api/orders').query({ limit: 0 }).expect(400);
    await request(app).get('/api/orders').query({ limit: 101 }).expect(400);

    const response = await request(app).get('/api/orders').query({ limit: 1 });
    expect(response.status).toBe(200);
    expect(response.body.returned).toBeLessThanOrEqual(1);
  });

  test('origin and status filters reject invalid enums', async () => {
    await request(app).get('/api/orders').query({ origin: 'BOGUS' }).expect(400);
    await request(app).get('/api/orders').query({ status: 'BOGUS' }).expect(400);
  });

  test('origin filter only returns AI_AGENT orders', async () => {
    orderService.create('s1', [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300 }], 'EUR', OrderOrigin.HUMAN);
    orderService.create('s2', [{ productId: 'latte', name: 'Latte', quantity: 2, unitPriceMinor: 450, lineTotalMinor: 900 }], 'EUR', OrderOrigin.AI_AGENT);

    const response = await request(app).get('/api/orders').query({ origin: OrderOrigin.AI_AGENT });
    expect(response.status).toBe(200);
    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0].origin).toBe(OrderOrigin.AI_AGENT);
  });

  test('status filter only returns PAID orders', async () => {
    const order = orderService.create('s1', [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300 }], 'EUR', OrderOrigin.HUMAN);
    orderService.setPayPalOrderId(order.id, 'paypal-1');
    orderService.updateStatus(order.id, OrderStatus.PAYMENT_PENDING);
    orderService.updateStatus(order.id, OrderStatus.PAID);

    const response = await request(app).get('/api/orders').query({ status: OrderStatus.PAID });
    expect(response.status).toBe(200);
    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0].status).toBe(OrderStatus.PAID);
  });

  test('stats semantics use aiAssisted values', async () => {
    const humanOrder = orderService.create('s1', [{ productId: 'coffee', name: 'Coffee', quantity: 1, unitPriceMinor: 300, lineTotalMinor: 300 }], 'EUR', OrderOrigin.HUMAN);
    const aiOrder = orderService.create('s2', [{ productId: 'latte', name: 'Latte', quantity: 2, unitPriceMinor: 450, lineTotalMinor: 900 }], 'EUR', OrderOrigin.AI_AGENT);

    orderService.setPayPalOrderId(humanOrder.id, 'paypal-human');
    orderService.setPayPalOrderId(aiOrder.id, 'paypal-ai');
    orderService.updateStatus(humanOrder.id, OrderStatus.PAYMENT_PENDING);
    orderService.updateStatus(aiOrder.id, OrderStatus.PAYMENT_PENDING);
    orderService.updateStatus(humanOrder.id, OrderStatus.PAID);
    orderService.updateStatus(aiOrder.id, OrderStatus.PAID);

    const response = await request(app).get('/api/orders/stats');
    expect(response.status).toBe(200);
    expect(response.body.aiAssisted).toBe(1);
    expect(response.body.aiAssistedPercentage).toBe(50);
    expect(response.body.revenueMinor).toBe(1200);
    expect(response.body.aiAssistedRevenueMinor).toBe(900);
  });

  test('GET /dashboard.html returns html and includes required markers', async () => {
    const response = await request(app).get('/dashboard.html');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('ag-grid-community@33.0.0');
    // Dashboard logic lives in a same-origin external script (CSP: script-src
    // 'self'), NOT inline, so the HTML must not contain an inline <script> block.
    expect(response.text).toContain('<script src="/dashboard.js"></script>');
    expect(response.text).not.toMatch(/<script>(?!\s*<\/script>)/);
    expect(response.text).toContain('eventModal');
    expect(response.text).toContain('Demo-only');
  });

  test('GET /dashboard.js serves the dashboard logic as same-origin JS', async () => {
    const response = await request(app).get('/dashboard.js');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
    // The dashboard logic executes from this external file and wires AG Grid.
    expect(response.text).toContain('agGrid.createGrid');
    expect(response.text).toContain('eventModal');
    expect(response.text).toContain('/api/policy-events?limit=100');
  });

  test('GET /dashboard redirects to /dashboard.html', async () => {
    const response = await request(app).get('/dashboard').redirects(0);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/dashboard.html');
  });
});

describe('Sprint dashboard accessibility markers', () => {
  test('dashboard.html exposes an accessible modal dialog, focus styles and live regions', async () => {
    const res = await request(app).get('/dashboard.html');
    expect(res.status).toBe(200);
    const t = res.text;

    // Detail panel is a properly labelled modal dialog.
    expect(t).toContain('id="eventModal"');
    expect(t).toContain('role="dialog"');
    expect(t).toContain('aria-modal="true"');
    expect(t).toContain('aria-labelledby="sideTitle"');
    expect(t).toContain('tabindex="-1"');

    // Visible focus indicator for keyboard users.
    expect(t).toContain(':focus-visible');

    // Per-grid polite status + assertive error live regions.
    expect(t).toContain('id="ordersStatus"');
    expect(t).toContain('role="status"');
    expect(t).toContain('aria-live="polite"');
    expect(t).toContain('id="ordersError"');
    expect(t).toContain('role="alert"');

    // Dark-mode badge colours overridden so they meet contrast on the dark panel.
    expect(t).toContain('body.dark .badge-allow');

    // Light-theme success/warning darkened to pass WCAG AA for the small badge text.
    expect(t).toContain('--success: #15803d');
    expect(t).toContain('--warning: #b45309');
  });

  test('dashboard.js wires keyboard + screen-reader accessibility into AG Grid', async () => {
    const js = await request(app).get('/dashboard.js');
    expect(js.status).toBe(200);
    const t = js.text;

    // Keyboard activation of a focused cell opens the detail dialog.
    expect(t).toContain('onCellKeyDown');
    // Descriptive screen-reader labels for the semantic badge columns.
    expect(t).toContain('getCellAria');
    expect(t).toContain('originAria');
    expect(t).toContain('decisionAria');
    // Loading / empty / error states are handled and announced.
    expect(t).toContain('showLoadingOverlay');
    expect(t).toContain('showNoRowsOverlay');
    expect(t).toContain('hideOverlay');
    expect(t).toContain('setGridError');
    // Focus is moved into the dialog and restored on close (Escape).
    expect(t).toContain('requestAnimationFrame');
    expect(t).toContain('trapPanelKeys');
    expect(t).toContain("e.key === 'Escape'");
    // AG Grid's documented screen-reader DOM-order options are enabled.
    expect(t).toContain('ensureDomOrder: true');
    expect(t).toContain('suppressGroupRowsSticky: true');
    // No new grid library was introduced — AG Grid remains the only one used.
    expect(t).toContain('agGrid.createGrid');
  });

  test('grid containers carry no ARIA role (AG Grid owns grid/treegrid) and are named via heading', async () => {
    const html = (await request(app).get('/dashboard.html')).text;
    const js = (await request(app).get('/dashboard.js')).text;

    // A hand-written role="grid" would nest inside AG Grid's own root
    // (role="grid", or role="treegrid" while rows are grouped).
    expect(html).not.toMatch(/role="(tree)?grid"/);
    expect(html).toMatch(/<div id="ordersGrid"><\/div>/);
    expect(html).toMatch(/<div id="eventsGrid"><\/div>/);

    // The accessible name comes from the visible headings, attached in JS to AG Grid's real root.
    expect(html).toContain('id="ordersHeading"');
    expect(html).toContain('id="eventsHeading"');
    expect(js).toContain("labelGridRoot('ordersGrid', 'ordersHeading')");
    expect(js).toContain("labelGridRoot('eventsGrid', 'eventsHeading')");
    expect(js).toContain("setAttribute('aria-labelledby', headingId)");
  });
});

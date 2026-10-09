import request from 'supertest';
import { createApp } from '../../src/app';
import { OrderService } from '../../src/orders/service';
import { OrderStatus, OrderOrigin } from '../../src/orders/domain';

const app = createApp();

// Mock the PayPal client so no real network call is made during integration tests.
jest.mock('../../src/paypal/client', () => ({
  paypalClient: {
    verifyWebhookSignature: jest.fn().mockResolvedValue({
      verification_status: 'SUCCESS',
    }),
  },
}));

describe('Webhooks API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/webhooks/paypal rejects missing headers', async () => {
    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .send({
        id: 'WH-123',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {},
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Missing required headers');
  });

  test('POST /api/webhooks/paypal rejects invalid signature', async () => {
    const { paypalClient } = require('../../src/paypal/client');
    (paypalClient.verifyWebhookSignature as jest.Mock).mockResolvedValueOnce({
      verification_status: 'FAILURE',
    });

    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-transmission-id', 'test-id')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-transmission-sig', 'test-sig')
      .set('paypal-cert-url', 'https://example.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({
        id: 'WH-TEST-001',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          supplementary_data: {
            related_ids: {
              order_id: 'PAYPAL-ORDER-123',
            },
          },
        },
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Invalid signature');
  });

  test('POST /api/webhooks/paypal processes CAPTURE.COMPLETED', async () => {
    const orderService = OrderService.getInstance();
    const order = orderService.create(
      'test-session',
      [
        {
          productId: 'coffee',
          name: 'Coffee',
          quantity: 1,
          unitPriceMinor: 300,
          lineTotalMinor: 300,
        },
      ],
      'EUR',
      OrderOrigin.HUMAN
    );

    orderService.setPayPalOrderId(order.id, 'PAYPAL-ORDER-TEST-001');

    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-transmission-id', 'test-id-1')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-transmission-sig', 'test-sig')
      .set('paypal-cert-url', 'https://example.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({
        id: 'WH-TEST-002',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          supplementary_data: {
            related_ids: {
              order_id: 'PAYPAL-ORDER-TEST-001',
            },
          },
        },
      });

    expect(response.status).toBe(200);

    const updatedOrder = orderService.getById(order.id);
    expect(updatedOrder?.status).toBe(OrderStatus.PAID);
  });

  test('POST /api/webhooks/paypal processes CAPTURE.DENIED', async () => {
    const orderService = OrderService.getInstance();
    const order = orderService.create(
      'test-session',
      [
        {
          productId: 'coffee',
          name: 'Coffee',
          quantity: 1,
          unitPriceMinor: 300,
          lineTotalMinor: 300,
        },
      ],
      'EUR',
      OrderOrigin.HUMAN
    );

    orderService.setPayPalOrderId(order.id, 'PAYPAL-ORDER-TEST-002');

    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'test-id-2')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-transmission-sig', 'test-sig')
      .set('paypal-cert-url', 'https://example.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({
        id: 'WH-TEST-003',
        event_type: 'PAYMENT.CAPTURE.DENIED',
        resource: {
          supplementary_data: {
            related_ids: {
              order_id: 'PAYPAL-ORDER-TEST-002',
            },
          },
        },
      });

    expect(response.status).toBe(200);

    const updatedOrder = orderService.getById(order.id);
    expect(updatedOrder?.status).toBe(OrderStatus.PAYMENT_FAILED);
  });

  test('POST /api/webhooks/paypal handles ORDER.APPROVED (no state change)', async () => {
    const orderService = OrderService.getInstance();
    const order = orderService.create(
      'test-session',
      [
        {
          productId: 'coffee',
          name: 'Coffee',
          quantity: 1,
          unitPriceMinor: 300,
          lineTotalMinor: 300,
        },
      ],
      'EUR',
      OrderOrigin.HUMAN
    );

    orderService.setPayPalOrderId(order.id, 'PAYPAL-ORDER-TEST-003');

    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'test-id-3')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-transmission-sig', 'test-sig')
      .set('paypal-cert-url', 'https://example.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({
        id: 'WH-TEST-004',
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: {
          id: 'PAYPAL-ORDER-TEST-003',
        },
      });

    expect(response.status).toBe(200);

    // Status should remain PAYMENT_PENDING (no change on approval).
    const updatedOrder = orderService.getById(order.id);
    expect(updatedOrder?.status).toBe(OrderStatus.PAYMENT_PENDING);
  });

  test('POST /api/webhooks/paypal rejects duplicate events', async () => {
    const eventId = 'WH-DUPLICATE-TEST';

    // First request.
    await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'test-id-4')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-transmission-sig', 'test-sig')
      .set('paypal-cert-url', 'https://example.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({
        id: eventId,
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: { id: 'PAYPAL-ORDER-999' },
      });

    // Duplicate request.
    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'test-id-5')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-transmission-sig', 'test-sig')
      .set('paypal-cert-url', 'https://example.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({
        id: eventId,
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: { id: 'PAYPAL-ORDER-999' },
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('already processed');
  });

  test('POST /api/webhooks/paypal handles unknown PayPal order gracefully', async () => {
    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'test-id-6')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-transmission-sig', 'test-sig')
      .set('paypal-cert-url', 'https://example.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({
        id: 'WH-TEST-005',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          supplementary_data: {
            related_ids: {
              order_id: 'UNKNOWN-PAYPAL-ORDER',
            },
          },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('order not found');
  });

  test('POST /api/webhooks/paypal handles idempotent PAID → PAID', async () => {
    const orderService = OrderService.getInstance();
    const order = orderService.create(
      'test-session',
      [
        {
          productId: 'coffee',
          name: 'Coffee',
          quantity: 1,
          unitPriceMinor: 300,
          lineTotalMinor: 300,
        },
      ],
      'EUR',
      OrderOrigin.HUMAN
    );

    orderService.setPayPalOrderId(order.id, 'PAYPAL-ORDER-TEST-004');
    orderService.updateStatus(order.id, OrderStatus.PAID); // Already PAID.

    const response = await request(app)
      .post('/api/webhooks/paypal')
      .set('paypal-transmission-id', 'test-id-7')
      .set('paypal-transmission-time', new Date().toISOString())
      .set('paypal-transmission-sig', 'test-sig')
      .set('paypal-cert-url', 'https://example.com/cert')
      .set('paypal-auth-algo', 'SHA256withRSA')
      .send({
        id: 'WH-TEST-006',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          supplementary_data: {
            related_ids: {
              order_id: 'PAYPAL-ORDER-TEST-004',
            },
          },
        },
      });

    expect(response.status).toBe(200);

    // Order should still be PAID (no error, no double transition).
    const updatedOrder = orderService.getById(order.id);
    expect(updatedOrder?.status).toBe(OrderStatus.PAID);
  });

  test('GET /api/webhooks/health returns status', async () => {
    const response = await request(app).get('/api/webhooks/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});

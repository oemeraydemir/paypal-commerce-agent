import { Router, Request, Response } from 'express';
import { webhookService, WebhookEvent, WebhookHeaders } from '../paypal/webhook-service';
import { OrderService } from '../orders/service';
import { OrderStatus } from '../orders/domain';
import { rawBodyMiddleware } from '../middleware/raw-body';
import { env } from '../config/environment';
import { markOrderPaid, markOrderPaymentFailed } from '../orders/payment-lifecycle';

const router = Router();
const orderService = OrderService.getInstance();

// PayPal webhook endpoint — public, NO auth (PayPal signs every request).
// IMPORTANT: rawBodyMiddleware MUST run before express.json() (see app.ts) so
// the exact request bytes are preserved for signature verification.
router.post('/webhooks/paypal', rawBodyMiddleware, async (req: Request, res: Response) => {
  try {
    const headers: WebhookHeaders = {
      'paypal-transmission-id': req.headers['paypal-transmission-id'] as string,
      'paypal-transmission-time': req.headers['paypal-transmission-time'] as string,
      'paypal-transmission-sig': req.headers['paypal-transmission-sig'] as string,
      'paypal-cert-url': req.headers['paypal-cert-url'] as string,
      'paypal-auth-algo': req.headers['paypal-auth-algo'] as string,
    };

    // Validate the five required PayPal-Signature headers.
    if (
      !headers['paypal-transmission-id'] ||
      !headers['paypal-transmission-time'] ||
      !headers['paypal-transmission-sig'] ||
      !headers['paypal-cert-url'] ||
      !headers['paypal-auth-algo']
    ) {
      console.error('Missing required PayPal webhook headers');
      return res.status(401).json({ error: 'Missing required headers' });
    }

    // Raw body must have been preserved by the middleware.
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      console.error('Raw body not preserved');
      return res.status(400).json({ error: 'Raw body unavailable' });
    }

    const event: WebhookEvent = req.body;

    // 1) Verify signature via PayPal's API (NOT HMAC).
    const isValid = await webhookService.verifySignature(headers, rawBody, event);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 2) Idempotency — a retried event we already processed is a no-op.
    if (webhookService.isDuplicate(event.id)) {
      console.log(`Duplicate webhook event: ${event.id}`);
      return res.status(200).json({ message: 'Event already processed' });
    }

    // 3) Correlate to an internal order via PayPal Order ID.
    const paypalOrderId = webhookService.extractPayPalOrderId(event);
    if (!paypalOrderId) {
      console.warn(`No PayPal Order ID in event ${event.id}`);
      // Valid event, just not relevant to an order — still mark processed.
      webhookService.markProcessed(event.id);
      return res.status(200).json({ message: 'Event processed (no order ID)' });
    }

    const order = orderService.getByPayPalOrderId(paypalOrderId);
    if (!order) {
      if (
        event.event_type === 'PAYMENT.CAPTURE.COMPLETED' ||
        event.event_type === 'PAYMENT.CAPTURE.DENIED'
      ) {
        // A payment outcome we cannot attach to any order (typically: the
        // in-memory state was lost on restart). The event is acknowledged so
        // PayPal stops retrying, but the money movement is NOT reflected in
        // this app. Make it impossible to miss in the logs.
        console.error(
          `UNRECONCILED_PAYMENT_EVENT type=${event.event_type} event=${event.id} ` +
            `paypalOrder=${paypalOrderId} capture=${event.resource?.id ?? 'n/a'} ` +
            `amount=${event.resource?.amount?.value ?? 'n/a'} ${event.resource?.amount?.currency_code ?? ''}`
        );
      } else {
        console.warn(`No internal order found for PayPal Order ID: ${paypalOrderId}`);
      }
      // Valid event, but we have no matching order — still mark processed.
      webhookService.markProcessed(event.id);
      return res.status(200).json({ message: 'Event processed (order not found)' });
    }

    // 4) Reconcile order state based on event type.
    const eventType = event.event_type;

    try {
      if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        // Order -> PAID and reservation -> confirmed spend, both idempotent
        // (a duplicate webhook or a capture-response race never double counts).
        markOrderPaid(order, event.resource?.id);
        console.log(
          `Order ${order.id} marked PAID via webhook (PayPal Order: ${paypalOrderId})`
        );
      } else if (eventType === 'PAYMENT.CAPTURE.DENIED') {
        // Definitive failure: fail the order (if still pending) and release the
        // reservation. Never un-spends an already PAID order.
        markOrderPaymentFailed(order);
        console.log(`Order ${order.id} marked PAYMENT_FAILED via webhook`);
      } else if (eventType === 'CHECKOUT.ORDER.APPROVED') {
        // Buyer approved the order but has not paid yet — no state change.
        console.log(`Order ${order.id} approved by buyer (no state change)`);
      } else {
        console.log(`Unhandled webhook event: ${eventType}`);
      }

      // 5) Only mark processed AFTER successful reconciliation.
      webhookService.markProcessed(event.id);
      res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (err: any) {
      console.error(`Reconciliation failed for event ${event.id}:`, err?.message ?? err);
      // Do NOT mark processed — PayPal will retry the event.
      res.status(500).json({ error: 'Reconciliation failed' });
    }
  } catch (err: any) {
    console.error('Webhook error:', err?.message ?? err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook health check.
router.get('/webhooks/health', (_req, res) => {
  res.json({
    status: 'ok',
    webhookEnabled: !!env.paypal?.PAYPAL_WEBHOOK_ID,
  });
});

export default router;

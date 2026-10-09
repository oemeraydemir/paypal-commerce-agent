import { env } from '../config/environment';
import { paypalClient } from './client';

export interface WebhookEvent {
  id: string;
  event_type: string;
  resource: any;
  create_time: string;
}

export interface WebhookHeaders {
  'paypal-transmission-id': string;
  'paypal-transmission-time': string;
  'paypal-transmission-sig': string;
  'paypal-cert-url': string;
  'paypal-auth-algo': string;
}

export class WebhookService {
  // In-memory idempotency set (S5 known limitation: not persisted across
  // restarts — see EXIT_REPORT_S5.md). Bounded to avoid unbounded growth.
  private processedEvents = new Set<string>();

  // Verify the webhook signature using PayPal's verify-webhook-signature API.
  // We deliberately do NOT use HMAC — PayPal validates the signature against
  // THEIR certificate, so there is no merchant webhook secret to compare.
  async verifySignature(
    headers: WebhookHeaders,
    rawBody: string,
    webhookEvent: WebhookEvent
  ): Promise<boolean> {
    if (!env.paypal || !env.paypal.PAYPAL_WEBHOOK_ID) {
      console.warn('PayPal webhook not configured (missing PAYPAL_WEBHOOK_ID)');
      return false;
    }

    try {
      const verificationPayload = {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: env.paypal.PAYPAL_WEBHOOK_ID,
        // PayPal re-validates the exact event we received.
        webhook_event: webhookEvent,
      };

      const response = await paypalClient.verifyWebhookSignature(verificationPayload);

      // PayPal returns verification_status: "SUCCESS" or "FAILURE".
      return response.verification_status === 'SUCCESS';
    } catch (err: any) {
      console.error('Webhook verification failed:', err?.message ?? err);
      return false;
    }
  }

  // Idempotency: has this event already been processed successfully?
  isDuplicate(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  // Mark an event processed — ONLY called after successful reconciliation, so a
  // failing reconciliation leaves the event unmarked and PayPal retries it.
  markProcessed(eventId: string): void {
    this.processedEvents.add(eventId);

    // Keep memory bounded: retain only the most recent 500 ids.
    if (this.processedEvents.size > 1000) {
      const events = Array.from(this.processedEvents);
      this.processedEvents = new Set(events.slice(-500));
    }
  }

  // Extract the PayPal Order ID used to correlate with an internal order.
  // PAYMENT.CAPTURE.* events carry it in supplementary_data.related_ids.order_id;
  // CHECKOUT.ORDER.APPROVED carries it directly in resource.id.
  extractPayPalOrderId(event: WebhookEvent): string | null {
    const resource = event.resource;

    if (
      event.event_type === 'PAYMENT.CAPTURE.COMPLETED' ||
      event.event_type === 'PAYMENT.CAPTURE.DENIED'
    ) {
      return resource?.supplementary_data?.related_ids?.order_id ?? null;
    }

    if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      return resource?.id ?? null;
    }

    return null;
  }
}

export const webhookService = new WebhookService();

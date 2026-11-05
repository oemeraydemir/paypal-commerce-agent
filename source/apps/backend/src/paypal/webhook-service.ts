import { env } from '../config/environment';
import { paypalClient } from './client';
import { getRepos, writeQueue } from '../persistence/registry';
import type { WebhookReviewRecord } from '../persistence/types';

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
  // Idempotency set. With PostgreSQL attached it is a write-through cache of the durable
  // webhook_events table (hydrated at boot), so a redelivered event is still a no-op after a restart.
  // Without a database it is in-memory only (documented demo limitation). Bounded to avoid growth.
  private processedEvents = new Set<string>();
  // Ids whose durable write failed; retried by the persistence sweeper.
  private dirty = new Set<string>();
  private static readonly CACHE_MAX = 10_000;
  private static readonly CACHE_KEEP = 5_000;

  /** Loads the most recent processed event ids from the database. Returns how many were loaded. */
  async hydrate(): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    const ids = await repos.webhookEvents.loadRecentIds(WebhookService.CACHE_KEEP);
    for (const id of ids) this.processedEvents.add(id);
    return ids.length;
  }

  /** Re-attempts durable writes that failed earlier. */
  async retryDirty(): Promise<number> {
    const repos = getRepos();
    if (!repos || this.dirty.size === 0) return 0;
    let done = 0;
    for (const id of [...this.dirty]) {
      try {
        await repos.webhookEvents.save(id);
        this.dirty.delete(id);
        done++;
      } catch {
        /* stays dirty */
      }
    }
    return done;
  }

  /** Test isolation only. */
  reset(): void {
    this.processedEvents.clear();
    this.dirty.clear();
    this.reviews.clear();
  }

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
  // Resolves once the id is durable (or the write failed and was queued for retry): the in-memory
  // guard is set FIRST and synchronously, so a concurrent redelivery is already a duplicate.
  async markProcessed(eventId: string): Promise<void> {
    this.processedEvents.add(eventId);

    // Keep memory bounded: retain only the most recent ids (the database keeps the rest).
    if (this.processedEvents.size > WebhookService.CACHE_MAX) {
      const events = Array.from(this.processedEvents);
      this.processedEvents = new Set(events.slice(-WebhookService.CACHE_KEEP));
    }

    const repos = getRepos();
    if (!repos) return;
    try {
      await writeQueue.enqueue(`webhook_event:${eventId}`, () => repos.webhookEvents.save(eventId), { retries: 1 });
      this.dirty.delete(eventId);
    } catch (err: any) {
      this.dirty.add(eventId);
      console.error(`WEBHOOK_EVENT_PERSIST_FAILED id=${eventId} error=${err?.message ?? err}`);
    }
  }

  // Signed events that could not be applied (amount / currency mismatch, incomplete capture evidence).
  // Kept in memory for the no-database demo mode and written durably when PostgreSQL is attached.
  private readonly reviews = new Map<string, WebhookReviewRecord>();

  /**
   * Records a held event and only then marks it processed. Unlike markProcessed() this is STRICT: when the
   * durable write fails the error propagates, so the route answers non-2xx and PayPal redelivers the event
   * (a 2xx would stop PayPal's retries and the hold would exist only in a log line).
   */
  async holdForReview(review: WebhookReviewRecord): Promise<void> {
    const repos = getRepos();
    if (repos) await repos.webhookReviews.record(review);
    this.reviews.set(review.eventId, review);
    await this.markProcessed(review.eventId);
  }

  /** Held events for an order (memory view; the durable copy is in webhook_reviews). */
  reviewsForOrder(orderId: string): WebhookReviewRecord[] {
    return [...this.reviews.values()].filter((r) => r.orderId === orderId);
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

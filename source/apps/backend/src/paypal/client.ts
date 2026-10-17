import {
  Client,
  Environment,
  LogLevel,
  OrdersController,
  PaymentsController,
} from '@paypal/paypal-server-sdk';
import * as https from 'https';
import { env } from '../config/environment';

export interface PayPalClient {
  // FIX #1: PayPal's own idempotency via the PayPal-Request-Id header.
  createOrder(body: any, paypalRequestId: string): Promise<any>;
  captureOrder(orderId: string, paypalRequestId: string): Promise<any>;
  // Read-only lookup of the real PayPal order state (used for reconciliation).
  getOrder(orderId: string): Promise<any>;
  // Refund (full or partial) of a captured payment via the Payments API. Only ever called
  // from the merchant-approval path in src/refunds — never from an AI tool.
  refundCapture(
    captureId: string,
    body: { amount?: { currencyCode: string; value: string }; noteToPayer?: string; invoiceId?: string },
    paypalRequestId: string
  ): Promise<any>;
  // S5: verify a webhook signature via PayPal's verify-webhook-signature API.
  // (NOT HMAC — PayPal validates against their own certificate.)
  verifyWebhookSignature(payload: any): Promise<any>;
  // S5: register a webhook programmatically (dev tooling / scripts).
  createWebhook(params: { url: string; event_types: { name: string }[] }): Promise<any>;
}

class PayPalClientImpl implements PayPalClient {
  private client?: Client;
  private ordersController?: OrdersController;
  private paymentsController?: PaymentsController;

  // FIX (engineering): the SDK Client is constructed lazily. Building it at
  // module load would read env.paypal!.* and crash the whole app when PayPal is
  // disabled (S1 mode). The routes already return 503 before calling us.
  private ensure(): OrdersController {
    if (!env.paypal) {
      throw new Error('PayPal is not configured (env.paypal is null)');
    }
    if (!this.client) {
      this.client = new Client({
        clientCredentialsAuthCredentials: {
          oAuthClientId: env.paypal.PAYPAL_CLIENT_ID,
          oAuthClientSecret: env.paypal.PAYPAL_CLIENT_SECRET,
        },
        environment: Environment.Sandbox,
        logging: {
          logLevel: LogLevel.Info,
          logRequest: { logBody: false },
          logResponse: { logHeaders: false, logBody: false },
        },
      });
      this.ordersController = new OrdersController(this.client);
      this.paymentsController = new PaymentsController(this.client);
    }
    return this.ordersController!;
  }

  async createOrder(body: any, paypalRequestId: string): Promise<any> {
    const controller = this.ensure();
    const request = {
      body,
      paypalRequestId, // FIX #1: PayPal's idempotency header
    };
    const response = await controller.createOrder(request);
    return response.result;
  }

  async captureOrder(orderId: string, paypalRequestId: string): Promise<any> {
    const controller = this.ensure();
    const request = {
      id: orderId,
      paypalRequestId, // FIX #1: PayPal's idempotency header
    };
    const response = await controller.captureOrder(request);
    return response.result;
  }

  async getOrder(orderId: string): Promise<any> {
    const controller = this.ensure();
    const response = await controller.getOrder({ id: orderId });
    return response.result;
  }

  async refundCapture(
    captureId: string,
    body: { amount?: { currencyCode: string; value: string }; noteToPayer?: string; invoiceId?: string },
    paypalRequestId: string
  ): Promise<any> {
    this.ensure();
    // PayPal-Request-Id makes a retried refund idempotent: the same id never refunds twice.
    const response = await this.paymentsController!.refundCapturedPayment({
      captureId,
      paypalRequestId,
      prefer: 'return=representation',
      body,
    });
    return response.result;
  }

  // --------------------------------------------------------------------------
  // S5: webhook verification + registration.
  //
  // NOTE: the installed @paypal/paypal-server-sdk (v2.5.0) ships an
  // OrdersController but NO NotificationsController, so these two calls hit the
  // PayPal REST API directly via https. This is faithful to the sprint spec
  // ("POST /v1/notifications/verify-webhook-signature") and still uses PayPal's
  // certificate validation — NOT a merchant HMAC secret.
  // --------------------------------------------------------------------------

  private baseUrl(): string {
    return 'https://api.sandbox.paypal.com';
  }

  // Minimal JSON/forms POST helper over https.
  private httpsPost(
    url: string,
    bodyStr: string,
    headers: Record<string, string>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => {
            raw += chunk;
          });
          res.on('end', () => {
            try {
              resolve(raw ? JSON.parse(raw) : {});
            } catch {
              resolve({});
            }
          });
        }
      );
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  private async getAccessToken(): Promise<string> {
    if (!env.paypal) {
      throw new Error('PayPal is not configured (env.paypal is null)');
    }
    const res: any = await this.httpsPost(
      `${this.baseUrl()}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${env.paypal.PAYPAL_CLIENT_ID}:${env.paypal.PAYPAL_CLIENT_SECRET}`
        ).toString('base64')}`,
      }
    );
    if (!res.access_token) {
      throw new Error('Failed to obtain PayPal access token');
    }
    return res.access_token;
  }

  async verifyWebhookSignature(payload: any): Promise<any> {
    const token = await this.getAccessToken();
    return this.httpsPost(
      `${this.baseUrl()}/v1/notifications/verify-webhook-signature`,
      JSON.stringify(payload),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    );
  }

  async createWebhook(params: {
    url: string;
    event_types: { name: string }[];
  }): Promise<any> {
    const token = await this.getAccessToken();
    return this.httpsPost(
      `${this.baseUrl()}/v1/notifications/webhooks`,
      JSON.stringify({ url: params.url, event_types: params.event_types }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    );
  }
}

export const paypalClient: PayPalClient = new PayPalClientImpl();

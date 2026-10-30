import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import path from 'path';
import { env } from './config/environment';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import healthRoutes from './routes/health';
import catalogRoutes from './routes/catalog';
import orderRoutes from './routes/orders';
import policyEventsRoutes from './routes/policy-events';
import policyPreviewRoutes from './routes/policy-preview';
import policyRoutes from './routes/policy';
import opsRoutes from './routes/ops';
import refundRoutes from './routes/refunds';
import aiRoutes from './routes/ai';
import webhookRoutes from './routes/webhooks';
import dashboardRoutes from './routes/dashboard';
import checkoutRoutes from './routes/checkout';
import sessionRoutes from './routes/sessions';
import mcpRoutes from './routes/mcp';
import mandateRoutes, { wellKnownMandateKeys } from './routes/mandates';
import evidenceRoutes from './routes/evidence';
import discoveryRoutes from './routes/discovery';
import billsRoutes from './routes/bills';
import pickupRoutes from './routes/pickup';
import { currentBusiness } from './config/business-config';
import { rejectClientTenantOverride } from './config/tenant';
import fs from 'fs';

// CRITICAL FIX #1: createApp() builds the Express application with NO listen().
// server.ts imports this and calls listen(). This separation prevents test
// processes from binding a port / hanging.
export function createApp() {
  const app = express();

  // Behind a reverse proxy (Render) req.ip must be the real client address, or
  // per-IP limits would throttle everybody together. 0 = trust nothing.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // Generate a per-response CSP nonce. The dynamically rendered PayPal
  // checkout return/cancel pages inline a tiny redirect script that carries
  // this nonce, so they can run without resorting to 'unsafe-inline'. The
  // static dashboard loads its logic from same-origin /dashboard.js instead.
  // Exposed to route handlers via res.locals.cspNonce.
  app.use((_req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Narrow script-src: same-origin (covers /dashboard.js and any
          // same-origin bundle), the AG Grid CDN origin the dashboard requires,
          // and this response's nonce for the checkout return/cancel inline
          // redirect. No 'unsafe-inline', so attacker-injected script text
          // still cannot run. All other directives keep Helmet's secure
          // defaults (object-src 'none', etc.).
          'script-src': [
            "'self'",
            'https://cdn.jsdelivr.net',
            (_req: any, res: any) => `'nonce-${res.locals.cspNonce}'`,
          ],
        },
      },
    })
  );
  app.use(
    cors({
      // CRITICAL FIX #6 (scope): environment-based single origin, no regex/array. A foreign Origin gets NO
      // Access-Control-Allow-Origin header at all (instead of a static, never-matching value).
      origin: (origin, callback) => callback(null, !origin || origin === env.CORS_ORIGIN ? env.CORS_ORIGIN : false),
      credentials: true,
    })
  );
  app.use(requestLogger);

  // CRITICAL (S5): mount the webhook route BEFORE express.json() so the raw
  // body middleware can capture the exact bytes PayPal sent for signature
  // verification. Other /api routes still get JSON parsing below.
  app.use('/api', webhookRoutes);

  // JSON body size limit (CRITICAL FIX #8)
  app.use(express.json({ limit: '100kb' }));
  // Tenant boundary: the business is a server-side fact. A request that carries its own
  // businessId / tenant_id / merchantId is refused instead of silently ignored, so no future
  // route can start trusting a client-chosen tenant. Mounted after JSON parsing and after the
  // webhook route above (which terminates before this point and keeps its raw body).
  app.use(rejectClientTenantOverride);
  // The storefront shell carries the merchant's name, so a custom BUSINESS_PROFILE_PATH rebrands the
  // page title and heading instead of always saying "AI Café". Name is HTML-escaped.
  const escapeHtml = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const publicDir = path.join(__dirname, '../public');
  const serveBrandedIndex = (_req: any, res: any, next: any) => {
    fs.readFile(path.join(publicDir, 'index.html'), 'utf8', (err, html) => {
      if (err) return next();
      // Never cache the storefront shell: a stale cached index.html would leave
      // browsers running an old bundle (missing onboarding/Coco/i18n) even after
      // the server is updated. Static assets get fresh ETags on change.
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(html.split('AI Café').join(escapeHtml(currentBusiness.name)));
    });
  };
  app.use('/', discoveryRoutes);
  app.get(['/', '/index.html'], serveBrandedIndex);
  app.use(express.static(publicDir));

  app.use('/', dashboardRoutes);
  app.use('/api', checkoutRoutes);
  app.use('/api', sessionRoutes);
  app.use('/api', healthRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', orderRoutes);
  app.use('/api', policyEventsRoutes);
  app.use('/api', policyPreviewRoutes);
  app.use('/api', policyRoutes);
  app.use('/api', opsRoutes);
  app.use('/api', refundRoutes);
  app.use('/api', aiRoutes);
  app.use('/api', mcpRoutes);
  app.use('/api', mandateRoutes);
  app.use('/api', evidenceRoutes);
  app.use('/api', billsRoutes);
  app.use('/api', pickupRoutes);
  app.use('/', wellKnownMandateKeys);

  app.use(errorHandler);

  return app;
}

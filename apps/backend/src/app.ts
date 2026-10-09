import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/environment';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import healthRoutes from './routes/health';
import catalogRoutes from './routes/catalog';
import orderRoutes from './routes/orders';
import policyEventsRoutes from './routes/policy-events';
import aiRoutes from './routes/ai';
import webhookRoutes from './routes/webhooks';
import dashboardRoutes from './routes/dashboard';
import checkoutRoutes from './routes/checkout';

// CRITICAL FIX #1: createApp() builds the Express application with NO listen().
// server.ts imports this and calls listen(). This separation prevents test
// processes from binding a port / hanging.
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN, // CRITICAL FIX #6 (scope): environment-based single origin, no regex/array
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
  app.use(express.static(path.join(__dirname, '../public')));

  app.use('/', dashboardRoutes);
  app.use('/api', checkoutRoutes);
  app.use('/api', healthRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', orderRoutes);
  app.use('/api', policyEventsRoutes);
  app.use('/api', aiRoutes);

  app.use(errorHandler);

  return app;
}

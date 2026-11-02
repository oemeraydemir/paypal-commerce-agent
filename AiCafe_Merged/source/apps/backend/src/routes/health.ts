import { Router, Request, Response } from 'express';
import { env } from '../config/environment';
import { isPersistent } from '../persistence/registry';
import { mandateKeyStatus } from '../mandate/mandate-service';
import { automationStats } from '../automation/emitter';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  // A configured-but-unusable mandate key is reported as 503 with the reason, never as a 500 crash.
  const mandates = mandateKeyStatus();
  res.status(mandates.ok ? 200 : 503).json({
    status: mandates.ok ? 'ok' : 'misconfigured',
    timestamp: new Date().toISOString(),
    service: 'paypal-commerce-agent-backend',
    version: '1.0.0',
    // Populated by Render at runtime with the deployed commit SHA. It is not
    // part of Render's official "default" env var list (which warns unlisted
    // RENDER_* vars are internal and may change), so we expose it defensively
    // and fall back to 'unknown' when absent (local/test) rather than assuming
    // it is always set. Never hardcoded; never exposes credentials.
    buildCommit: process.env.RENDER_GIT_COMMIT || 'unknown',
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    paypal: {
      enabled: env.isPayPalEnabled(),
      environment: env.paypal?.PAYPAL_ENV ?? 'sandbox',
    },
    // 'postgres' = orders/reservations/idempotency survive restarts; 'memory' = they do not.
    storage: { mode: isPersistent() ? 'postgres' : 'memory', durable: isPersistent() },
    // Agentic-commerce add-ons: signed Cart Mandates and optional outbound automation events.
    mandates: mandates.ok ? { keyPersistence: mandates.keyPersistence } : { keyPersistence: mandates.keyPersistence, error: mandates.error },
    automation: (({ enabled, configured, configError, signed }) => ({ enabled, configured, signed, ...(configError ? { configError } : {}) }))(automationStats()),
    ai: {
      enabled: env.isAIEnabled(),
      // Provider NAMES only (never keys or base URLs). Order = AI_PROVIDER_ORDER.
      providers: env.ai ? env.ai.providers.map((provider) => provider.id) : [],
    },
  });
});

export default router;

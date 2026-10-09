import { Router, Request, Response } from 'express';
import { env } from '../config/environment';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'paypal-commerce-agent-backend',
    version: '1.0.0',
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    paypal: {
      enabled: env.isPayPalEnabled(),
      environment: env.paypal?.PAYPAL_ENV ?? 'sandbox',
    },
    ai: {
      enabled: env.isAIEnabled(),
    },
  });
});

export default router;

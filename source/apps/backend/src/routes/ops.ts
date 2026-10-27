import { Router } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { AppError } from '../middleware/error-handler';
import { SlidingWindowLimiter } from '../middleware/rate-limit';
import { getOpsConfig } from '../ops/config';
import { getOpsRuntime, redactSecrets, runOpsCopilot } from '../ops/ops-agent';
import { formatError } from '../utils/error';
import { INTERNAL_TOOL_NAMES, READ_ONLY_PAYPAL_TOOLS } from '../ops/ops-tools';

// Merchant-facing, READ-ONLY "Ops Copilot": PayPal Agent Toolkit (read permissions only) plus the
// AI Café policy audit trail. Disabled unless OPS_COPILOT_ENABLED=true AND OPS_COPILOT_KEY is set.
const router = Router();

let limiter: SlidingWindowLimiter | null = null;
let limiterLimit = 0;

function getLimiter(limit: number): SlidingWindowLimiter {
  if (!limiter || limiterLimit !== limit) {
    limiter = new SlidingWindowLimiter(limit, 60_000);
    limiterLimit = limit;
  }
  return limiter;
}

export function resetOpsRouteState(): void {
  limiter?.reset();
  limiter = null;
  limiterLimit = 0;
}

function keyMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

router.get('/ops/status', (_req, res) => {
  const cfg = getOpsConfig();
  res.json({
    enabled: cfg.enabled,
    requiresKey: true,
    readOnly: true,
    ...(cfg.enabled ? {} : { reason: cfg.reason }),
    paypalTools: READ_ONLY_PAYPAL_TOOLS,
    internalTools: INTERNAL_TOOL_NAMES,
  });
});

router.post('/ops/ask', async (req, res, next) => {
  try {
    const cfg = getOpsConfig();
    if (!cfg.enabled || !cfg.key) {
      throw new AppError(503, cfg.reason ?? 'Ops Copilot is disabled on this server.');
    }

    // Counted before authentication so key guessing is throttled too.
    const verdict = getLimiter(cfg.perIpPerMin).hit(req.ip ?? 'unknown');
    if (!verdict.allowed) {
      res.setHeader('Retry-After', String(verdict.retryAfter));
      throw new AppError(429, 'Too many Ops Copilot requests; try again shortly.');
    }

    if (!keyMatches(req.get('x-ops-key'), cfg.key)) {
      throw new AppError(401, 'A valid X-Ops-Key header is required.');
    }

    const question = req.body?.question;
    if (typeof question !== 'string' || question.trim().length < 3 || question.length > 500) {
      throw new AppError(400, 'question must be a string of 3 to 500 characters');
    }

    let result;
    try {
      result = await runOpsCopilot(question.trim(), await getOpsRuntime());
    } catch (err) {
      // Upstream SDK errors can echo the API key ("Incorrect API key provided: sk-...").
      console.error(`[ops] upstream failure: ${redactSecrets(formatError(err))}`);
      // The AI layer being exhausted is not a bad gateway from the merchant's
      // point of view: answer 503 AI_UNAVAILABLE, exactly like the storefront
      // chat route, so a quota outage is reported as a temporary capacity
      // problem instead of an upstream fault. Everything else stays a 502.
      const code = (err as any)?.details?.code;
      if (code === 'AI_UNAVAILABLE') {
        throw new AppError(503, (err as Error).message, { code: 'AI_UNAVAILABLE' });
      }
      throw new AppError(502, 'Ops Copilot could not complete the request; try again.');
    }

    res.json({ ...result, readOnly: true, sandbox: true });
  } catch (err) {
    next(err);
  }
});

export default router;

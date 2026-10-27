import type { NextFunction, Request, Response } from 'express';

// Small in-memory sliding-window limiter, keyed by an arbitrary string.
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    public limit: number,
    public windowMs: number
  ) {}

  /** Records a hit; returns retry-after seconds if the key is over its limit. */
  hit(key: string, now: number = Date.now()): { allowed: true } | { allowed: false; retryAfter: number } {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }

  forget(key: string): void {
    this.hits.delete(key);
  }

  prune(now: number = Date.now()): void {
    for (const [key, times] of this.hits.entries()) {
      const recent = times.filter((t) => now - t < this.windowMs);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }

  reset(): void {
    this.hits.clear();
  }
}

const limiters = new Set<SlidingWindowLimiter>();

/** Clears every limiter created by sessionRateLimit (test isolation). */
export function resetSessionRateLimiters(): void {
  limiters.forEach((l) => l.reset());
}

/**
 * Per-session and per-IP limiter for cheap-but-abusable routes (policy preview, order creation,
 * capture). Must run AFTER requireSession. Limits are generous for a human and for the MCP self-calls;
 * they exist to stop a script from hammering PayPal or the policy engine.
 */
export function sessionRateLimit(perSessionPerMin: number, perIpPerMin: number) {
  const perSession = new SlidingWindowLimiter(perSessionPerMin, 60_000);
  const perIp = new SlidingWindowLimiter(perIpPerMin, 60_000);
  limiters.add(perSession);
  limiters.add(perIp);
  return (req: Request, res: Response, next: NextFunction) => {
    const checks: Array<[string, SlidingWindowLimiter, string]> = [
      ['session', perSession, req.session?.sessionId ?? 'anonymous'],
      ['ip', perIp, req.ip || 'unknown'],
    ];
    for (const [scope, limiter, key] of checks) {
      const result = limiter.hit(key);
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfter));
        return res.status(429).json({
          error: 'Rate limit exceeded',
          scope,
          message: `Maximum ${limiter.limit} requests per minute (${scope})`,
          retryAfter: result.retryAfter,
        });
      }
    }
    next();
  };
}

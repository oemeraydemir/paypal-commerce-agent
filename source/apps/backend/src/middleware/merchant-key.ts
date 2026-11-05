import { createHash, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './error-handler';
import { SlidingWindowLimiter } from './rate-limit';

// Guards the merchant-side read endpoints (orders, order stats, policy events) with the same
// X-Ops-Key that protects the refund queue.
//
// DASHBOARD_PUBLIC=true (explicit opt-in demo mode): no key needed; those endpoints already return a
// minimised view (no PayPal ids, hashed session labels).
// DASHBOARD_PUBLIC=false: every one of those routes needs a valid X-Ops-Key (secure mode for any
// deployment that holds real customer data).
const limiter = new SlidingWindowLimiter(60, 60_000);

export function resetMerchantKeyState(): void {
  limiter.reset();
}

export function keyMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function dashboardIsPublic(): boolean {
  return process.env.DASHBOARD_PUBLIC?.toLowerCase() === 'true';
}

export function requireDashboardAccess(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (dashboardIsPublic()) return next();
    const expected = process.env.OPS_COPILOT_KEY;
    if (!expected || expected.length < 16) {
      throw new AppError(503, 'Dashboard data is private: set OPS_COPILOT_KEY (16+ characters).');
    }
    const verdict = limiter.hit(req.ip ?? 'unknown'); // counted before the check so guessing is throttled
    if (!verdict.allowed) throw new AppError(429, 'Too many requests; try again shortly.');
    if (!keyMatches(req.get('x-ops-key'), expected)) {
      throw new AppError(401, 'A valid X-Ops-Key header is required.');
    }
    next();
  } catch (err) {
    next(err);
  }
}

import { Router, Request, Response, NextFunction } from 'express';
import { aiService } from '../ai/service';
import { markSessionAIPrepared, clearAIPreparedSession } from '../ai/session-tracker';
import { AppError } from '../middleware/error-handler';
import { requireSession } from '../middleware/session-auth';
import { SlidingWindowLimiter } from '../middleware/rate-limit';
import { sessionStore } from '../session';
import { env } from '../config/environment';
import { z } from 'zod';

const router = Router();

// Conversation history is in-memory, keyed by the AUTHENTICATED session id.
const conversationHistory = new Map<string, any[]>();

const WINDOW_MS = 60 * 1000;
const MAX_HISTORY = 20;
const preferencesSchema = z.object({
  dietary: z.array(z.enum(['vegetarian', 'vegan', 'gluten-free'])).max(3).default([]),
  maxBudgetMinor: z.number().int().min(100).max(10000).optional(),
}).strict();

// Three independent ceilings. Sessions are server-issued, so the per-session
// limit can no longer be dodged by inventing a new id; the per-IP and global
// ceilings bound OpenAI spend even if many sessions are created.
export const aiChatLimiters = {
  perSession: new SlidingWindowLimiter(env.AI_CHAT_PER_SESSION_PER_MIN, WINDOW_MS),
  perIp: new SlidingWindowLimiter(env.AI_CHAT_PER_IP_PER_MIN, WINDOW_MS),
  global: new SlidingWindowLimiter(env.AI_CHAT_GLOBAL_PER_MIN, WINDOW_MS),
};

// Test isolation only.
export function resetAiRouteState(): void {
  conversationHistory.clear();
  aiChatLimiters.perSession.reset();
  aiChatLimiters.perIp.reset();
  aiChatLimiters.global.reset();
}

// Free per-session state for sessions that no longer exist.
const cleanupTimer = setInterval(() => {
  for (const sessionId of [...conversationHistory.keys()]) {
    if (!sessionStore.has(sessionId)) {
      conversationHistory.delete(sessionId);
      aiChatLimiters.perSession.forget(sessionId);
      clearAIPreparedSession(sessionId);
    }
  }
  aiChatLimiters.perSession.prune();
  aiChatLimiters.perIp.prune();
  aiChatLimiters.global.prune();
}, 5 * 60 * 1000);
cleanupTimer.unref();

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.session!.sessionId;
  const checks: Array<[string, SlidingWindowLimiter, string]> = [
    ['session', aiChatLimiters.perSession, sessionId],
    ['ip', aiChatLimiters.perIp, req.ip || 'unknown'],
    ['global', aiChatLimiters.global, 'all'],
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
}

router.post('/ai/chat', requireSession, rateLimit, async (req, res, next) => {
  try {
    if (!env.isAIEnabled()) {
      throw new AppError(503, 'OpenAI not configured');
    }

    const { sessionId, userId } = req.session!;
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      throw new AppError(400, 'message required');
    }
    const preferencesResult = preferencesSchema.safeParse(req.body.preferences ?? {});
    if (!preferencesResult.success) {
      throw new AppError(400, 'Invalid shopping preferences', preferencesResult.error.flatten());
    }

    const history = conversationHistory.get(sessionId) || [];
    const result = await aiService.chat(
      sessionId,
      message,
      history,
      preferencesResult.data,
      userId
    );

    conversationHistory.set(sessionId, result.updatedHistory.slice(-MAX_HISTORY));

    if (result.checkoutReady) {
      markSessionAIPrepared(sessionId);
    }

    res.json({
      sessionId,
      response: result.response,
      preparedCart: result.preparedCart,
      checkoutReady: result.checkoutReady,
      toolRounds: result.toolRounds,
      messageCount: result.updatedHistory.length,
    });
  } catch (err) {
    next(err);
  }
});

function requireOwnPathSession(req: Request, _res: Response, next: NextFunction) {
  if (req.params.sessionId !== req.session!.sessionId) {
    return next(new AppError(403, 'Not your session', { code: 'SESSION_MISMATCH' }));
  }
  next();
}

router.delete('/ai/chat/:sessionId', requireSession, requireOwnPathSession, (req, res) => {
  const { sessionId } = req.params;
  conversationHistory.delete(sessionId);
  aiChatLimiters.perSession.forget(sessionId);
  clearAIPreparedSession(sessionId);
  res.json({ message: 'Conversation history cleared' });
});

router.delete('/ai/cart/:sessionId', requireSession, requireOwnPathSession, (req, res) => {
  clearAIPreparedSession(req.params.sessionId);
  res.json({ message: 'AI-prepared cart cleared' });
});

export default router;

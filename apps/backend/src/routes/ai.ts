import { Router, Request, Response, NextFunction } from 'express';
import { aiService } from '../ai/service';
import { markSessionAIPrepared } from '../ai/session-tracker';
import { AppError } from '../middleware/error-handler';
import { env } from '../config/environment';
import { clearAIPreparedSession } from '../ai/session-tracker';
import { z } from 'zod';

const router = Router();

// In-memory rate limiter (10 requests/minute/session) + conversation history.
const rateLimitStore = new Map<string, number[]>();
const conversationHistory = new Map<string, any[]>();

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 10;
const HISTORY_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY = 20;
const preferencesSchema = z.object({
  dietary: z.array(z.enum(['vegetarian', 'vegan', 'gluten-free'])).max(3).default([]),
  maxBudgetMinor: z.number().int().min(100).max(10000).optional(),
}).strict();

// FIX (consistency with S1): unref the cleanup timer so it never keeps the
// test process / server alive.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, requests] of rateLimitStore.entries()) {
    if (requests.length === 0 || now - requests[requests.length - 1] > HISTORY_TTL_MS) {
      rateLimitStore.delete(sessionId);
      conversationHistory.delete(sessionId);
      clearAIPreparedSession(sessionId);
    }
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const sessionId = (req.body && req.body.sessionId) || (req.headers['x-session-id'] as string);
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  const now = Date.now();
  const recent = (rateLimitStore.get(sessionId) || []).filter((t) => now - t < WINDOW_MS);
  rateLimitStore.set(sessionId, recent);

  if (recent.length >= MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Maximum ${MAX_REQUESTS} requests per minute`,
      retryAfter: Math.ceil((recent[0] + WINDOW_MS - now) / 1000),
    });
  }

  recent.push(now);
  next();
}

router.post('/ai/chat', rateLimit, async (req, res, next) => {
  try {
    if (!env.isAIEnabled()) {
      throw new AppError(503, 'OpenAI not configured');
    }

    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      throw new AppError(400, 'sessionId and message required');
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
      preferencesResult.data
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

router.delete('/ai/chat/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  conversationHistory.delete(sessionId);
  rateLimitStore.delete(sessionId);
  clearAIPreparedSession(sessionId);
  res.json({ message: 'Conversation history cleared' });
});

router.delete('/ai/cart/:sessionId', (req, res) => {
  clearAIPreparedSession(req.params.sessionId);
  res.json({ message: 'AI-prepared cart cleared' });
});

export default router;

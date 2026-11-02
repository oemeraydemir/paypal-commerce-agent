import { Router, Request, Response, NextFunction } from 'express';
import { aiService } from '../ai/service';
import { executeTool } from '../ai/tool-executor';
import { buildCatalogDiscovery, formatDiscoveryReply, parseOptionSelection, profileSignature, type CatalogDiscovery } from '../ai/catalog-discovery';
import { runFallbackAssistant } from '../ai/fallback-planner';
import { resolveNumberedChoice } from '../ai/numbered-choice';
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
const CATALOG_OPTION_TTL_MS = 10 * 60 * 1000;
const activeCatalogOptions = new Map<string, { createdAt: number; profileKey: string; discovery: CatalogDiscovery; processing: boolean }>();

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
  activeCatalogOptions.clear();
  aiChatLimiters.perSession.reset();
  aiChatLimiters.perIp.reset();
  aiChatLimiters.global.reset();
}

// Free per-session state for sessions that no longer exist.
const cleanupTimer = setInterval(() => {
  for (const sessionId of [...conversationHistory.keys()]) {
    if (!sessionStore.has(sessionId)) {
      conversationHistory.delete(sessionId);
      activeCatalogOptions.delete(sessionId);
      aiChatLimiters.perSession.forget(sessionId);
      clearAIPreparedSession(sessionId);
    }
  }
  aiChatLimiters.perSession.prune();
  aiChatLimiters.perIp.prune();
  aiChatLimiters.global.prune();
  for (const [id, state] of activeCatalogOptions) { if (Date.now() - state.createdAt > CATALOG_OPTION_TTL_MS) activeCatalogOptions.delete(id); }
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
    const activeOptions = activeCatalogOptions.get(sessionId);
    const selection = parseOptionSelection(message);
    const profileKey = profileSignature(preferencesResult.data);

    if (activeOptions && Date.now() - activeOptions.createdAt > CATALOG_OPTION_TTL_MS) {
      activeCatalogOptions.delete(sessionId);
      if (selection !== null || /^\s*\d+\s*$/.test(message)) {
        const response = activeOptions.discovery.language === 'tr' ? 'Bu seçeneklerin süresi doldu. Lütfen menü seçeneklerini yeniden isteyin.' : 'These choices expired. Please ask me to show the menu options again.';
        return res.json({ sessionId, response, preparedCart: null, checkoutReady: false, toolRounds: 0, messageCount: history.length, mode: 'catalog-options', provider: 'catalog', model: null, modelCalls: 0, fallback: false });
      }
    }
    if (activeOptions && (selection !== null || /^\s*\d+\s*$/.test(message))) {
      if (activeOptions.profileKey !== profileKey) {
        activeCatalogOptions.delete(sessionId);
        const response = activeOptions.discovery.language === 'tr' ? 'Alışveriş profiliniz değişti. Yeni diyet/bütçe tercihlerinizle seçenekleri yeniden isteyin.' : 'Your shopper profile changed. Please request the options again so I can apply the new diet and budget.';
        return res.json({ sessionId, response, preparedCart: null, checkoutReady: false, toolRounds: 0, messageCount: history.length, mode: 'catalog-options', provider: 'catalog', model: null, modelCalls: 0, fallback: false });
      }
      if (activeOptions.processing) return res.status(409).json({ error: 'This catalog choice is already being prepared.' });
      const choice = selection === null ? undefined : activeOptions.discovery.options[selection - 1];
      if (!choice) {
        const response = activeOptions.discovery.language === 'tr' ? `Lütfen 1 ile ${activeOptions.discovery.options.length} arasındaki seçeneklerden birini yazın.` : `Please choose a number from 1 to ${activeOptions.discovery.options.length}.`;
        return res.json({ sessionId, response, preparedCart: null, checkoutReady: false, toolRounds: 0, messageCount: history.length, mode: 'catalog-options', provider: 'catalog', model: null, modelCalls: 0, fallback: false });
      }
      activeOptions.processing = true;
      try {
        const preparedCart = await executeTool('prepare_cart', {
          items: [{ productId: choice.productId, quantity: choice.quantity }],
          ...(activeOptions.discovery.effectivePreferences.maxBudgetMinor !== undefined ? { maxBudgetMinor: activeOptions.discovery.effectivePreferences.maxBudgetMinor } : {}),
        }, activeOptions.discovery.effectivePreferences, { sessionId, userId, origin: 'AI_ASSISTED' });
        activeCatalogOptions.delete(sessionId);
        const checkoutReady = preparedCart.policyDecision !== 'BLOCK';
        if (checkoutReady) markSessionAIPrepared(sessionId, 'AI_ASSISTED');
        const lines = preparedCart.items.map((item: any) => `- **${item.quantity}× ${item.name}** — ${item.lineTotalFormatted}`).join('\n');
        const blocked = !checkoutReady;
        const response = activeOptions.discovery.language === 'tr'
          ? (blocked ? `Bu sepet satın alma politikası nedeniyle engellendi: ${preparedCart.reason || 'politika kısıtı'}. Başka bir seçenek deneyin.\n\n${lines}\n\n**Toplam:** ${preparedCart.totalFormatted}` : `Seçtiğiniz sepet hazırlandı. Lütfen ürünleri ve toplamı gözden geçirin; ödeme, uygulamadaki onay adımını siz başlatmadan ilerlemez.\n\n${lines}\n\n**Toplam:** ${preparedCart.totalFormatted}`)
          : (blocked ? `This cart was blocked by the purchase policy: ${preparedCart.reason || 'policy restriction'}. Please choose another option.\n\n${lines}\n\n**Total:** ${preparedCart.totalFormatted}` : `Your selected cart is ready. Review the items and total; payment will not proceed unless you start the app's approval step.\n\n${lines}\n\n**Total:** ${preparedCart.totalFormatted}`);
        const updatedHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: response }].slice(-MAX_HISTORY);
        conversationHistory.set(sessionId, updatedHistory);
        res.setHeader('X-AI-Provider', 'catalog');
        return res.json({ sessionId, response, preparedCart, checkoutReady, toolRounds: 1, messageCount: updatedHistory.length, mode: 'catalog-selection', provider: 'catalog', model: null, modelCalls: 0, fallback: false });
      } catch (_err) {
        console.warn('catalog option preparation failed');
        activeCatalogOptions.delete(sessionId);
        const response = activeOptions.discovery.language === 'tr' ? 'Bu seçeneği profil ve bütçe kısıtlarıyla sepete hazırlayamadım. Lütfen menü seçeneklerini yeniden isteyin.' : 'I could not prepare that option under the current profile and budget. Please request the menu options again.';
        const updatedHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: response }].slice(-MAX_HISTORY);
        conversationHistory.set(sessionId, updatedHistory);
        return res.json({ sessionId, response, preparedCart: null, checkoutReady: false, toolRounds: 0, messageCount: updatedHistory.length, mode: 'catalog-selection', provider: 'catalog', model: null, modelCalls: 0, fallback: false });
      }
    }
    if (activeOptions) activeCatalogOptions.delete(sessionId);
    const discovery = req.body.intent === 'catalog_discovery'
      ? buildCatalogDiscovery(message, preferencesResult.data)
      : null;
    if (discovery) {
      const response = formatDiscoveryReply(discovery);
      const updatedHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: response }].slice(-MAX_HISTORY);
      conversationHistory.set(sessionId, updatedHistory);
      activeCatalogOptions.set(sessionId, { createdAt: Date.now(), profileKey, discovery, processing: false });
      res.setHeader('X-AI-Provider', 'catalog');
      return res.json({ sessionId, response, preparedCart: null, checkoutReady: false, toolRounds: 0, messageCount: updatedHistory.length, mode: 'catalog-options', provider: 'catalog', model: null, modelCalls: 0, fallback: false });
    }
    let result;
    try {
      // No provider key at all is the same situation, for the user, as every provider being
      // exhausted: degrade to the labelled rule-based planner instead of a dead end. This keeps a
      // fresh clone (no keys) usable and honest.
      if (!env.isAIEnabled()) {
        throw new AppError(503, 'AI is not configured', { code: 'AI_UNAVAILABLE' });
      }
      result = await aiService.chat(
        sessionId,
        message,
        history,
        preferencesResult.data,
        userId
      );
    } catch (aiErr) {
      // Every AI provider is exhausted (free-tier quotas). Degrade to the clearly
      // labelled rule-based planner instead of a dead end. It is NOT AI: it never
      // marks the session AI-prepared, so the order stays attributed to HUMAN.
      if (aiErr instanceof AppError && aiErr.details?.code === 'AI_UNAVAILABLE') {
        // A bare "1" answers the AI's earlier options list; give the planner the option title.
        const planMessage = resolveNumberedChoice(message, history) ?? message;
        const fallback = runFallbackAssistant(
          planMessage,
          preferencesResult.data,
          { sessionId, userId },
          { aiConfigured: env.isAIEnabled() }
        );
        conversationHistory.set(
          sessionId,
          [...history, { role: 'user', content: message }, { role: 'assistant', content: fallback.response }].slice(-MAX_HISTORY)
        );
        return res.json({
          sessionId,
          response: fallback.response,
          preparedCart: fallback.preparedCart,
          checkoutReady: fallback.checkoutReady,
          suggestion: fallback.suggestion ?? null,
          toolRounds: 0,
          messageCount: history.length + 2,
          mode: fallback.mode,
          provider: 'rule-based',
          model: null,
          modelCalls: 0,
          fallback: true,
        });
      }
      throw aiErr;
    }

    conversationHistory.set(sessionId, result.updatedHistory.slice(-MAX_HISTORY));

    if (result.checkoutReady) {
      // Storefront chat: the AI ASSISTED a human shopper (the human approves payment).
      markSessionAIPrepared(sessionId, 'AI_ASSISTED');
    }

    // One structured line per turn: provider/model names and counters only (no prompts, no keys).
    console.log(
      JSON.stringify({
        evt: 'ai_turn',
        provider: result.info.provider,
        model: result.info.model,
        modelCalls: result.info.modelCalls,
        toolRounds: result.toolRounds,
        fallback: result.info.fallback,
        limitReached: result.info.limitReached ?? null,
      })
    );

    res.setHeader('X-AI-Provider', result.info.provider ?? 'unknown');
    res.json({
      sessionId,
      response: result.response,
      preparedCart: result.preparedCart,
      checkoutReady: result.checkoutReady,
      toolRounds: result.toolRounds,
      messageCount: result.updatedHistory.length,
      mode: 'ai',
      provider: result.info.provider,
      model: result.info.model,
      modelCalls: result.info.modelCalls,
      fallback: result.info.fallback,
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

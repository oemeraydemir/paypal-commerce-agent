import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { AppError } from '../middleware/error-handler';
import { validateOrderItems } from '../orders/validation';
import { CatalogService } from '../catalog/service';
import { evaluateWellbeing, parseWellbeingPreferences } from '../wellbeing/service';
import { sessionStore } from '../session';

const router = Router();
const catalog = new CatalogService();

router.get('/wellbeing/preferences', requireSession, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ preferences: sessionStore.getWellbeingPreferences(req.session!.sessionId) ?? null });
});

router.put('/wellbeing/preferences', requireSession, async (req, res, next) => {
  try {
    const preferences = parseWellbeingPreferences(req.body?.preferences);
    await sessionStore.setWellbeingPreferences(req.session!.sessionId, preferences);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ preferences });
  } catch (err) {
    if (err instanceof RangeError) return next(new AppError(400, err.message));
    next(err);
  }
});

router.post('/wellbeing/check', requireSession, (req, res, next) => {
  try {
    const preferences = sessionStore.getWellbeingPreferences(req.session!.sessionId);
    if (!preferences) throw new AppError(428, 'Save your wellbeing preferences before checking products', { code: 'WELLBEING_PROFILE_REQUIRED' });
    const items = validateOrderItems(req.body?.items, catalog);
    res.setHeader('Cache-Control', 'no-store');
    res.json(evaluateWellbeing(items, preferences, catalog));
  } catch (err) { next(err); }
});

export default router;

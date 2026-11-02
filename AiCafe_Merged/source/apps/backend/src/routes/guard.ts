import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { AppError } from '../middleware/error-handler';
import { GUARD_ALLERGENS, GUARD_DIETS, shopperGuardStore } from '../policy/shopper-guard';

// Wellbeing Guard: the shopper's diet + allergen concerns, enforced SERVER-SIDE by the
// authoritative PolicyService on every checkout path. Only the shopper's own session can set it;
// the AI assistant has no tool that touches it. Session-scoped, in memory, 24 h expiry.
const router = Router();

const DISCLAIMER =
  'Allergen information is declared by the café and has not been verified. This is not medical ' +
  'advice or an allergy-safety guarantee; an item without a declaration is treated as unknown, ' +
  'never as allergen-free.';

const view = (userId: string) => ({
  guard: shopperGuardStore.get(userId) ?? { allergens: [] },
  options: { diets: GUARD_DIETS, allergens: GUARD_ALLERGENS },
  enforcedBy: 'server',
  disclaimer: DISCLAIMER,
});

router.get('/guard', requireSession, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(view(req.session!.userId));
});

router.put('/guard', requireSession, (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      try {
        // Accept both `diet` (legacy single value) and `diets` (array) so the
        // Flutter/KON client shape works; `ShopperGuardStore.set` dedupes.
        shopperGuardStore.set(req.session!.userId, {
          diet: body.diet,
          diets: body.diets,
          allergens: body.allergens,
        });
      } catch (err: any) {
      throw new AppError(400, err?.message ?? 'Invalid Wellbeing Guard');
    }
    res.set('Cache-Control', 'no-store');
    res.json(view(req.session!.userId));
  } catch (err) {
    next(err);
  }
});

router.delete('/guard', requireSession, (req, res) => {
  shopperGuardStore.clear(req.session!.userId);
  res.status(200).json(view(req.session!.userId));
});

export default router;

import { Router } from 'express';
import { requireSession } from '../middleware/session-auth';
import { AppError } from '../middleware/error-handler';
import { validateOrderItems } from '../orders/validation';
import { CatalogService } from '../catalog/service';
import { evaluateWellbeing, parseDiet } from '../wellbeing/service';

const router = Router();
const catalog = new CatalogService();

// POST /api/wellbeing/check  { items: [{productId, quantity}], diet?: 'vegetarian'|'vegan'|'gluten-free' }
// Stateless and advisory. Allergens are deliberately NOT accepted: they never leave the device.
// The diet preference is used for this response only and is not stored or logged.
router.post('/wellbeing/check', requireSession, (req, res, next) => {
  try {
    if (req.body && 'allergens' in req.body) {
      throw new AppError(400, 'Allergen choices are kept on your device and are never sent to the server.', {
        code: 'ALLERGENS_NOT_ACCEPTED',
      });
    }
    let diet;
    try {
      diet = parseDiet(req.body?.diet);
    } catch {
      throw new AppError(400, 'diet must be one of: vegetarian, vegan, gluten-free');
    }
    const items = validateOrderItems(req.body?.items, catalog);
    res.setHeader('Cache-Control', 'no-store');
    res.json(evaluateWellbeing(items, diet, catalog));
  } catch (err) {
    next(err);
  }
});

export default router;

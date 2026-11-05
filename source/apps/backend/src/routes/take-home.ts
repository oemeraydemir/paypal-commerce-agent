import { Router } from 'express';
import { CatalogService } from '../catalog/service';
import { AppError } from '../middleware/error-handler';
import { requireSession } from '../middleware/session-auth';
import { sessionRateLimit } from '../middleware/rate-limit';
import { buildTakeHomeQuery, channel3Enabled, Channel3Error, searchTakeHome } from '../channel3/client';

// POST /api/discover/take-home   body: { items: [{ productId }] }
//
// "Take it home" suggestions powered by Channel3. Read-only discovery: it never creates an order, never
// touches PayPal and is outside the Spending Mandate. The query is built on the server from the catalog
// category of the cart items, so no free text from the client reaches Channel3.
const router = Router();
const catalog = new CatalogService();
const limiter = sessionRateLimit(10, 100);

export const TAKE_HOME_DISCLOSURE =
  'Suggestions from Channel3. They open the retailer’s own page: not part of your café order, not covered by your spending allowance, and not paid through this app.';

router.post('/discover/take-home', requireSession, limiter, async (req, res, next) => {
  try {
    if (!channel3Enabled()) {
      res.json({ enabled: false, items: [], note: 'Channel3 is not configured on this deployment.' });
      return;
    }
    const raw = req.body?.items;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) {
      throw new AppError(400, 'items array required (1-50)');
    }
    const categories: string[] = [];
    for (const it of raw) {
      const p = typeof it?.productId === 'string' ? catalog.getById(it.productId) : undefined;
      if (p) categories.push(p.category);
    }
    const query = buildTakeHomeQuery(categories);
    if (!query) {
      res.json({ enabled: true, items: [], disclosure: TAKE_HOME_DISCLOSURE, source: 'channel3' });
      return;
    }
    try {
      const items = await searchTakeHome(query, { apiKey: String(process.env.CHANNEL3_API_KEY), fetchImpl: (req.app.locals.channel3Fetch as typeof fetch | undefined) });
      res.json({ enabled: true, query, items, disclosure: TAKE_HOME_DISCLOSURE, source: 'channel3' });
    } catch (e) {
      if (e instanceof Channel3Error) throw new AppError(502, 'Product suggestions are unavailable right now.');
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router, Request, Response, NextFunction } from 'express';
import { CatalogService } from '../catalog/service';
import { AppError } from '../middleware/error-handler';

const router = Router();
const catalog = new CatalogService();

function parseList(value: unknown): string[] | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

router.get('/catalog', (_req: Request, res: Response) => {
  const products = catalog.getAll();
  res.status(200).json({ count: products.length, products });
});

router.get('/catalog/search', (req: Request, res: Response) => {
  const q = req.query;
  const results = catalog.search({
    query: typeof q.query === 'string' ? q.query : undefined,
    category: typeof q.category === 'string' ? q.category : undefined,
    tags: parseList(q.tags),
    dietary: parseList(q.dietary),
    occasion: parseList(q.occasion),
    // CRITICAL FIX #15: pass through even maxPriceMinor == 0 (handled by !== undefined in service)
    maxPriceMinor:
      q.maxPriceMinor !== undefined ? Number(q.maxPriceMinor) : undefined,
    matchMode: q.matchMode === 'any' ? 'any' : 'all',
  });
  res.status(200).json({ count: results.length, products: results });
});

router.get('/catalog/:id', (req: Request, res: Response, next: NextFunction) => {
  const product = catalog.getById(req.params.id);
  if (!product) {
    return next(new AppError(404, `Product not found: ${req.params.id}`));
  }
  res.status(200).json(product);
});

export default router;

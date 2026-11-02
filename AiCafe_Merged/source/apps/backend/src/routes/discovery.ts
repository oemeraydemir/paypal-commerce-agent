import { Router, Request, Response } from 'express';
import { resolvePublicBaseUrl } from '../config/public-url';
import { buildAgentCard, buildLlmsTxt, buildManifest } from '../discovery/manifest';
import { buildProductFeed } from '../discovery/feed';

// Public, read-only discovery surface for AI agents. Nothing here can create an order or move money.
//
//   /.well-known/agent-commerce.json   canonical source of truth
//   /.well-known/agent.json            agent card, generated from the manifest
//   /llms.txt                          plain text, generated from the manifest
//   /api/feed/products                 product feed (distinct purpose: catalog data)
//
// URLs inside the documents come from PUBLIC_BASE_URL (required in production), never from request headers
// in production. Responses are only publicly cacheable when that URL is configured.

const router = Router();

function respond(req: Request, res: Response, maxAge: number, render: (base: string) => void) {
  const base = resolvePublicBaseUrl(req);
  if (!base.ok) {
    res.set('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Discovery is not available: public base URL is not configured.', detail: base.reason });
    return;
  }
  res.set('Cache-Control', base.configured ? `public, max-age=${maxAge}` : 'no-store');
  render(base.url);
}

router.get('/.well-known/agent-commerce.json', (req, res) => respond(req, res, 300, (base) => res.json(buildManifest(base))));
router.get('/.well-known/agent.json', (req, res) => respond(req, res, 300, (base) => res.json(buildAgentCard(buildManifest(base)))));
router.get('/llms.txt', (req, res) =>
  respond(req, res, 300, (base) => res.type('text/plain; charset=utf-8').send(buildLlmsTxt(buildManifest(base))))
);
router.get('/api/feed/products', (req, res) => respond(req, res, 60, (base) => res.json(buildProductFeed(base))));

export default router;

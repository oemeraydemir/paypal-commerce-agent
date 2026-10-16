import { Request, Response, NextFunction } from 'express';

// Preserve the raw request body for PayPal webhook signature verification.
//
// PayPal's verify-webhook-signature API validates the EXACT bytes PayPal sent.
// We therefore buffer the raw stream ourselves and never let a JSON body parser
// re-serialize it. This middleware MUST be mounted BEFORE express.json()
// (see src/app.ts) so no other parser consumes the stream first.
export function rawBodyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.is('application/json')) {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      // Keep the exact bytes for signature verification.
      (req as any).rawBody = data;
      try {
        req.body = JSON.parse(data);
        next();
      } catch (err) {
        next(err);
      }
    });
  } else {
    // Non-JSON payloads (e.g. GET health) pass through untouched.
    next();
  }
}

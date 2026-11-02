import { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler';

// Preserve the raw request body for PayPal webhook signature verification.
//
// PayPal's verify-webhook-signature API validates the EXACT bytes PayPal sent.
// We therefore buffer the raw stream ourselves and never let a JSON body parser
// re-serialize it. This middleware MUST be mounted BEFORE express.json()
// (see src/app.ts) so no other parser consumes the stream first.

/** Hard cap for the raw webhook body. Real PayPal events are a few KB. */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024; // 1 MiB

export function rawBodyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.is('application/json')) {
    // Non-JSON payloads (e.g. GET health) pass through untouched.
    next();
    return;
  }

  // Reject a declared oversized body without buffering it. Drain and discard the
  // request before sending 413 so clients still receive the status instead of a
  // connection reset while they are writing the body. Memory use remains bounded.
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BODY_BYTES) {
    req.once('end', () => {
      if (!res.destroyed && !res.headersSent) {
        res.status(413).json({ error: 'Payload too large' });
      }
    });
    req.once('error', (err) => {
      if (!res.destroyed && !res.headersSent) next(err);
    });
    req.resume(); // discard incoming bytes; do not store or parse them
    return;
  }

  let data = '';
  let bytes = 0;
  let tooLarge = false;
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => {
    if (tooLarge) return;
    bytes += Buffer.byteLength(chunk, 'utf8');
    if (bytes > MAX_WEBHOOK_BODY_BYTES) {
      // Stop buffering; keep draining so the connection is not left hanging.
      tooLarge = true;
      data = '';
      return;
    }
    data += chunk;
  });
  req.on('end', () => {
    if (tooLarge) {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }
    // Keep the exact bytes for signature verification.
    (req as any).rawBody = data;
    try {
      req.body = JSON.parse(data);
      next();
    } catch {
      // A malformed webhook is a client error, not a 500.
      next(new AppError(400, 'Invalid JSON body'));
    }
  });
  req.on('error', (err) => next(err));
}

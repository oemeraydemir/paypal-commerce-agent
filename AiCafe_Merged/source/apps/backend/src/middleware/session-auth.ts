import { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler';
import { sessionStore } from '../session';

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: AuthenticatedSession;
    }
  }
}

function readBearer(req: Request): string | undefined {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : undefined;
}

// Requires a server-issued session: `X-Session-Id` + `Authorization: Bearer <token>`.
// A body `sessionId` is optional, but if present it must be the authenticated one.
// The authenticated id is injected into the body so existing handlers keep working
// and can never see a client-chosen id.
export function requireSession(req: Request, _res: Response, next: NextFunction) {
  const sessionId = req.headers['x-session-id'];
  const token = readBearer(req);
  if (typeof sessionId !== 'string' || !sessionId || !token) {
    return next(new AppError(401, 'Session required: call POST /api/sessions first', { code: 'SESSION_REQUIRED' }));
  }

  const record = sessionStore.verify(sessionId, token);
  if (!record) {
    return next(new AppError(401, 'Invalid or expired session', { code: 'SESSION_INVALID' }));
  }

  const bodySessionId = req.body?.sessionId;
  if (bodySessionId !== undefined && bodySessionId !== record.sessionId) {
    return next(new AppError(403, 'sessionId does not match the authenticated session', { code: 'SESSION_MISMATCH' }));
  }

  req.session = { sessionId: record.sessionId, userId: record.userId };
  if (req.body && typeof req.body === 'object') {
    req.body.sessionId = record.sessionId;
  }
  next();
}

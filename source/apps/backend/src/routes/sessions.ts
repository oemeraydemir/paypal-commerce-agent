import { Router } from 'express';
import { AppError } from '../middleware/error-handler';
import { requireSession } from '../middleware/session-auth';
import { sessionStore, SessionLimitError } from '../session';
import { clearAIPreparedSession } from '../ai/session-tracker';

const router = Router();

// Mints a server-generated session. The token is returned exactly once and is
// never stored in clear text.
router.post('/sessions', (req, res, next) => {
  try {
    const issued = sessionStore.issue(req.ip || 'unknown');
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json(issued);
  } catch (err) {
    if (err instanceof SessionLimitError) {
      return next(
        new AppError(err.kind === 'IP_LIMIT' ? 429 : 503, err.message, { code: err.kind })
      );
    }
    next(err);
  }
});

// Ends the authenticated session (logout / "reset demo").
router.delete('/sessions/current', requireSession, (req, res) => {
  const sessionId = req.session!.sessionId;
  clearAIPreparedSession(sessionId);
  sessionStore.remove(sessionId);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ message: 'Session ended' });
});

export default router;

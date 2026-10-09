import { Request, Response, NextFunction } from 'express';
import { createRequestFingerprint } from '../orders/service';

interface IdempotencyRecord {
  status: number;
  body: any;
  timestamp: number;
  requestFingerprint: string;
}

const idempotencyStore = new Map<string, IdempotencyRecord>();
// FIX #8: track in-flight requests so concurrent duplicates wait instead of
// both executing.
const pendingRequests = new Map<string, Promise<IdempotencyRecord>>();

// CRITICAL FIX #3 (S1): unref() so the cleanup timer never keeps the process alive.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of idempotencyStore.entries()) {
    if (now - value.timestamp > 24 * 60 * 60 * 1000) {
      idempotencyStore.delete(key);
    }
  }
}, 60 * 60 * 1000);

cleanupTimer.unref();

export function idempotency(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!idempotencyKey) {
    return next();
  }

  const currentFingerprint = createRequestFingerprint(req.body);

  // Cached hit (only 2xx/4xx are cached — see FIX #3 below).
  if (idempotencyStore.has(idempotencyKey)) {
    const cached = idempotencyStore.get(idempotencyKey)!;

    if (cached.requestFingerprint !== currentFingerprint) {
      return res.status(409).json({
        error: 'IDEMPOTENCY_KEY_REUSE',
        message: 'Idempotency-Key reused with different request body',
      });
    }

    console.log(`Idempotency hit: ${idempotencyKey}`);
    return res.status(cached.status).json(cached.body);
  }

  // FIX #8: a request with the same key is already in flight — wait for it.
  if (pendingRequests.has(idempotencyKey)) {
    console.log(`Concurrent request waiting: ${idempotencyKey}`);
    pendingRequests.get(idempotencyKey)!.then((cached) => {
      res.status(cached.status).json(cached.body);
    });
    return;
  }

  // FIX #4: cache on 'finish' (not by monkey-patching res.json's call site),
  // so a response that never calls res.json still releases the lock.
  const requestPromise = new Promise<IdempotencyRecord>((resolve) => {
    res.on('finish', () => {
      const body = (res.locals as any).responseBody;
      const record: IdempotencyRecord = {
        status: res.statusCode,
        body,
        timestamp: Date.now(),
        requestFingerprint: currentFingerprint,
      };

      // FIX #3: only cache 2xx and 4xx. A 5xx means upstream (PayPal) failed;
      // caching it would make every retry return 500 forever.
      if (res.statusCode >= 200 && res.statusCode < 500) {
        idempotencyStore.set(idempotencyKey, record);
      }

      pendingRequests.delete(idempotencyKey);
      resolve(record);
    });

    // Capture the body so the 'finish' handler can cache it.
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      (res.locals as any).responseBody = body;
      return originalJson(body);
    } as typeof res.json;
  });

  pendingRequests.set(idempotencyKey, requestPromise);
  next();
}

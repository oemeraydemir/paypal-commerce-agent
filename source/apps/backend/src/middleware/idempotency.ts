import { Request, Response, NextFunction } from 'express';
import { createRequestFingerprint } from '../orders/service';
import { getRepos, writeQueue } from '../persistence/registry';

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

/** Test isolation only: forgets the in-memory layer (the durable table is untouched). */
export function resetIdempotencyMemory(): void {
  idempotencyStore.clear();
  pendingRequests.clear();
}

export async function idempotency(req: Request, res: Response, next: NextFunction) {
  try {
    await runIdempotency(req, res, next);
  } catch (err) {
    next(err);
  }
}

async function runIdempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawKey = req.headers['idempotency-key'] as string | undefined;

  if (!rawKey) {
    return next();
  }
  // Scope the key to the authenticated session so one session can never be
  // served (or collide with) another session's cached response.
  const idempotencyKey = req.session ? `${req.session.sessionId}:${rawKey}` : rawKey;

  const currentFingerprint = createRequestFingerprint(req.body);

  // Cached hit (only 2xx/4xx are cached — see FIX #3 below).
  if (idempotencyStore.has(idempotencyKey)) {
    const cached = idempotencyStore.get(idempotencyKey)!;

    if (cached.requestFingerprint !== currentFingerprint) {
      res.status(409).json({
        error: 'IDEMPOTENCY_KEY_REUSE',
        message: 'Idempotency-Key reused with different request body',
      });
      return;
    }

    console.log(`Idempotency hit: ${idempotencyKey}`);
    res.status(cached.status).json(cached.body);
    return;
  }

  // FIX #8: a request with the same key is already in flight — wait for it.
  if (pendingRequests.has(idempotencyKey)) {
    console.log(`Concurrent request waiting: ${idempotencyKey}`);
    pendingRequests.get(idempotencyKey)!.then((cached) => {
      res.status(cached.status).json(cached.body);
    });
    return;
  }

  // Register as in-flight SYNCHRONOUSLY (before any await) so a concurrent twin
  // cannot slip past while we consult the durable store.
  let settlePending!: (record: IdempotencyRecord) => void;
  const requestPromise = new Promise<IdempotencyRecord>((resolve) => {
    settlePending = resolve;
  });
  pendingRequests.set(idempotencyKey, requestPromise);

  // Durable layer: a key answered before a restart must not execute again.
  const repos = getRepos();
  if (repos) {
    try {
      const stored = await repos.idempotency.get(idempotencyKey);
      if (stored) {
        const record: IdempotencyRecord = {
          status: stored.status,
          body: stored.body,
          timestamp: stored.createdAt.getTime(),
          requestFingerprint: stored.fingerprint,
        };
        idempotencyStore.set(idempotencyKey, record);
        pendingRequests.delete(idempotencyKey);
        settlePending(record);
        if (record.requestFingerprint !== currentFingerprint) {
          res.status(409).json({
            error: 'IDEMPOTENCY_KEY_REUSE',
            message: 'Idempotency-Key reused with different request body',
          });
          return;
        }
        console.log(`Idempotency hit (durable): ${idempotencyKey}`);
        res.status(record.status).json(record.body);
        return;
      }
    } catch (err: any) {
      // Fail open here on purpose: the order layer de-duplicates by key as well
      // (OrderService.findReusableByIdempotencyKey), and PayPal-Request-Id is stable.
      console.error(`IDEMPOTENCY_LOOKUP_FAILED key=${idempotencyKey} error=${err?.message ?? err}`);
    }
  }

  // FIX #4: cache on 'finish' (not by monkey-patching res.json's call site),
  // so a response that never calls res.json still releases the lock.
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
      if (repos) {
        writeQueue
          .enqueue(`idempotency:${idempotencyKey}`, () =>
            repos.idempotency.save({
              key: idempotencyKey,
              status: record.status,
              body: record.body,
              fingerprint: record.requestFingerprint,
              createdAt: new Date(record.timestamp),
            })
          )
          .catch(() => undefined);
      }
    }

    pendingRequests.delete(idempotencyKey);
    settlePending(record);
  });

  // Capture the body so the 'finish' handler can cache it.
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    (res.locals as any).responseBody = body;
    return originalJson(body);
  } as typeof res.json;

  next();
}

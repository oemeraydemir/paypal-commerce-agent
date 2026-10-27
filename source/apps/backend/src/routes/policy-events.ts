import { requireDashboardAccess } from '../middleware/merchant-key';
import { Router, Request, Response, NextFunction } from 'express';
import { policyStorage } from '../policy/storage';
import { OrderService } from '../orders/service';
import { OrderStatus } from '../orders/domain';
import { formatMoney } from '../utils/money';
import { currentBusiness } from '../config/business-config';
import { AppError } from '../middleware/error-handler';
import { PolicyDecision } from '../policy/domain';
import { publicSessionRef } from '../session';

const router = Router();
const orderService = OrderService.getInstance();

const VALID_DECISIONS: ReadonlyArray<string> = [
  'AUTO_ALLOW',
  'REQUIRE_CONFIRMATION',
  'BLOCK',
];

function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  return undefined;
}

function parseOptionalDecision(value: unknown): string | undefined {
  const parsed = parseOptionalString(value);
  if (parsed === undefined) return undefined;
  if (!VALID_DECISIONS.includes(parsed as PolicyDecision)) {
    throw new AppError(
      400,
      `Invalid decision. Must be one of: ${VALID_DECISIONS.join(', ')}`
    );
  }
  return parsed;
}

function parseOptionalLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;

  let parsed: number;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    parsed = Number(trimmed);
  } else {
    parsed = value as number;
  }

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new AppError(400, 'Limit must be an integer between 1 and 100');
  }
  return parsed;
}

function serializeEvent(event: any) {
  return {
    id: event.id,
    timestamp: event.timestamp,
    // B1: the internal per-session `userId` is not exposed on this public,
    // unauthenticated endpoint. The masked session ref below is enough for
    // correlation without leaking the opaque user identifier.
    sessionId: publicSessionRef(event.sessionId),
    cartId: event.cartId,
    orderId: event.orderId ?? null,
    agent: event.agent,
    amountMinor: event.amountMinor,
    amountFormatted: formatMoney(event.amountMinor, event.currency, currentBusiness.locale),
    currency: event.currency,
    decision: event.decision,
    violatedRules: event.violatedRules ?? [],
    reason: event.reason,
    policySnapshot: event.policySnapshot,
  };
}

router.get(
  '/policy-events',
  requireDashboardAccess,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseOptionalString(req.query.userId);
      const decision = parseOptionalDecision(req.query.decision);
      const limit = parseOptionalLimit(req.query.limit);

      if (userId !== undefined && typeof userId !== 'string') {
        throw new AppError(400, 'userId must be a string');
      }

      let events = policyStorage.getEvents(userId);

      if (decision !== undefined) {
        events = events.filter((e) => e.decision === decision);
      }

      // Newest-first ordering by timestamp, then by stable event id.
      events = events
        .slice()
        .sort((a, b) => {
          const byTime = b.timestamp.localeCompare(a.timestamp);
          return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
        });

      if (limit !== undefined) {
        events = events.slice(0, limit);
      }

      res.status(200).json({
        events: events.map(serializeEvent),
        total: events.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/policy-events/stats',
  requireDashboardAccess,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseOptionalString(req.query.userId);
      if (userId !== undefined && typeof userId !== 'string') {
        throw new AppError(400, 'userId must be a string');
      }

      const events = policyStorage.getEvents(userId);

      const totalRequests = events.length;
      const blocked = events.filter((e) => e.decision === 'BLOCK').length;
      const allowed = totalRequests - blocked;

      // Spent: only orders in the terminal PAID state. Deduplicate by orderId
      // so one paid order contributes at most once (R3).
      const countedOrders = new Set<string>();
      let spentMinor = 0;

      for (const event of events) {
        const orderId = event.orderId;
        if (!orderId || countedOrders.has(orderId)) continue;

        const order = orderService.getById(orderId);
        if (order && order.status === OrderStatus.PAID) {
          countedOrders.add(orderId);
          spentMinor += order.totalMinor;
        }
      }

      const spentFormatted = formatMoney(
        spentMinor,
        currentBusiness.currency,
        currentBusiness.locale
      );

      res.status(200).json({
        totalRequests,
        allowed,
        blocked,
        spentMinor,
        spentFormatted,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

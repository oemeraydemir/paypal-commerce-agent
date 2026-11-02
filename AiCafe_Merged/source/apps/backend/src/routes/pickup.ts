import { Router } from 'express';
import { AppError } from '../middleware/error-handler';
import { requireSession } from '../middleware/session-auth';
import { requireDashboardAccess } from '../middleware/merchant-key';
import { pickupService } from '../pickup/service';

const router = Router();

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatSlot(s: {
  id: string;
  day: string;
  startTs: Date;
  endTs: Date;
  capacity: number;
  reservedCount: number;
}) {
  // Server-owned capacity; never trust any client-supplied value.
  return {
    id: s.id,
    day: s.day,
    startTs: s.startTs.toISOString(),
    endTs: s.endTs.toISOString(),
    capacity: s.capacity,
    reservedCount: s.reservedCount,
    remaining: Math.max(0, s.capacity - s.reservedCount),
  };
}

// Customer: view available pickup slots for a day (server computes remaining).
router.get('/pickup/availability', requireSession, async (req, res, next) => {
  try {
    const day = typeof req.query.day === 'string' ? req.query.day : todayStr();
    if (!DAY_RE.test(day)) {
      throw new AppError(400, 'Invalid day; expected YYYY-MM-DD', { code: 'BAD_DAY' });
    }
    const slots = await pickupService.getAvailability(day);
    res.json({ day, slots: slots.map(formatSlot) });
  } catch (err) {
    next(err);
  }
});

// Customer: reserve a slot. Capacity is held atomically; returns a HELD booking.
router.post('/pickup/reserve', requireSession, async (req, res, next) => {
  try {
    const { sessionId } = req.session!;
    const slotId = req.body?.slotId;
    if (typeof slotId !== 'string' || !slotId) {
      throw new AppError(400, 'slotId is required', { code: 'BAD_SLOT' });
    }
    const result = await pickupService.reserve(slotId, sessionId);
    if (result.outcome === 'SLOT_NOT_FOUND') {
      throw new AppError(404, 'Slot not found', { code: 'SLOT_NOT_FOUND' });
    }
    if (result.outcome === 'FULL') {
      throw new AppError(409, 'This pickup slot is full', { code: 'SLOT_FULL' });
    }
    if (result.outcome === 'ALREADY_HELD') {
      throw new AppError(409, 'You already have a pending pickup reservation', { code: 'ALREADY_HELD' });
    }
    res.status(201).json({ bookingId: result.bookingId, slotId, status: 'HELD' });
  } catch (err) {
    next(err);
  }
});

// Customer: link a HELD booking to the order the customer is about to pay.
// Verifies same-session ownership of BOTH booking and order; never touches capture.
router.post('/pickup/link', requireSession, async (req, res, next) => {
  try {
    const { sessionId } = req.session!;
    const bookingId = req.body?.bookingId;
    const orderId = req.body?.orderId;
    if (typeof bookingId !== 'string' || !bookingId || typeof orderId !== 'string' || !orderId) {
      throw new AppError(400, 'bookingId and orderId are required', { code: 'BAD_LINK' });
    }
    const outcome = await pickupService.link(bookingId, orderId, sessionId);
    if (outcome === 'NOT_FOUND') throw new AppError(404, 'Booking or order not found', { code: 'NOT_FOUND' });
    if (outcome === 'FORBIDDEN') throw new AppError(403, 'Not your booking or order', { code: 'FORBIDDEN' });
    if (outcome === 'MISMATCH') {
      throw new AppError(409, 'Booking is not in a linkable state', { code: 'LINK_MISMATCH' });
    }
    res.json({ bookingId, orderId, status: outcome === 'CONFIRMED' ? 'CONFIRMED' : 'HELD' });
  } catch (err) {
    next(err);
  }
});

// Customer: release a held reservation (capacity freed). Idempotent.
router.post('/pickup/release', requireSession, async (req, res, next) => {
  try {
    const { sessionId } = req.session!;
    const bookingId = req.body?.bookingId;
    if (typeof bookingId !== 'string' || !bookingId) {
      throw new AppError(400, 'bookingId is required', { code: 'BAD_BOOKING' });
    }
    const outcome = await pickupService.release(bookingId, sessionId);
    if (outcome === 'NOT_FOUND') throw new AppError(404, 'Booking not found', { code: 'NOT_FOUND' });
    if (outcome === 'FORBIDDEN') throw new AppError(403, 'Not your booking', { code: 'FORBIDDEN' });
    res.json({ bookingId, status: outcome });
  } catch (err) {
    next(err);
  }
});

// Merchant: read the pickup plan (slots + bookings). Server-owned; merchant UI must not recompute.
router.get('/pickup/plan', requireDashboardAccess, async (_req, res, next) => {
  try {
    const plan = await pickupService.getMerchantPlan();
    res.json({
      slots: plan.map(({ slot, bookings }) => ({
        ...formatSlot(slot),
        bookings: bookings.map((b) => ({
          id: b.id,
          orderId: b.orderId ?? null,
          sessionId: b.sessionId,
          status: b.status,
          expiresAt: b.expiresAt.toISOString(),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Merchant: create a pickup slot (server sets capacity; never trusted from client).
router.post('/pickup/slots', requireDashboardAccess, async (req, res, next) => {
  try {
    const day = req.body?.day;
    const startTs = req.body?.startTs;
    const endTs = req.body?.endTs;
    const capacity = req.body?.capacity;
    if (typeof day !== 'string' || !DAY_RE.test(day)) {
      throw new AppError(400, 'day is required (YYYY-MM-DD)', { code: 'BAD_DAY' });
    }
    if (typeof startTs !== 'string' || !ISO_RE.test(startTs)) {
      throw new AppError(400, 'startTs must be an ISO timestamp', { code: 'BAD_START' });
    }
    if (typeof endTs !== 'string' || !ISO_RE.test(endTs)) {
      throw new AppError(400, 'endTs must be an ISO timestamp', { code: 'BAD_END' });
    }
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 0) {
      throw new AppError(400, 'capacity must be a non-negative integer', { code: 'BAD_CAPACITY' });
    }
    const start = new Date(startTs);
    const end = new Date(endTs);
    if (start.getTime() >= end.getTime()) {
      throw new AppError(400, 'startTs must be before endTs', { code: 'BAD_RANGE' });
    }
    const id = `slot-${day}-${start.getTime()}`;
    await pickupService.createSlot({ id, day, startTs: start, endTs: end, capacity: cap });
    res.status(201).json(formatSlot({
      id,
      day,
      startTs: start,
      endTs: end,
      capacity: cap,
      reservedCount: 0,
    }));
  } catch (err) {
    next(err);
  }
});

export default router;

/// Pickup planning support (parity with the Web storefront and the backend's
/// `apps/backend/src/routes/pickup.ts`).
///
/// The server owns capacity and remaining-slot math; the client only renders
/// what the server returns and passes back slot/booking ids.
library;

/// One pickup slot (`GET /api/pickup/availability`). `remaining` is computed
/// server-side (`capacity - reservedCount`) and is never derived on the client.
class PickupSlot {
  final String id;
  final String day;
  final String startTs;
  final String endTs;
  final int capacity;
  final int reservedCount;
  final int remaining;

  const PickupSlot({
    required this.id,
    required this.day,
    required this.startTs,
    required this.endTs,
    required this.capacity,
    required this.reservedCount,
    required this.remaining,
  });

  factory PickupSlot.fromJson(Map<String, dynamic> json) => PickupSlot(
    id: json['id'] as String? ?? '',
    day: json['day'] as String? ?? '',
    startTs: json['startTs'] as String? ?? '',
    endTs: json['endTs'] as String? ?? '',
    capacity: (json['capacity'] as num?)?.toInt() ?? 0,
    reservedCount: (json['reservedCount'] as num?)?.toInt() ?? 0,
    remaining: (json['remaining'] as num?)?.toInt() ?? 0,
  );

  bool get isFull => remaining <= 0;
}

/// A pickup reservation (`POST /api/pickup/reserve` and `POST /api/pickup/link`).
class PickupBooking {
  final String bookingId;
  final String slotId;

  /// `HELD` until linked to an order, then `CONFIRMED`.
  final String status;

  const PickupBooking({
    required this.bookingId,
    required this.slotId,
    required this.status,
  });

  factory PickupBooking.fromJson(Map<String, dynamic> json) => PickupBooking(
    bookingId: json['bookingId'] as String? ?? '',
    slotId: json['slotId'] as String? ?? '',
    status: json['status'] as String? ?? 'HELD',
  );
}

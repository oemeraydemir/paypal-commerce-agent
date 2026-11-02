/// Customer-facing refund support (parity with the Web storefront's refund
/// block and the backend's `apps/backend/src/routes/refund-requests.ts`).
///
/// All values are customer-safe views: no internal errors, no PayPal ids and
/// no proposer internals are ever exposed here. The backend is the sole
/// authority — this model only mirrors what the server sends.
library;

/// The reason codes a shopper may select when requesting a refund.
///
/// Mirrors `CUSTOMER_REASONS` in `apps/backend/src/routes/refund-requests.ts`
/// exactly, so a value sent here is always accepted by the server.
const List<String> kRefundReasons = <String>[
  'wrong_item',
  'not_as_described',
  'duplicate_charge',
  'changed_mind',
  'other',
];

/// Customer-safe view of a single refund request.
///
/// `status` is one of the customer-facing statuses the backend returns:
/// `UNDER_REVIEW`, `BEING_PROCESSED`, `REFUNDED` or `DECLINED`.
class RefundView {
  final String id;
  final String status;
  final int amountMinor;
  final String currency;

  /// ISO-8601 timestamps; null until the server fills them in.
  final String? requestedAt;
  final String? decidedAt;

  const RefundView({
    required this.id,
    required this.status,
    required this.amountMinor,
    required this.currency,
    this.requestedAt,
    this.decidedAt,
  });

  /// Tolerant of a missing/partial payload so a malformed server reply never
  /// crashes the receipt UI.
  factory RefundView.fromJson(Map<String, dynamic> json) => RefundView(
    id: json['id'] as String? ?? '',
    status: json['status'] as String? ?? 'UNDER_REVIEW',
    amountMinor: (json['amountMinor'] as num?)?.toInt() ?? 0,
    currency: json['currency'] as String? ?? 'EUR',
    requestedAt: json['requestedAt'] as String?,
    decidedAt: json['decidedAt'] as String?,
  );

  bool get isActive =>
      status == 'UNDER_REVIEW' || status == 'BEING_PROCESSED';
}

/// Customer-safe refund status for a single order (`GET /api/orders/:id/refund-status`).
class RefundStatusView {
  final String orderId;
  final int refundableMinor;
  final String currency;
  final List<RefundView> refunds;

  const RefundStatusView({
    required this.orderId,
    required this.refundableMinor,
    required this.currency,
    required this.refunds,
  });

  factory RefundStatusView.fromJson(Map<String, dynamic> json) =>
      RefundStatusView(
        orderId: json['orderId'] as String? ?? '',
        refundableMinor: (json['refundableMinor'] as num?)?.toInt() ?? 0,
        currency: json['currency'] as String? ?? 'EUR',
        refunds: (json['refunds'] as List? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(RefundView.fromJson)
            .toList(),
      );

  /// True when the shopper may still submit a refund request for this order.
  bool get canRequest => refundableMinor > 0 && !hasActiveRequest;

  /// True when a request is already under review / being processed.
  bool get hasActiveRequest => refunds.any((r) => r.isActive);
}

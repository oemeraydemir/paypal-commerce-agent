/// Result of `POST /api/orders/create`.
class OrderCreateResult {
  final String orderId;
  final String paypalOrderId;
  final String status;
  final String origin;
  final int totalMinor;
  final String totalFormatted;
  final String currency;
  final String? approvalUrl;

  OrderCreateResult({
    required this.orderId,
    required this.paypalOrderId,
    required this.status,
    required this.origin,
    required this.totalMinor,
    required this.totalFormatted,
    required this.currency,
    required this.approvalUrl,
  });

  factory OrderCreateResult.fromJson(Map<String, dynamic> json) =>
      OrderCreateResult(
        orderId: json['orderId'] as String,
        paypalOrderId: json['paypalOrderId'] as String,
        status: json['status'] as String,
        origin: json['origin'] as String,
        totalMinor: json['totalMinor'] as int,
        totalFormatted: json['totalFormatted'] as String,
        currency: json['currency'] as String,
        approvalUrl: json['approvalUrl'] as String?,
      );

  double get total => totalMinor / 100.0;
}

/// Result of `POST /api/orders/:orderId/capture`.
class OrderCaptureResult {
  final String orderId;
  final String status;
  final String paypalCaptureId;
  final String? paypalStatus;

  OrderCaptureResult({
    required this.orderId,
    required this.status,
    required this.paypalCaptureId,
    required this.paypalStatus,
  });

  factory OrderCaptureResult.fromJson(Map<String, dynamic> json) =>
      OrderCaptureResult(
        orderId: json['orderId'] as String,
        status: json['status'] as String,
        paypalCaptureId: json['paypalCaptureId'] as String,
        paypalStatus: json['paypalStatus'] as String?,
      );
}

/// Result of `GET /api/health`.
class HealthStatus {
  final String status;
  final bool paypalEnabled;
  final bool aiEnabled;
  final String paypalEnvironment;

  HealthStatus({
    required this.status,
    required this.paypalEnabled,
    required this.aiEnabled,
    required this.paypalEnvironment,
  });

  factory HealthStatus.fromJson(Map<String, dynamic> json) => HealthStatus(
    status: json['status'] as String,
    paypalEnabled:
        (json['paypal'] as Map<String, dynamic>? ??
                const <String, dynamic>{})['enabled']
            as bool? ??
        false,
    aiEnabled:
        (json['ai'] as Map<String, dynamic>? ??
                const <String, dynamic>{})['enabled']
            as bool? ??
        false,
    paypalEnvironment:
        (json['paypal'] as Map<String, dynamic>? ??
                const <String, dynamic>{})['environment']
            as String? ??
        'sandbox',
  );
}

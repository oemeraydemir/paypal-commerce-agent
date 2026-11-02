import 'dart:convert';

/// Structured counter parsed from a backend error body (`{ error, details }`).
///
/// All fields are optional and only populated when the server actually sent
/// them. Kept pure-Dart (no Flutter import) so it can be unit-tested on the VM
/// and so the HTTP client stays thin. `retryable` etc. are advisory only —
/// the client never auto-retries and never fabricates a payment outcome.
class ErrorBodyDetails {
  final String message;
  final bool? settled;
  final String? code;
  final String? paypalIssue;
  final bool retryable;
  final int retryAfterSeconds;
  final bool cartSaved;
  final String? suggestion;
  final String? alternativePayment;

  const ErrorBodyDetails({
    this.message = '',
    this.settled,
    this.code,
    this.paypalIssue,
    this.retryable = false,
    this.retryAfterSeconds = 0,
    this.cartSaved = false,
    this.suggestion,
    this.alternativePayment,
  });
}

/// Parses a raw backend error body. The Checkout Rescue fields
/// (`code`, `paypalIssue`, `retryable`, `retryAfterSeconds`, `cartSaved`,
/// `suggestion`, `alternativePayment`) and the verified-completion flag
/// (`details.settled`) live under `details`, but top-level fallbacks are
/// accepted too for robustness.
ErrorBodyDetails parseErrorBody(String rawBody) {
  final d = <String, dynamic>{};
  if (rawBody.trim().isNotEmpty) {
    try {
      final b = jsonDecode(rawBody);
      if (b is Map) d.addAll(Map<String, dynamic>.from(b));
    } catch (_) {
      // non-JSON body: leave the map empty -> generic message
    }
  }
  final detailsRaw = d['details'];
  final inner = detailsRaw is Map ? detailsRaw : const <String, dynamic>{};
  Object? pick(String key) => d[key] ?? inner[key];

  final settled = pick('settled');
  final retryAfter = pick('retryAfterSeconds');
  return ErrorBodyDetails(
    message: pick('error')?.toString() ?? pick('message')?.toString() ?? '',
    settled: settled is bool ? settled : null,
    code: pick('code') is String ? pick('code') as String : null,
    paypalIssue: pick('paypalIssue') is String
        ? pick('paypalIssue') as String
        : null,
    retryable: pick('retryable') == true,
    retryAfterSeconds: retryAfter is num ? retryAfter.toInt() : 0,
    cartSaved: pick('cartSaved') == true,
    suggestion: pick('suggestion') is String
        ? pick('suggestion') as String
        : null,
    alternativePayment: pick('alternativePayment') is String
        ? pick('alternativePayment') as String
        : null,
  );
}

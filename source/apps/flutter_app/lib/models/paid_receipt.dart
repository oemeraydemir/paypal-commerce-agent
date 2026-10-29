import 'package:flutter_app/models/chat_message.dart' show ChatMode;

/// Who prepared the cart that was paid for. Drives the "who did what" block:
/// an AI row is shown only when an assistant really prepared the cart.
enum ReceiptCartSource { ai, ruleBased, manual }

/// Decides the [ReceiptCartSource] from what the chat actually produced.
///
/// A rule-based reply is never presented as AI, and a cart the shopper built by
/// hand has no assistant row at all.
ReceiptCartSource receiptSourceFor({
  required bool hadPreparedCart,
  required ChatMode? mode,
}) {
  if (!hadPreparedCart) return ReceiptCartSource.manual;
  return mode == ChatMode.ruleBased
      ? ReceiptCartSource.ruleBased
      : ReceiptCartSource.ai;
}

/// One purchased line on the receipt. [lineTotalMinor] is `null` while the
/// server has not yet confirmed the price (it is filled in from the signed
/// Cart Mandate, which is server-authoritative).
class ReceiptLine {
  final String productId;
  final String? name;
  final int quantity;
  final int? lineTotalMinor;

  const ReceiptLine({
    required this.productId,
    required this.quantity,
    this.name,
    this.lineTotalMinor,
  });

  ReceiptLine copyWith({String? name, int? lineTotalMinor}) => ReceiptLine(
    productId: productId,
    quantity: quantity,
    name: name ?? this.name,
    lineTotalMinor: lineTotalMinor ?? this.lineTotalMinor,
  );
}

/// The part of `GET /api/orders/:id/mandate` the receipt needs.
class MandateSummary {
  final String orderId;
  final String signature;
  final List<ReceiptLine> lines;
  final int? totalMinor;
  final String? currency;

  const MandateSummary({
    required this.orderId,
    required this.signature,
    required this.lines,
    this.totalMinor,
    this.currency,
  });

  /// Returns `null` for a missing or malformed payload: the receipt is an extra
  /// and must never break because an older/newer backend answered differently.
  static MandateSummary? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final signature = raw['signature'];
    final mandate = raw['mandate'];
    if (signature is! String || signature.isEmpty || mandate is! Map) {
      return null;
    }
    final orderId = mandate['orderId'];
    if (orderId is! String || orderId.isEmpty) return null;
    final rawItems = mandate['items'];
    final lines = <ReceiptLine>[];
    if (rawItems is List) {
      for (final item in rawItems) {
        if (item is! Map) continue;
        final id = item['productId'];
        final qty = item['quantity'];
        if (id is! String || qty is! num) continue;
        lines.add(
          ReceiptLine(
            productId: id,
            quantity: qty.toInt(),
            lineTotalMinor: (item['lineTotalMinor'] as num?)?.toInt(),
          ),
        );
      }
    }
    return MandateSummary(
      orderId: orderId,
      signature: signature,
      lines: lines,
      totalMinor: (mandate['totalMinor'] as num?)?.toInt(),
      currency: mandate['currency'] is String
          ? mandate['currency'] as String
          : null,
    );
  }
}

/// What the shopper sees after a confirmed payment.
class PaidReceipt {
  final String orderId;

  /// PayPal capture id, or `null` when the server did not return one (for
  /// example after an "already completed" conflict). Never invented.
  final String? captureId;
  final List<ReceiptLine> lines;
  final String totalFormatted;
  final int? totalMinor;
  final String currency;
  final ReceiptCartSource source;
  final DateTime paidAt;

  /// Public Cart Mandate verification link (the QR code target). `null` until
  /// the signed mandate has been fetched; the receipt is complete without it.
  final String? verifyLink;

  const PaidReceipt({
    required this.orderId,
    required this.lines,
    required this.totalFormatted,
    required this.currency,
    required this.source,
    required this.paidAt,
    this.captureId,
    this.totalMinor,
    this.verifyLink,
  });

  /// Completes the receipt with the server-authoritative mandate data.
  PaidReceipt withMandate(MandateSummary mandate, String baseUrl) {
    final names = {for (final l in lines) l.productId: l.name};
    final merged = mandate.lines.isEmpty
        ? lines
        : mandate.lines
              .map((l) => l.copyWith(name: names[l.productId]))
              .toList(growable: false);
    return PaidReceipt(
      orderId: orderId,
      captureId: captureId,
      lines: merged,
      totalFormatted: totalFormatted,
      totalMinor: mandate.totalMinor ?? totalMinor,
      currency: mandate.currency ?? currency,
      source: source,
      paidAt: paidAt,
      verifyLink: mandateVerifyLink(baseUrl, orderId, mandate.signature),
    );
  }
}

/// `<base>/verify.html#<orderId>.<signature>`: the page checks the signed Cart
/// Mandate server-side. The part after `#` is never sent in a request line.
String mandateVerifyLink(String baseUrl, String orderId, String signature) {
  final base = baseUrl.replaceFirst(RegExp(r'/+$'), '');
  return '$base/verify.html#$orderId.$signature';
}

/// `ab••••ef` style masking for a capture id; short ids are fully hidden.
String maskCaptureId(String id) {
  if (id.length <= 8) return '••••';
  return '${id.substring(0, 4)}••••${id.substring(id.length - 4)}';
}

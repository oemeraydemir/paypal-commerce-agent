/// AI Transaction Passport: a read-only explanation of ONE prepared cart, produced by the server.
///
/// Nothing here is computed locally. The client only parses and draws what the backend sent
/// (prices, limit position, approval threshold, who acts at each step). [paymentAuthority] is a
/// constant because the server contract guarantees it: the shopper always holds it.
class PassportLine {
  const PassportLine({
    required this.productId,
    required this.name,
    required this.quantity,
    required this.unitPriceMinor,
    required this.lineTotalMinor,
  });

  /// Stable product identifier (kept from the canonical model) so callers can match
  /// a line back to the menu product without relying on the display name.
  final String productId;
  final String name;
  final int quantity;
  final int unitPriceMinor;
  final int lineTotalMinor;
}

class PassportMandate {
  const PassportMandate({
    required this.maxPerPurchaseMinor,
    required this.approvalThresholdMinor,
    required this.cartMinor,
    required this.remainingMinor,
    required this.usedPercent,
    required this.thresholdPercent,
    required this.dailyRemainingMinor,
  });

  final int maxPerPurchaseMinor;
  final int approvalThresholdMinor;
  final int cartMinor;
  final int remainingMinor;

  /// 0..100, cart as a share of the per-purchase limit (server-computed).
  final int usedPercent;

  /// 0..100, where the approval threshold sits on the same bar (server-computed).
  final int thresholdPercent;
  final int dailyRemainingMinor;
}

class PassportStep {
  const PassportStep({
    required this.key,
    required this.state,
    required this.actor,
  });

  /// prepared | prices | limit | approval | paypal | verify
  final String key;

  /// done | pending | blocked
  final String state;

  /// ai | server | shopper | paypal
  final String actor;
}

class TransactionPassport {
  const TransactionPassport({
    required this.totalMinor,
    required this.currency,
    required this.lines,
    required this.mandate,
    required this.decision,
    required this.withinLimit,
    required this.requiresShopperApproval,
    required this.steps,
    required this.notices,
  });

  final int totalMinor;
  final String currency;
  final List<PassportLine> lines;
  final PassportMandate mandate;

  /// AUTO_ALLOW | REQUIRE_CONFIRMATION | BLOCK
  final String decision;
  final bool withinLimit;
  final bool requiresShopperApproval;
  final List<PassportStep> steps;

  /// sample-menu-data | allergen-unverified | sandbox-only
  final List<String> notices;

  /// Always the shopper. Never read from JSON on purpose.
  String get paymentAuthority => 'shopper';
  bool get agentCanPay => false;
  bool get isBlocked => decision == 'BLOCK';

  /// Returns null when [json] is not a transaction passport (older backend, missing field).
  static TransactionPassport? tryParse(Object? json) {
    if (json is! Map || json['kind'] != 'transaction-passport') return null;
    try {
      final m = json['mandate'];
      final c = json['control'];
      if (m is! Map || c is! Map) return null;
      return TransactionPassport(
        totalMinor: _int(json['totalMinor']),
        currency: json['currency'] is String ? json['currency'] as String : 'EUR',
        lines: _list(json['lines'])
            .map(
              (e) => PassportLine(
                productId: _str(e['productId']),
                name: _str(e['name']),
                quantity: _int(e['quantity']),
                unitPriceMinor: _int(e['unitPriceMinor']),
                lineTotalMinor: _int(e['lineTotalMinor']),
              ),
            )
            .toList(growable: false),
        mandate: PassportMandate(
          maxPerPurchaseMinor: _int(m['maxPerPurchaseMinor']),
          approvalThresholdMinor: _int(m['approvalThresholdMinor']),
          cartMinor: _int(m['cartMinor']),
          remainingMinor: _int(m['remainingMinor']),
          usedPercent: _int(m['usedPercent']).clamp(0, 100),
          thresholdPercent: _int(m['thresholdPercent']).clamp(0, 100),
          dailyRemainingMinor: _int(m['dailyRemainingMinor']),
        ),
        decision: _str(c['decision']),
        withinLimit: c['withinLimit'] == true,
        requiresShopperApproval: c['requiresShopperApproval'] == true,
        steps: _list(json['steps'])
            .map(
              (e) => PassportStep(
                key: _str(e['key']),
                state: _str(e['state']),
                actor: _str(e['actor']),
              ),
            )
            .toList(growable: false),
        notices: (json['notices'] is List)
            ? (json['notices'] as List).whereType<String>().toList(growable: false)
            : const <String>[],
      );
    } catch (_) {
      return null;
    }
  }

  static int _int(Object? v) => v is num ? v.toInt() : 0;
  static String _str(Object? v) => v is String ? v : '';
  static List<Map> _list(Object? v) =>
      v is List ? v.whereType<Map>().toList(growable: false) : const <Map>[];
}

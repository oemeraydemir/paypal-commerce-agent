/// An order line item sent to `POST /api/orders/create`.
///
/// The backend validates the product id against the catalog and computes the
/// authoritative total — the client only supplies product id + quantity.
class OrderItem {
  final String id;
  final int quantity;

  OrderItem({required this.id, required this.quantity});

  // The backend (validateOrderItems) reads `productId`; `id` is rejected with 400.
  Map<String, dynamic> toJson() => {'productId': id, 'quantity': quantity};
}

/// A single line inside an AI-prepared cart (`prepare_cart` tool result).
class CartLine {
  final String productId;
  final String name;
  final int quantity;
  final int unitPriceMinor;
  final String unitPriceFormatted;
  final int lineTotalMinor;
  final String lineTotalFormatted;

  const CartLine({
    required this.productId,
    required this.name,
    required this.quantity,
    required this.unitPriceMinor,
    required this.unitPriceFormatted,
    required this.lineTotalMinor,
    required this.lineTotalFormatted,
  });

  /// Tolerant of missing/empty fields: the server is authoritative, but a
  /// partial payload must never crash the chat UI.
  factory CartLine.fromJson(Map<String, dynamic> json) => CartLine(
    productId: json['productId'] as String? ?? '',
    name: json['name'] as String? ?? '',
    quantity: (json['quantity'] as num?)?.toInt() ?? 0,
    unitPriceMinor: (json['unitPriceMinor'] as num?)?.toInt() ?? 0,
    unitPriceFormatted: json['unitPriceFormatted'] as String? ?? '',
    lineTotalMinor: (json['lineTotalMinor'] as num?)?.toInt() ?? 0,
    lineTotalFormatted: json['lineTotalFormatted'] as String? ?? '',
  );

  double get lineTotal => lineTotalMinor / 100.0;
}

/// The policy verdict the backend attached to a prepared cart.
///
/// Mirrors `PolicyDecision` in `apps/backend/src/policy/domain.ts`. [unknown]
/// covers a missing/renamed value: the client must never assume a cart was
/// auto-approved just because it could not read the decision.
enum PolicyDecision { autoAllow, requireConfirmation, block, unknown }

/// Parses the backend `policyDecision` value without throwing.
PolicyDecision policyDecisionFromJson(Object? value) {
  switch (value) {
    case 'AUTO_ALLOW':
      return PolicyDecision.autoAllow;
    case 'REQUIRE_CONFIRMATION':
      return PolicyDecision.requireConfirmation;
    case 'BLOCK':
      return PolicyDecision.block;
    default:
      return PolicyDecision.unknown;
  }
}

/// One rule a prepared cart broke.
///
/// The backend sends `{type, message}` in `preparedCart.policyViolations`
/// (see `buildPolicyOutcome` in `src/policy/context-builder.ts`). `type` is a
/// stable machine code (`MAX_PURCHASE_EXCEEDED`, `CONFIRMATION_THRESHOLD_EXCEEDED`,
/// …); `message` is human-readable and must be shown verbatim rather than
/// re-worded by the client.
class PolicyViolation {
  final String type;
  final String message;

  const PolicyViolation({required this.type, required this.message});

  factory PolicyViolation.fromJson(Map<String, dynamic> json) => PolicyViolation(
    type: json['type'] as String? ?? '',
    message: json['message'] as String? ?? '',
  );
}

/// The cart prepared by the AI agent. When [checkoutReady] is true the UI may
/// offer a "Proceed to checkout" action. The AI itself never touches payments.
class PreparedCart {
  final List<CartLine> items;
  final int totalMinor;
  final String totalFormatted;
  final String currency;
  final String message;

  /// Server-side cart identifier (used for logging/support, not for ordering).
  final String cartId;

  /// Policy verdict for this cart. [PolicyDecision.unknown] when the backend
  /// omitted the field.
  final PolicyDecision policyDecision;

  /// Rules this cart broke; empty when the policy passed.
  final List<PolicyViolation> policyViolations;

  /// True when a human must explicitly approve before payment. This is the
  /// server's own flag (`decision === 'REQUIRE_CONFIRMATION'`) and is never
  /// derived on the client, so a policy change needs no client release.
  final bool requiresExplicitApproval;

  /// True when the backend suggests retrying with a different cart (set for
  /// `BLOCK`).
  final bool retrySuggested;

  /// Server-provided explanation for the decision. Shown verbatim.
  final String reason;

  const PreparedCart({
    required this.items,
    required this.totalMinor,
    required this.totalFormatted,
    required this.currency,
    required this.message,
    this.cartId = '',
    this.policyDecision = PolicyDecision.unknown,
    this.policyViolations = const <PolicyViolation>[],
    this.requiresExplicitApproval = false,
    this.retrySuggested = false,
    this.reason = '',
  });

  /// Tolerant of missing/empty fields (and of malformed list entries) so a
  /// partial cart payload degrades gracefully instead of throwing.
  factory PreparedCart.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
    final rawViolations = json['policyViolations'];
    return PreparedCart(
      items: rawItems is List
          ? rawItems
                .whereType<Map<String, dynamic>>()
                .map(CartLine.fromJson)
                .toList()
          : const <CartLine>[],
      totalMinor: (json['totalMinor'] as num?)?.toInt() ?? 0,
      totalFormatted: json['totalFormatted'] as String? ?? '',
      currency: json['currency'] as String? ?? 'EUR',
      message: json['message'] as String? ?? '',
      cartId: json['cartId'] as String? ?? '',
      policyDecision: policyDecisionFromJson(json['policyDecision']),
      policyViolations: rawViolations is List
          ? rawViolations
                .whereType<Map<String, dynamic>>()
                .map(PolicyViolation.fromJson)
                .toList()
          : const <PolicyViolation>[],
      requiresExplicitApproval:
          json['requiresExplicitApproval'] as bool? ?? false,
      retrySuggested: json['retrySuggested'] as bool? ?? false,
      reason: json['reason'] as String? ?? '',
    );
  }

  double get total => totalMinor / 100.0;

  /// True when the policy forbids this cart outright.
  bool get isBlocked => policyDecision == PolicyDecision.block;

  /// True when at least one policy rule was broken.
  bool get hasPolicyViolations => policyViolations.isNotEmpty;

  List<OrderItem> toOrderItems() => items
      .map((e) => OrderItem(id: e.productId, quantity: e.quantity))
      .toList();
}

/// Result of `POST /api/policy/preview` for the current cart (side-effect free).
class PolicyPreview {
  final bool empty;
  final PolicyDecision decision;
  final String? reason;

  /// Server-enforced per-purchase policy limit from `limits.maxPerPurchaseMinor`.
  /// This is advisory display data; checkout re-evaluates policy on the server.
  final int? maxPerPurchaseMinor;
  final String currency;

  const PolicyPreview({
    required this.empty,
    required this.decision,
    this.reason,
    this.maxPerPurchaseMinor,
    this.currency = 'EUR',
  });

  factory PolicyPreview.fromJson(Map<String, dynamic> json) {
    final rawLimits = json['limits'];
    final limits = rawLimits is Map ? rawLimits : const <String, dynamic>{};
    final rawLimit = limits['maxPerPurchaseMinor'];
    final rawCurrency = limits['currency'];
    return PolicyPreview(
      empty: json['empty'] == true,
      decision: policyDecisionFromJson(json['decision']),
      reason: json['reason'] as String?,
      maxPerPurchaseMinor: rawLimit is num ? rawLimit.toInt() : null,
      currency: rawCurrency is String ? rawCurrency : 'EUR',
    );
  }
}

/// An order line item sent to `POST /api/orders/create`.
///
/// The backend validates the product id against the catalog and computes the
/// authoritative total — the client only supplies product id + quantity.
class OrderItem {
  final String id;
  final int quantity;

  OrderItem({required this.id, required this.quantity});

  Map<String, dynamic> toJson() => {'id': id, 'quantity': quantity};
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

/// The cart prepared by the AI agent. When [checkoutReady] is true the UI may
/// offer a "Proceed to checkout" action. The AI itself never touches payments.
class PreparedCart {
  final List<CartLine> items;
  final int totalMinor;
  final String totalFormatted;
  final String currency;
  final String message;

  const PreparedCart({
    required this.items,
    required this.totalMinor,
    required this.totalFormatted,
    required this.currency,
    required this.message,
  });

  /// Tolerant of missing/empty fields (and of malformed list entries) so a
  /// partial cart payload degrades gracefully instead of throwing.
  factory PreparedCart.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'];
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
    );
  }

  double get total => totalMinor / 100.0;

  List<OrderItem> toOrderItems() => items
      .map((e) => OrderItem(id: e.productId, quantity: e.quantity))
      .toList();
}

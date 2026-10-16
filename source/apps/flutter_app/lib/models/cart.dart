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

  factory CartLine.fromJson(Map<String, dynamic> json) => CartLine(
    productId: json['productId'] as String,
    name: json['name'] as String,
    quantity: json['quantity'] as int,
    unitPriceMinor: json['unitPriceMinor'] as int,
    unitPriceFormatted: json['unitPriceFormatted'] as String,
    lineTotalMinor: json['lineTotalMinor'] as int,
    lineTotalFormatted: json['lineTotalFormatted'] as String,
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

  factory PreparedCart.fromJson(Map<String, dynamic> json) => PreparedCart(
    items: (json['items'] as List? ?? const <dynamic>[])
        .map((e) => CartLine.fromJson(e as Map<String, dynamic>))
        .toList(),
    totalMinor: json['totalMinor'] as int,
    totalFormatted: json['totalFormatted'] as String,
    currency: json['currency'] as String,
    message: json['message'] as String? ?? '',
  );

  double get total => totalMinor / 100.0;

  List<OrderItem> toOrderItems() => items
      .map((e) => OrderItem(id: e.productId, quantity: e.quantity))
      .toList();
}

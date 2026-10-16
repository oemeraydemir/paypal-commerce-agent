/// A catalog product as returned by `GET /api/catalog`.
///
/// Prices are expressed in minor units (e.g. cents) by the backend; the UI
/// renders them via [priceFormatted]. The backend remains the source of truth
/// for pricing — the client never computes authoritative totals.
class Product {
  final String id;
  final String name;
  final String description;
  final int priceMinor;
  final String currency;
  final String category;
  final List<String> tags;
  final List<String> dietary;
  final List<String> occasion;
  final bool available;

  const Product({
    required this.id,
    required this.name,
    required this.description,
    required this.priceMinor,
    required this.currency,
    required this.category,
    required this.tags,
    required this.dietary,
    required this.occasion,
    required this.available,
  });

  factory Product.fromJson(Map<String, dynamic> json) => Product(
    id: json['id'] as String,
    name: json['name'] as String,
    description: json['description'] as String,
    priceMinor: json['priceMinor'] as int,
    currency: json['currency'] as String,
    category: json['category'] as String,
    tags: List<String>.from(json['tags'] as List? ?? const <String>[]),
    dietary: List<String>.from(json['dietary'] as List? ?? const <String>[]),
    occasion: List<String>.from(json['occasion'] as List? ?? const <String>[]),
    available: json['available'] as bool? ?? true,
  );

  double get price => priceMinor / 100.0;

  String get priceFormatted => '€${price.toStringAsFixed(2)}';
}

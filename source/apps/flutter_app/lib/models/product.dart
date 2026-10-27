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

  /// Tolerant of missing/empty fields so a partial catalog entry does not
  /// crash the whole menu.
  factory Product.fromJson(Map<String, dynamic> json) => Product(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    description: json['description'] as String? ?? '',
    priceMinor: (json['priceMinor'] as num?)?.toInt() ?? 0,
    currency: json['currency'] as String? ?? 'EUR',
    category: json['category'] as String? ?? '',
    tags: _stringList(json['tags']),
    dietary: _stringList(json['dietary']),
    occasion: _stringList(json['occasion']),
    available: json['available'] as bool? ?? true,
  );

  double get price => priceMinor / 100.0;

  String get priceFormatted => '€${price.toStringAsFixed(2)}';
}

List<String> _stringList(Object? value) =>
    value is List ? value.whereType<String>().toList() : const <String>[];

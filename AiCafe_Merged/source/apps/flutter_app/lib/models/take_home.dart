/// One "Take it home" suggestion from `POST /api/discover/take-home` (Channel3, via our server).
/// Outbound retailer link only: never part of the PayPal cart or the spending allowance.
class TakeHomeItem {
  final String id;
  final String title;
  final String? brand;
  final String? merchantDomain;
  final num? price;
  final String? currency;
  final String url;

  const TakeHomeItem({
    required this.id,
    required this.title,
    required this.url,
    this.brand,
    this.merchantDomain,
    this.price,
    this.currency,
  });

  /// Only https links are accepted; anything else is dropped (the server already filters, this is defence in depth).
  static TakeHomeItem? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final url = raw['url'];
    final title = raw['title'];
    final id = raw['id'];
    if (url is! String || title is! String || id is! String) return null;
    final uri = Uri.tryParse(url);
    if (uri == null || uri.scheme != 'https') return null;
    String? s(Object? v) => v is String && v.isNotEmpty ? v : null;
    return TakeHomeItem(
      id: id,
      title: title,
      url: url,
      brand: s(raw['brand']),
      merchantDomain: s(raw['merchantDomain']),
      price: raw['price'] is num ? raw['price'] as num : null,
      currency: s(raw['currency']),
    );
  }
}

class TakeHomeResult {
  final bool enabled;
  final List<TakeHomeItem> items;

  const TakeHomeResult({required this.enabled, required this.items});

  factory TakeHomeResult.fromJson(Map<String, dynamic> json) {
    final raw = json['items'];
    return TakeHomeResult(
      enabled: json['enabled'] == true,
      items: raw is List
          ? raw.map(TakeHomeItem.tryParse).whereType<TakeHomeItem>().toList()
          : const <TakeHomeItem>[],
    );
  }
}

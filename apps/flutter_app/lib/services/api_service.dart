import 'dart:convert';

import 'package:http/http.dart' as http;

import 'package:flutter_app/models/cart.dart';
import 'package:flutter_app/models/order.dart';
import 'package:flutter_app/models/product.dart';
import 'package:flutter_app/models/shopper_preferences.dart';

/// Raised when the backend responds with a non-2xx status.
class ApiException implements Exception {
  final int statusCode;
  final String message;

  ApiException(this.statusCode, this.message);

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Thin HTTP client for the PayPal Commerce Agent backend.
///
/// The client only ever calls the documented REST endpoints. It has no
/// knowledge of PayPal credentials or the PayPal SDK — payments are always
/// initiated server-side. This preserves the security boundary established in
/// the backend (the AI agent prepares carts; the app asks the server to create
/// and capture orders after explicit user confirmation).
class ApiService {
  static const Duration _requestTimeout = Duration(seconds: 15);

  /// Base URL of the commerce-agent backend.
  ///
  /// Override with `--dart-define=API_BASE_URL=...` for a deployed backend,
  /// desktop, web, or a physical device. Android Emulator uses `10.0.2.2`.
  static const String defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  final http.Client _client;
  final String _baseUrl;

  ApiService({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      _baseUrl = (baseUrl ?? defaultBaseUrl).replaceFirst(RegExp(r'/$'), '');

  Map<String, String> get _headers => {'Content-Type': 'application/json'};

  Uri _url(String path) => Uri.parse('$_baseUrl$path');

  Future<List<Product>> getCatalog() async {
    final res = await _client
        .get(_url('/api/catalog'))
        .timeout(_requestTimeout);
    _ensureOk(res, 'getCatalog');
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final products = (body['products'] as List? ?? const <dynamic>[]);
    return products
        .map((e) => Product.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<HealthStatus> getHealth() async {
    final res = await _client.get(_url('/api/health')).timeout(_requestTimeout);
    _ensureOk(res, 'getHealth');
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return HealthStatus.fromJson(body);
  }

  Future<ChatResponse> sendChat({
    required String sessionId,
    required String message,
    ShopperPreferences? preferences,
  }) async {
    final res = await _client
        .post(
          _url('/api/ai/chat'),
          headers: _headers,
          body: jsonEncode({
            'sessionId': sessionId,
            'message': message,
            if (preferences != null) 'preferences': preferences.toJson(),
          }),
        )
        .timeout(_requestTimeout);
    _ensureOk(res, 'sendChat');
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return ChatResponse.fromJson(body);
  }

  Future<void> deleteChat(String sessionId) async {
    final res = await _client
        .delete(_url('/api/ai/chat/$sessionId'))
        .timeout(_requestTimeout);
    // 404 just means there was nothing to clear.
    if (res.statusCode >= 400 && res.statusCode != 404) {
      throw ApiException(res.statusCode, _errMsg(res));
    }
  }

  Future<void> deletePreparedCart(String sessionId) async {
    final res = await _client
        .delete(_url('/api/ai/cart/$sessionId'))
        .timeout(_requestTimeout);
    _ensureOk(res, 'deletePreparedCart');
  }

  Future<OrderCreateResult> createOrder({
    required String sessionId,
    required List<OrderItem> items,
    String? idempotencyKey,
  }) async {
    final headers = <String, String>{..._headers};
    if (idempotencyKey != null) headers['Idempotency-Key'] = idempotencyKey;
    final res = await _client
        .post(
          _url('/api/orders/create'),
          headers: headers,
          body: jsonEncode({
            'sessionId': sessionId,
            'items': items.map((e) => e.toJson()).toList(),
          }),
        )
        .timeout(_requestTimeout);
    _ensureOk(res, 'createOrder');
    return OrderCreateResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<OrderCaptureResult> captureOrder(String orderId) async {
    final res = await _client
        .post(_url('/api/orders/$orderId/capture'), headers: _headers)
        .timeout(_requestTimeout);
    _ensureOk(res, 'captureOrder');
    return OrderCaptureResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  void _ensureOk(http.Response res, String op) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, _errMsg(res, op));
    }
  }

  String _errMsg(http.Response res, [String? op]) {
    try {
      final b = jsonDecode(res.body);
      if (b is Map) {
        if (b['error'] != null) return b['error'].toString();
        if (b['message'] != null) return b['message'].toString();
      }
    } catch (_) {
      // ignore parse errors, fall through to generic message
    }
    return 'HTTP ${res.statusCode}${op != null ? ' ($op)' : ''}';
  }

  void dispose() => _client.close();
}

/// Response of `POST /api/ai/chat`.
class ChatResponse {
  final String sessionId;
  final String response;
  final PreparedCart? preparedCart;
  final bool checkoutReady;
  final int toolRounds;
  final int messageCount;

  ChatResponse({
    required this.sessionId,
    required this.response,
    required this.preparedCart,
    required this.checkoutReady,
    required this.toolRounds,
    required this.messageCount,
  });

  factory ChatResponse.fromJson(Map<String, dynamic> json) => ChatResponse(
    sessionId: json['sessionId'] as String,
    response: json['response'] as String? ?? '',
    preparedCart: json['preparedCart'] == null
        ? null
        : PreparedCart.fromJson(json['preparedCart'] as Map<String, dynamic>),
    checkoutReady: json['checkoutReady'] as bool? ?? false,
    toolRounds: json['toolRounds'] as int? ?? 0,
    messageCount: json['messageCount'] as int? ?? 0,
  );
}
